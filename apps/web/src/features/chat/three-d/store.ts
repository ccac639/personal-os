/**
 * Chat 功能域 —— 3D 工作台 Pinia store
 *
 * 职责：项目 / 资产 CRUD、撤销重做（快照栈）、模式设定、场景设置、
 * 生成简报（mock service）、导入导出、Chat 联动（消息→3D 草稿 / 3D→Chat）。
 * 持久化收敛到 storage.ts；组件不得直接读写 localStorage。
 * 只存结构化数据：绝不存 WebGL 对象 / 纹理 / 文件二进制。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  MAX_UNDO_STEPS,
  NOW,
  PROJECT_TYPE_LABELS,
  defaultCharacterSettings,
  defaultPropSettings,
  defaultWorldSettings,
  seedProjects,
} from './constants';
import {
  addAssetToProject,
  appendHistory,
  assetById,
  buildBriefText,
  briefJson,
  chatDraftText,
  cloneProject,
  cloneTransform,
  createProject,
  deleteAsset,
  draftFromMessageContent,
  duplicateAsset,
  enforceProjectLimit,
  isDraftableMessageContent,
  libraryExportFile,
  mergeImportedProjects,
  parseImportPreview,
  projectExportFile,
  selectableAssets,
  setTransform,
  updateAsset,
  updateBrief,
  updateCharacter,
  updateProp,
  updateProject,
  updateSceneSettings,
  updateWorld,
} from './domain';
import { getThreeDGenerationService } from './service';
import { loadThreeDWorkspace, saveThreeDWorkspace } from './storage';
import { useChatStore } from '../store';
import { downloadTextFile, sanitizeFilename } from '../export';
import { pushToast } from '../toast';
import type { NewProjectInput } from './domain';
import type {
  CameraPresetId,
  HistoryOpKind,
  ThreeDAsset,
  ThreeDDraftFromMessage,
  ThreeDGenerationBrief,
  ThreeDGenerationDraft,
  ThreeDImportPreview,
  ThreeDImportResult,
  ThreeDProject,
  ThreeDProjectType,
  ThreeDUiState,
  ToolMode,
} from './types';

export const useThreeDWorkspaceStore = defineStore('chat-3d-workspace', () => {
  const loaded = loadThreeDWorkspace();

  const projects = ref<ThreeDProject[]>(loaded.projects);
  const activeProjectId = ref<string | null>(loaded.projects[0]?.id ?? null);
  const ui = ref<ThreeDUiState>(loaded.ui);
  const recovered = ref(loaded.recovered);
  const tooNew = ref(loaded.tooNew);

  const past = ref<ThreeDProject[]>([]);
  const future = ref<ThreeDProject[]>([]);

  /** 自动保存状态 */
  const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedAt = ref<number | null>(null);
  const writeFailedFlag = ref(loaded.writeFailed);

  /** 生成草稿（mock service 输出） */
  const generationDraft = ref<ThreeDGenerationDraft | null>(null);
  const generating = ref(false);

  /** 从 Chat 消息创建 3D 项目草稿（弹窗预填） */
  const pendingFromMessage = ref<ThreeDDraftFromMessage | null>(null);

  /** 导入预览（确认前展示） */
  const pendingImport = ref<{ preview: ThreeDImportPreview; projects: ThreeDProject[] } | null>(
    null,
  );

  /* ---------- 派生状态 ---------- */

  const activeProject = computed<ThreeDProject | null>(
    () => projects.value.find((p) => p.id === activeProjectId.value) ?? null,
  );

  const activeAsset = computed<ThreeDAsset | null>(() => {
    const p = activeProject.value;
    if (!p) return null;
    return assetById(p, p.activeAssetId) ?? null;
  });

  const projectCount = computed(() => projects.value.length);
  const canUndo = computed(() => past.value.length > 0);
  const canRedo = computed(() => future.value.length > 0);

  const modeSettings = computed(() => {
    const p = activeProject.value;
    if (!p) return null;
    if (p.type === 'character') return p.character ?? null;
    if (p.type === 'world') return p.world ?? null;
    return p.prop ?? null;
  });

  const isCharacter = computed(() => activeProject.value?.type === 'character');
  const isWorld = computed(() => activeProject.value?.type === 'world');
  const isProp = computed(() => activeProject.value?.type === 'prop');

  const briefText = computed(() => {
    const p = activeProject.value;
    if (!p) return '';
    return ui.value.briefText || buildBriefText(p);
  });

  /* ---------- 自动保存 ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleSave() {
    saveStatus.value = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = saveThreeDWorkspace(projects.value, ui.value);
      if (ok) {
        saveStatus.value = 'saved';
        lastSavedAt.value = NOW();
      } else {
        saveStatus.value = 'error';
        if (!writeFailedFlag.value) {
          writeFailedFlag.value = true;
          pushToast('3D 工作台保存失败：本地存储不可用，更改仅保留在内存中', 'warning');
        }
      }
    }, 250);
  }

  watch([projects, ui], () => scheduleSave(), { deep: true });

  function flushSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const ok = saveThreeDWorkspace(projects.value, ui.value);
    saveStatus.value = ok ? 'saved' : 'error';
    if (ok) lastSavedAt.value = NOW();
  }

  /* ---------- 撤销 / 重做 ---------- */

  /** 变更前快照（撤销栈）；不记录 UI 性变更（选择、面板、搜索） */
  function pushUndo() {
    const p = activeProject.value;
    if (!p) return;
    past.value = [...past.value.slice(-(MAX_UNDO_STEPS - 1)), cloneProject(p)];
    future.value = [];
  }

  function recordOp(kind: HistoryOpKind, label: string, assetId?: string) {
    const p = activeProject.value;
    if (!p) return;
    p.history = appendHistory(p.history, kind, label, assetId);
    p.updatedAt = NOW();
  }

  /** 撤销：把当前状态压入 future，恢复 past 栈顶快照 */
  function undo() {
    const p = activeProject.value;
    const snapshot = past.value[past.value.length - 1];
    if (!p || !snapshot) return;
    future.value = [...future.value, cloneProject(p)];
    past.value = past.value.slice(0, -1);
    replaceActiveProject(snapshot);
    recordOp('undo', '撤销');
  }

  function redo() {
    const p = activeProject.value;
    const snapshot = future.value[future.value.length - 1];
    if (!p || !snapshot) return;
    past.value = [...past.value, cloneProject(p)];
    future.value = future.value.slice(0, -1);
    replaceActiveProject(snapshot);
    recordOp('redo', '重做');
  }

  function replaceActiveProject(next: ThreeDProject) {
    const idx = projects.value.findIndex((x) => x.id === next.id);
    if (idx >= 0) {
      projects.value = projects.value.map((x, i) => (i === idx ? next : x));
    } else {
      projects.value = [next, ...projects.value];
    }
  }

  /* ---------- 项目 CRUD ---------- */

  function selectProject(id: string | null) {
    if (id && !projects.value.some((p) => p.id === id)) return;
    activeProjectId.value = id;
    // 切换项目时清空撤销栈与生成草稿，避免跨项目误操作
    past.value = [];
    future.value = [];
    generationDraft.value = null;
  }

  function addProject(input: NewProjectInput): ThreeDProject | null {
    const project = createProject(input);
    // 项目数量上限：先并入再裁剪，剔除最旧的非种子项目
    const { kept, evicted } = enforceProjectLimit([project, ...projects.value]);
    if (evicted.length > 0) {
      pushToast(`3D 项目已达上限，已移除最旧项目「${evicted[0]}」`, 'warning');
    }
    projects.value = kept;
    selectProject(project.id);
    // 逐出后活动项目可能已失效：回退到第一个项目
    if (!projects.value.some((p) => p.id === activeProjectId.value)) {
      activeProjectId.value = projects.value[0]?.id ?? null;
    }
    pushToast(`已创建${PROJECT_TYPE_LABELS[project.type]}项目「${project.name}」`, 'success');
    return project;
  }

  function updateActiveProject(patch: Parameters<typeof updateProject>[1]): boolean {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    const next = updateProject(p, patch);
    replaceActiveProject(next);
    recordOp('project', '项目设置更新');
    return true;
  }

  /** 创作模式切换（角色 / 世界 / 道具）：保留名称与资产，初始化新模式字段 */
  function switchProjectType(type: ThreeDProjectType) {
    const p = activeProject.value;
    if (!p || p.type === type) return;
    pushUndo();
    const next = cloneProject(p);
    next.type = type;
    next.cameraPreset = 'perspective';
    if (type === 'character' && !next.character) next.character = defaultCharacterSettings();
    if (type === 'world' && !next.world) next.world = defaultWorldSettings();
    if (type === 'prop' && !next.prop) next.prop = defaultPropSettings();
    next.updatedAt = NOW();
    next.history = appendHistory(next.history, 'project', `切换到${PROJECT_TYPE_LABELS[type]}模式`);
    replaceActiveProject(next);
    pushToast(`已切换到${PROJECT_TYPE_LABELS[type]}模式（占位资产保留）`, 'success');
  }

  function renameProject(name: string): boolean {
    return updateActiveProject({ name });
  }

  function setProjectStatus(status: ThreeDProject['status']): boolean {
    return updateActiveProject({ status });
  }

  function deleteProject(id: string): boolean {
    const idx = projects.value.findIndex((p) => p.id === id);
    if (idx < 0) return false;
    const name = projects.value[idx]?.name ?? '';
    projects.value = projects.value.filter((p) => p.id !== id);
    if (activeProjectId.value === id) {
      activeProjectId.value = projects.value[0]?.id ?? null;
      past.value = [];
      future.value = [];
      generationDraft.value = null;
    }
    pushToast(`已删除项目「${name}」`, 'success');
    return true;
  }

  /* ---------- 选择 ---------- */

  function selectAsset(id: string | null) {
    const p = activeProject.value;
    if (!p) return;
    if (id !== null && !assetById(p, id)) return;
    p.activeAssetId = id;
  }

  function clearSelection() {
    selectAsset(null);
  }

  /* ---------- 资产操作（均进入撤销栈） ---------- */

  function addAsset(input: {
    type: ThreeDAsset['type'];
    primitiveKind?: ThreeDAsset['primitiveKind'];
    parentId?: string;
    name?: string;
  }) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const asset = addAssetToProject(p, input);
    if (asset) p.activeAssetId = asset.id;
    return asset;
  }

  function removeAsset(id: string): boolean {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return deleteAsset(p, id);
  }

  function copyAsset(id: string) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const copy = duplicateAsset(p, id);
    if (copy) p.activeAssetId = copy.id;
    return copy;
  }

  function toggleAssetVisible(id: string) {
    const p = activeProject.value;
    if (!p) return;
    const asset = assetById(p, id);
    if (!asset) return;
    pushUndo();
    updateAsset(p, id, { visible: !asset.visible }, asset.visible ? '隐藏资产' : '显示资产');
  }

  function toggleAssetLocked(id: string) {
    const p = activeProject.value;
    if (!p) return;
    const asset = assetById(p, id);
    if (!asset) return;
    updateAsset(p, id, { locked: !asset.locked }, asset.locked ? '解锁资产' : '锁定资产');
  }

  function patchAsset(id: string, patch: Partial<Omit<ThreeDAsset, 'id'>>, label = '更新资产') {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateAsset(p, id, patch, label);
  }

  function setAssetTransform(id: string, transform: ThreeDAsset['transform']) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return setTransform(p, id, transform);
  }

  function setAssetColor(id: string, color: string) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const asset = assetById(p, id);
    if (!asset) return null;
    return updateAsset(p, id, { color }, '颜色更新', 'color');
  }

  function setMaterialPreset(id: string, preset: ThreeDAsset['materialPreset']) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateAsset(p, id, { materialPreset: preset }, '材质预设更新');
  }

  /** 方向键微调（W/E/R 模式） */
  function nudgeAsset(axis: 0 | 1 | 2, direction: 1 | -1, step = 0.1) {
    const p = activeProject.value;
    if (!p || !p.activeAssetId) return;
    const asset = assetById(p, p.activeAssetId);
    if (!asset || asset.locked) return;
    const tool = ui.value.tool;
    if (tool === 'select') return;
    pushUndo();
    const transform = cloneTransform(asset.transform);
    if (tool === 'scale') {
      const next = transform.scale[axis] + direction * step;
      if (next <= 0.01 || next > 100) return;
      transform.scale[axis] = Math.round(next * 1000) / 1000;
    } else if (tool === 'rotate') {
      transform.rotation[axis] =
        Math.round((transform.rotation[axis] + direction * step) * 100) / 100;
    } else {
      transform.position[axis] =
        Math.round((transform.position[axis] + direction * step) * 1000) / 1000;
    }
    setTransform(p, p.activeAssetId, transform);
  }

  /* ---------- 场景 / 模式 / 简报 ---------- */

  function updateScene(patch: Partial<ThreeDProject['sceneSettings']>) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    const next = updateSceneSettings(p, patch);
    replaceActiveProject(next);
    return true;
  }

  function updateCharacterFields(patch: Partial<NonNullable<ThreeDProject['character']>>) {
    const p = activeProject.value;
    if (!p || p.type !== 'character') return false;
    pushUndo();
    const next = updateCharacter(p, patch);
    replaceActiveProject(next);
    return true;
  }

  function updateWorldFields(patch: Partial<NonNullable<ThreeDProject['world']>>) {
    const p = activeProject.value;
    if (!p || p.type !== 'world') return false;
    pushUndo();
    const next = updateWorld(p, patch);
    replaceActiveProject(next);
    return true;
  }

  function updatePropFields(patch: Partial<NonNullable<ThreeDProject['prop']>>) {
    const p = activeProject.value;
    if (!p || p.type !== 'prop') return false;
    pushUndo();
    const next = updateProp(p, patch);
    replaceActiveProject(next);
    return true;
  }

  function updateBriefFields(patch: Partial<ThreeDGenerationBrief>) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    const next = updateBrief(p, { ...p.generationBrief, ...patch });
    replaceActiveProject(next);
    return true;
  }

  function setCameraPreset(preset: CameraPresetId) {
    const p = activeProject.value;
    if (!p) return;
    p.cameraPreset = preset;
    p.updatedAt = NOW();
  }

  /* ---------- 生成简报 / mock service ---------- */

  async function runGenerationDraft(): Promise<ThreeDGenerationDraft | null> {
    const p = activeProject.value;
    if (!p) return null;
    generating.value = true;
    try {
      const service = getThreeDGenerationService();
      const draft = await service.createDraft({
        projectId: p.id,
        projectType: p.type,
        briefText: briefText.value,
        style: p.generationBrief.style,
        dimensions: p.generationBrief.dimensions,
        targetPlatform: p.generationBrief.targetPlatform,
        assetCount: p.assets.length,
        tags: p.tags,
        cameraPreset: p.cameraPreset,
      });
      generationDraft.value = draft;
      return draft;
    } finally {
      generating.value = false;
    }
  }

  function clearGenerationDraft() {
    generationDraft.value = null;
  }

  function setBriefText(text: string) {
    ui.value.briefText = text;
  }

  function resetBriefText() {
    ui.value.briefText = '';
  }

  function copyBriefJson(): Promise<boolean> {
    const p = activeProject.value;
    if (!p) return Promise.resolve(false);
    return copyToClipboard(briefJson(p));
  }

  function copyBriefText(): Promise<boolean> {
    if (!briefText.value) return Promise.resolve(false);
    return copyToClipboard(briefText.value);
  }

  function exportBriefJson() {
    const p = activeProject.value;
    if (!p) return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-生成简报.json`,
      briefJson(p),
      'application/json;charset=utf-8',
    );
  }

  function exportBriefMarkdown() {
    const p = activeProject.value;
    if (!p) return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-生成简报.md`,
      briefText.value,
      'text/markdown;charset=utf-8',
    );
  }

  async function copyToClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      pushToast('已复制到剪贴板', 'success');
      return true;
    } catch {
      pushToast('复制失败：剪贴板不可用', 'warning');
      return false;
    }
  }

  /* ---------- 导入导出 ---------- */

  function exportSingleProject(id: string) {
    const p = projects.value.find((x) => x.id === id) ?? null;
    if (!p) return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}.json`,
      JSON.stringify(projectExportFile(p), null, 2),
      'application/json;charset=utf-8',
    );
  }

  function exportAllProjects() {
    if (projects.value.length === 0) {
      pushToast('没有可导出的项目', 'warning');
      return;
    }
    downloadTextFile(
      '3D工作台-全部项目.json',
      JSON.stringify(libraryExportFile(projects.value), null, 2),
      'application/json;charset=utf-8',
    );
  }

  /** 解析导入文本并缓存预览（不直接入库） */
  function previewImport(text: string): { ok: boolean; error?: string } {
    const parsed = parseImportPreview(text);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.projects.length === 0) {
      return { ok: false, error: `没有可导入的项目（${parsed.preview.invalidCount} 条无效）` };
    }
    pendingImport.value = { preview: parsed.preview, projects: parsed.projects };
    return { ok: true };
  }

  function commitImport(): ThreeDImportResult | null {
    const incoming = pendingImport.value;
    if (!incoming) return null;
    const merged = mergeImportedProjects(projects.value, incoming.projects);
    projects.value = merged.projects;
    pendingImport.value = null;
    const total = merged.result.added + merged.result.copied;
    pushToast(`已导入 ${total} 个项目（重复 id 已复制为新项目）`, 'success');
    return merged.result;
  }

  function cancelImport() {
    pendingImport.value = null;
  }

  /* ---------- Chat 联动 ---------- */

  /** 从助手消息创建 3D 项目草稿（仅结构化文本，不自动执行） */
  function saveFromMessage(messageId: string): boolean {
    const chatStore = useChatStore();
    const message = chatStore.findMessage(messageId);
    if (!message || !isDraftableMessageContent(message.content)) {
      pushToast('该消息内容无法创建 3D 项目草稿', 'warning');
      return false;
    }
    const { name, description, sourceText } = draftFromMessageContent(message.content);
    pendingFromMessage.value = {
      messageId,
      sessionId: chatStore.activeSession?.id,
      name,
      description,
      sourceText,
    };
    return true;
  }

  /** 弹窗确认：从消息草稿创建项目 */
  function commitFromMessage(input: {
    name: string;
    type: ThreeDProjectType;
    description: string;
  }): ThreeDProject | null {
    const draft = pendingFromMessage.value;
    if (!draft) return null;
    const project = addProject({
      name: input.name || draft.name,
      type: input.type,
      description: input.description || draft.description,
      tags: ['来自对话'],
    });
    pendingFromMessage.value = null;
    if (project) {
      const next = updateBrief(project, {
        ...project.generationBrief,
        description: draft.sourceText.slice(0, 2000),
      });
      next.activeAssetId = null;
      replaceActiveProject(next);
    }
    return project;
  }

  function cancelFromMessage() {
    pendingFromMessage.value = null;
  }

  /** 从 3D 工作台返回 Chat：创建会话草稿（不自动发送） */
  function createChatDraft(): string | null {
    const p = activeProject.value;
    if (!p) return null;
    const chatStore = useChatStore();
    chatStore.launchAgentSession({
      agentId: 'inspiration',
      agentName: '灵感',
      systemPrompt: '',
      modelId: chatStore.activeModelId,
      mode: chatStore.prefs.outputMode,
      draft: chatDraftText(p),
    });
    pushToast('会话已创建，草稿已填入输入框（未发送）', 'success');
    return chatStore.activeId;
  }

  /* ---------- 提示条 ---------- */

  function dismissNotices() {
    ui.value.noticeDismissed = true;
  }

  function resetStorage() {
    // 数据损坏时：清空本地数据并重新播种
    projects.value = seedProjects();
    activeProjectId.value = projects.value[0]?.id ?? null;
    past.value = [];
    future.value = [];
    recovered.value = false;
    tooNew.value = false;
    ui.value.noticeDismissed = true;
    flushSave();
    pushToast('已重置 3D 工作台数据', 'success');
  }

  return {
    projects,
    activeProjectId,
    ui,
    recovered,
    tooNew,
    past,
    future,
    saveStatus,
    lastSavedAt,
    writeFailedFlag,
    generationDraft,
    generating,
    pendingFromMessage,
    pendingImport,
    activeProject,
    activeAsset,
    projectCount,
    canUndo,
    canRedo,
    modeSettings,
    isCharacter,
    isWorld,
    isProp,
    briefText,
    selectableAssets: (p: ThreeDProject) => selectableAssets(p),
    selectProject,
    addProject,
    updateActiveProject,
    renameProject,
    setProjectStatus,
    switchProjectType,
    deleteProject,
    selectAsset,
    clearSelection,
    addAsset,
    removeAsset,
    copyAsset,
    toggleAssetVisible,
    toggleAssetLocked,
    patchAsset,
    setAssetTransform,
    setAssetColor,
    setMaterialPreset,
    nudgeAsset,
    updateScene,
    updateCharacterFields,
    updateWorldFields,
    updatePropFields,
    updateBriefFields,
    setCameraPreset,
    runGenerationDraft,
    clearGenerationDraft,
    setBriefText,
    resetBriefText,
    copyBriefJson,
    copyBriefText,
    exportBriefJson,
    exportBriefMarkdown,
    exportSingleProject,
    exportAllProjects,
    previewImport,
    commitImport,
    cancelImport,
    saveFromMessage,
    commitFromMessage,
    cancelFromMessage,
    createChatDraft,
    dismissNotices,
    resetStorage,
    undo,
    redo,
    flushSave,
  };
});

/** 快速访问工具：项目类型中文标签 */
export function projectTypeLabel(type: ThreeDProjectType): string {
  return PROJECT_TYPE_LABELS[type];
}

/** 工具模式快捷入口（组件模板用） */
export type ThreeDToolMode = ToolMode;
