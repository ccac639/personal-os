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
  addLightToProject,
  addPersonalPose,
  addRegionToProject,
  addShotToProject,
  appendHistory,
  applyEnvironmentPreset,
  applyPersonalPose,
  applySnap,
  applyTemplateToProject,
  assetById,
  batchDelete,
  batchResetTransform,
  batchSetColor,
  batchSetLocked,
  batchSetVisible,
  batchTransform,
  buildBriefText,
  briefJson,
  canNest,
  characterBriefJson,
  characterBriefMarkdown,
  chatDraftText,
  cloneProject,
  cloneTransform,
  copyPersonalPose,
  copyShot,
  createGroup,
  createProject,
  deleteAsset,
  deleteGroupWithStrategy,
  deletePersonalPose,
  deleteRegion,
  deleteShot,
  draftFromMessageContent,
  duplicateAsset,
  enforceProjectLimit,
  groupSelection,
  insertAssetPreset,
  invertSelection,
  isDraftableMessageContent,
  libraryExportFile,
  mergeImportedProjects,
  nestAssets,
  parseImportPreview,
  prefillCharacterFromText,
  presetFromSelection,
  projectExportFile,
  remapProjectIds,
  reorderAssets,
  reorderShots,
  saveCustomEnvironment,
  selectByType,
  selectableAssets,
  selectionTargets,
  setCharacterPose,
  setMaterialPreset,
  setTransform,
  storyboardJson,
  storyboardMarkdown,
  syncSelection,
  templateExportFile,
  templateFromProject,
  toggleShotFavorite,
  updateAsset,
  updateBrief,
  updateCharacter,
  updateLightSettings,
  updateMaterialParams,
  updateProp,
  updateProject,
  updateRegion,
  updateSceneSettings,
  updateShot,
  updateWorld,
  validateImportedProject,
} from './domain';
import {
  BUILTIN_ASSET_PRESETS,
  buildTemplateProject,
  findAssetPreset,
  findTemplate,
} from './presets';
import { getThreeDGenerationService } from './service';
import { loadThreeDWorkspace, saveThreeDWorkspace } from './storage';
import { useChatStore } from '../store';
import { downloadTextFile, sanitizeFilename } from '../export';
import { pushToast } from '../toast';
import type { NewProjectInput } from './domain';
import type {
  AssetPreset,
  CameraPresetId,
  EnvironmentPresetId,
  HistoryOpKind,
  LightKind,
  MaterialParams,
  PoseKey,
  ThreeDAsset,
  ThreeDCameraState,
  ThreeDDraftFromMessage,
  ThreeDGenerationBrief,
  ThreeDGenerationDraft,
  ThreeDImportPreview,
  ThreeDImportResult,
  ThreeDProject,
  ThreeDProjectTemplate,
  ThreeDProjectType,
  ThreeDRegion,
  ThreeDShot,
  ThreeDUiState,
  ToolMode,
  Vec3Tuple,
} from './types';

export const useThreeDWorkspaceStore = defineStore('chat-3d-workspace', () => {
  const loaded = loadThreeDWorkspace();

  const projects = ref<ThreeDProject[]>(loaded.projects);
  const activeProjectId = ref<string | null>(loaded.projects[0]?.id ?? null);
  const ui = ref<ThreeDUiState>(loaded.ui);
  const recovered = ref(loaded.recovered);
  const tooNew = ref(loaded.tooNew);
  const migrated = ref(loaded.migrated);

  /** 个人资产预设 / 个人项目模板（随数据持久化） */
  const presets = ref<AssetPreset[]>(loaded.presets);
  const templates = ref<ThreeDProjectTemplate[]>(loaded.templates);

  /** 画布最新相机状态（保存镜头用；不持久化） */
  const lastCamera = ref<ThreeDCameraState | null>(null);

  /** 待确认的模板导入 */
  const pendingTemplateImport = ref<ThreeDProjectTemplate | null>(null);

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
      const ok = saveThreeDWorkspace(projects.value, ui.value, presets.value, templates.value);
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

  watch([projects, ui, presets, templates], () => scheduleSave(), { deep: true });

  function flushSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = null;
    const ok = saveThreeDWorkspace(projects.value, ui.value, presets.value, templates.value);
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

  /* ---------- 选择（支持多选） ---------- */

  function selectAsset(
    id: string | null,
    opts: { additive?: boolean; range?: boolean; rangeIds?: string[] } = {},
  ) {
    const p = activeProject.value;
    if (!p) return;
    if (id !== null && !assetById(p, id)) return;
    if (opts.additive) {
      if (id === null) return;
      const set = new Set(
        p.selectedAssetIds.length > 0
          ? p.selectedAssetIds
          : p.activeAssetId
            ? [p.activeAssetId]
            : [],
      );
      if (set.has(id)) set.delete(id);
      else set.add(id);
      syncSelection(p, [...set]);
      return;
    }
    if (opts.range && opts.rangeIds && id) {
      const anchor = p.activeAssetId;
      const list = opts.rangeIds;
      const from = anchor ? list.indexOf(anchor) : -1;
      const to = list.indexOf(id);
      if (from >= 0 && to >= 0) {
        const [lo, hi] = from <= to ? [from, to] : [to, from];
        syncSelection(p, list.slice(lo, hi + 1));
        return;
      }
    }
    if (id === null) {
      p.activeAssetId = null;
      p.selectedAssetIds = [];
      return;
    }
    p.selectedAssetIds = [id];
    p.activeAssetId = id;
  }

  function selectMany(ids: string[], opts: { additive?: boolean } = {}) {
    const p = activeProject.value;
    if (!p) return;
    const valid = ids.filter((x) => assetById(p, x));
    if (opts.additive) {
      const set = new Set([...p.selectedAssetIds, ...valid]);
      syncSelection(p, [...set]);
    } else {
      syncSelection(p, valid);
    }
  }

  function clearSelection() {
    const p = activeProject.value;
    if (!p) return;
    p.activeAssetId = null;
    p.selectedAssetIds = [];
  }

  /** 按当前主选中资产的类型选择全部顶层资产 */
  function selectByActiveType() {
    const p = activeProject.value;
    if (!p) return;
    const active = p.activeAssetId ? assetById(p, p.activeAssetId) : undefined;
    if (!active) return;
    syncSelection(p, selectByType(p, active.type));
  }

  function invertSelectionAction() {
    const p = activeProject.value;
    if (!p) return;
    syncSelection(p, invertSelection(p, p.selectedAssetIds));
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

  /** 方向键微调（W/E/R 模式；受吸附开关影响） */
  function nudgeAsset(axis: 0 | 1 | 2, direction: 1 | -1, step = 0.1) {
    const p = activeProject.value;
    if (!p || !p.activeAssetId) return;
    const asset = assetById(p, p.activeAssetId);
    if (!asset || asset.locked) return;
    const tool = ui.value.tool;
    if (tool === 'select') return;
    pushUndo();
    const transform = cloneTransform(asset.transform);
    const snap = ui.value.snap;
    if (tool === 'scale') {
      const next = transform.scale[axis] + direction * step;
      if (next <= 0.01 || next > 100) return;
      transform.scale[axis] = applySnap(Math.round(next * 1000) / 1000, 'scale', snap);
    } else if (tool === 'rotate') {
      transform.rotation[axis] = applySnap(
        Math.round((transform.rotation[axis] + direction * step) * 100) / 100,
        'angle',
        snap,
      );
    } else {
      transform.position[axis] = applySnap(
        Math.round((transform.position[axis] + direction * step) * 1000) / 1000,
        'grid',
        snap,
      );
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
        regions: p.regions,
        shots: p.shots,
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

  /** 弹窗确认：从消息草稿创建项目（角色类型预填档案，不自动生成） */
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
      if (next.type === 'character') {
        // 确定性预填角色档案（仅结构化文本，不自动生成内容）
        const prefill = prefillCharacterFromText(draft.sourceText);
        next.character = {
          ...(next.character ?? defaultCharacterSettings()),
          ...prefill,
        };
      }
      next.activeAssetId = null;
      next.selectedAssetIds = [];
      replaceActiveProject(next);
      return next;
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

  /* ---------- 层级与批量编辑 ---------- */

  /** 当前选择集（多选优先，回退主选中） */
  function currentSelection(): string[] {
    const p = activeProject.value;
    if (!p) return [];
    return selectionTargets(p).map((a) => a.id);
  }

  function createGroupAction(name?: string, parentId?: string): ThreeDAsset | null {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const group = createGroup(p, { name, parentId });
    if (group) selectAsset(group.id);
    return group;
  }

  function moveAssetsToParent(ids: string[], targetParentId: string | null): boolean {
    const p = activeProject.value;
    if (!p) return false;
    if (!canNest(p, ids, targetParentId)) {
      pushToast('无法移动：不能把资产放入自身或后代组合', 'warning');
      return false;
    }
    pushUndo();
    const { moved } = nestAssets(p, ids, targetParentId);
    if (moved > 0) syncSelection(p, ids);
    return moved > 0;
  }

  function reorderInParent(parentId: string | null, orderedIds: string[]): boolean {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return reorderAssets(p, parentId, orderedIds);
  }

  function deleteGroupAction(id: string, strategy: 'delete-children' | 'promote'): boolean {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return deleteGroupWithStrategy(p, id, strategy);
  }

  function batchVisibleAction(visible: boolean): number {
    const p = activeProject.value;
    if (!p) return 0;
    pushUndo();
    const n = batchSetVisible(p, currentSelection(), visible);
    if (n > 0) pushToast(`已${visible ? '显示' : '隐藏'} ${n} 项`, 'success');
    return n;
  }

  function batchLockedAction(locked: boolean): number {
    const p = activeProject.value;
    if (!p) return 0;
    pushUndo();
    const n = batchSetLocked(p, currentSelection(), locked);
    if (n > 0) pushToast(`已${locked ? '锁定' : '解锁'} ${n} 项`, 'success');
    return n;
  }

  function batchDeleteSelected(): number {
    const p = activeProject.value;
    if (!p) return 0;
    const ids = currentSelection();
    if (ids.length === 0) return 0;
    pushUndo();
    const n = batchDelete(p, ids);
    if (n > 0) pushToast(`已删除 ${n} 项资产`, 'success');
    return n;
  }

  function batchGroupSelected(name?: string): ThreeDAsset | null {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const group = groupSelection(p, currentSelection(), name);
    if (group) {
      selectAsset(group.id);
      pushToast('已组合选中资产', 'success');
    }
    return group;
  }

  function batchColorSelected(color: string): number {
    const p = activeProject.value;
    if (!p) return 0;
    pushUndo();
    const n = batchSetColor(p, currentSelection(), color);
    if (n > 0) pushToast(`已为 ${n} 项资产改色`, 'success');
    return n;
  }

  function batchResetSelected(): number {
    const p = activeProject.value;
    if (!p) return 0;
    pushUndo();
    return batchResetTransform(p, currentSelection());
  }

  /** 批量变换（移动/旋转/缩放；旋转与缩放以共同中心为基准） */
  function batchTransformSelected(op: 'move' | 'rotate' | 'scale', delta: Vec3Tuple): number {
    const p = activeProject.value;
    if (!p) return 0;
    pushUndo();
    const snap = ui.value.snap;
    const snapped: Vec3Tuple = [
      applySnap(delta[0], op === 'move' ? 'grid' : op === 'rotate' ? 'angle' : 'scale', snap),
      applySnap(delta[1], op === 'move' ? 'grid' : op === 'rotate' ? 'angle' : 'scale', snap),
      applySnap(delta[2], op === 'move' ? 'grid' : op === 'rotate' ? 'angle' : 'scale', snap),
    ];
    return batchTransform(p, currentSelection(), op, snapped);
  }

  /* ---------- 材质与灯光 ---------- */

  function setMaterialPresetAction(id: string, preset: ThreeDAsset['materialPreset']) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return setMaterialPreset(p, id, preset);
  }

  function updateMaterialParamsAction(id: string, params: Partial<MaterialParams>) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateMaterialParams(p, id, params);
  }

  function addLightAction(kind: LightKind, parentId?: string) {
    const p = activeProject.value;
    if (!p) return null;
    if (p.assets.filter((a) => a.type === 'light').length >= 12) {
      pushToast('灯光数量已达上限（12 盏）', 'warning');
      return null;
    }
    pushUndo();
    const light = addLightToProject(p, kind, parentId);
    if (light) {
      selectAsset(light.id);
      pushToast(
        `已新增${kind === 'ambient' ? '环境光' : kind === 'directional' ? '方向光' : kind === 'spot' ? '聚光灯' : '点光'}`,
        'success',
      );
    }
    return light;
  }

  function updateLightAction(id: string, patch: Parameters<typeof updateLightSettings>[2]) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateLightSettings(p, id, patch);
  }

  /* ---------- 环境预设 ---------- */

  function applyEnvironmentPresetAction(id: EnvironmentPresetId) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    replaceActiveProject(applyEnvironmentPreset(p, id));
    pushToast(`已应用环境预设「${id}」`, 'success');
    return true;
  }

  function saveCustomEnvironmentAction(name: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    replaceActiveProject(saveCustomEnvironment(p, name));
    pushToast('已保存为项目自定义环境', 'success');
    return true;
  }

  /* ---------- 角色姿态 ---------- */

  function setPoseAction(pose: PoseKey) {
    const p = activeProject.value;
    if (!p || p.type !== 'character') return false;
    pushUndo();
    replaceActiveProject(setCharacterPose(p, pose));
    return true;
  }

  function savePersonalPoseAction(name: string, pose?: PoseKey) {
    const p = activeProject.value;
    if (!p || p.type !== 'character') return null;
    pushUndo();
    const next = addPersonalPose(p, name, pose ?? p.character?.pose ?? 'stand');
    if (next) {
      replaceActiveProject(next);
      pushToast('已保存个人姿态预设', 'success');
      return next;
    }
    pushToast('个人姿态预设已达上限（20 个）', 'warning');
    return null;
  }

  function copyPersonalPoseAction(id: string) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    const next = copyPersonalPose(p, id);
    if (next) {
      replaceActiveProject(next);
      pushToast('已复制个人姿态预设', 'success');
      return next;
    }
    pushToast('个人姿态预设已达上限（20 个）', 'warning');
    return null;
  }

  function deletePersonalPoseAction(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    replaceActiveProject(deletePersonalPose(p, id));
    return true;
  }

  function applyPersonalPoseAction(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    const next = applyPersonalPose(p, id);
    if (next === p) return false;
    replaceActiveProject(next);
    return true;
  }

  /* ---------- 世界区域 ---------- */

  function addRegionAction(over: Partial<ThreeDRegion> = {}) {
    const p = activeProject.value;
    if (!p || p.type !== 'world') return null;
    if (p.regions.length >= 24) {
      pushToast('区域数量已达上限（24 个）', 'warning');
      return null;
    }
    pushUndo();
    const region = addRegionToProject(p, over);
    if (region) pushToast(`已创建区域「${region.name}」`, 'success');
    return region;
  }

  function updateRegionAction(id: string, patch: Partial<Omit<ThreeDRegion, 'id'>>) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateRegion(p, id, patch);
  }

  function removeRegionAction(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return deleteRegion(p, id);
  }

  /** 切换资产与区域的关联 */
  function toggleRegionAsset(regionId: string, assetId: string) {
    const p = activeProject.value;
    if (!p) return;
    const region = p.regions.find((r) => r.id === regionId);
    if (!region) return;
    pushUndo();
    const ids = new Set(region.assetIds);
    if (ids.has(assetId)) ids.delete(assetId);
    else ids.add(assetId);
    updateRegion(p, regionId, { assetIds: [...ids] });
  }

  function setRegionFilter(regionId: string | null) {
    ui.value.regionFilter = regionId;
  }

  /* ---------- 镜头与分镜 ---------- */

  function setLastCamera(camera: ThreeDCameraState) {
    lastCamera.value = camera;
  }

  function saveShotFromCamera(name: string, over: Partial<ThreeDShot> = {}) {
    const p = activeProject.value;
    if (!p) return null;
    if (p.shots.length >= 48) {
      pushToast('镜头数量已达上限（48 个）', 'warning');
      return null;
    }
    pushUndo();
    const camera = lastCamera.value ?? { position: [4.5, 3.5, 6], target: [0, 0.6, 0], fov: 50 };
    const shot = addShotToProject(p, camera, {
      name: name.trim() || `镜头 ${p.shots.length + 1}`,
      ...over,
    });
    if (shot) {
      p.activeShotId = shot.id;
      pushToast(`已保存镜头「${shot.name}」`, 'success');
    }
    return shot;
  }

  function applyShot(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    if (!p.shots.some((s) => s.id === id)) return false;
    p.activeShotId = id;
    return true;
  }

  function exitShotMode() {
    const p = activeProject.value;
    if (!p) return;
    p.activeShotId = null;
  }

  function updateShotAction(id: string, patch: Partial<Omit<ThreeDShot, 'id'>>) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return updateShot(p, id, patch);
  }

  function removeShotAction(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return deleteShot(p, id);
  }

  function duplicateShotAction(id: string) {
    const p = activeProject.value;
    if (!p) return null;
    pushUndo();
    return copyShot(p, id);
  }

  function toggleShotFavoriteAction(id: string) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return toggleShotFavorite(p, id);
  }

  function reorderShotsAction(orderedIds: string[]) {
    const p = activeProject.value;
    if (!p) return false;
    pushUndo();
    return reorderShots(p, orderedIds);
  }

  /* ---------- 资产预设库 ---------- */

  function insertPresetAction(presetId: string, spawn: Vec3Tuple = [0, 0, 0]) {
    const p = activeProject.value;
    if (!p) return null;
    const preset = findAssetPreset(presetId, presets.value);
    if (!preset) return null;
    pushUndo();
    const root = insertAssetPreset(p, preset, spawn);
    if (root) {
      selectAsset(root.id);
      pushToast(`已插入预设「${preset.name}」`, 'success');
    } else {
      pushToast('资产数量已达上限，无法插入预设', 'warning');
    }
    return root;
  }

  function saveSelectionAsPreset(name: string, category: string) {
    const p = activeProject.value;
    if (!p) return null;
    const ids = currentSelection();
    if (ids.length === 0) {
      pushToast('请先选择要保存为预设的资产', 'warning');
      return null;
    }
    if (presets.value.length >= 40) {
      pushToast('个人预设已达上限（40 个）', 'warning');
      return null;
    }
    const preset = presetFromSelection(p, ids, name, category);
    if (!preset) {
      pushToast('预设资产过多（上限 40 项）', 'warning');
      return null;
    }
    presets.value = [...presets.value, preset];
    pushToast('已保存个人资产预设', 'success');
    return preset;
  }

  function deletePersonalPreset(id: string) {
    const target = presets.value.find((x) => x.id === id);
    if (!target) return false;
    if (target.builtin) {
      pushToast('内置预设不可删除', 'warning');
      return false;
    }
    presets.value = presets.value.filter((x) => x.id !== id);
    pushToast('已删除个人预设', 'success');
    return true;
  }

  function togglePresetFavorite(id: string) {
    presets.value = presets.value.map((x) => (x.id === id ? { ...x, favorite: !x.favorite } : x));
    const target = BUILTIN_ASSET_PRESETS.find((x) => x.id === id);
    if (target) {
      // 内置预设收藏仅存于内存（不落盘，避免篡改内置数据）
      return;
    }
  }

  /* ---------- 项目模板 ---------- */

  function createFromTemplate(templateId: string): ThreeDProject | null {
    const template = findTemplate(templateId, templates.value);
    if (!template) return null;
    const project = template.builtin
      ? buildTemplateProject(templateId)
      : applyTemplateToProject(template);
    if (!project) {
      pushToast('模板应用失败：项目数据无效', 'warning');
      return null;
    }
    const { kept, evicted } = enforceProjectLimit([project, ...projects.value]);
    if (evicted.length > 0) {
      pushToast(`3D 项目已达上限，已移除最旧项目「${evicted[0]}」`, 'warning');
    }
    projects.value = kept;
    selectProject(project.id);
    past.value = [];
    future.value = [];
    pushToast(`已从模板创建项目「${project.name}」`, 'success');
    return project;
  }

  function saveCurrentAsTemplate(name: string, description = ''): boolean {
    const p = activeProject.value;
    if (!p) return false;
    if (templates.value.length >= 24) {
      pushToast('个人模板已达上限（24 个）', 'warning');
      return false;
    }
    const template = templateFromProject(p, name, description);
    templates.value = [...templates.value, template];
    pushToast('已保存为个人模板', 'success');
    return true;
  }

  function deletePersonalTemplate(id: string): boolean {
    const target = templates.value.find((t) => t.id === id);
    if (!target) return false;
    if (target.builtin) {
      pushToast('内置模板不可删除', 'warning');
      return false;
    }
    templates.value = templates.value.filter((t) => t.id !== id);
    pushToast('已删除个人模板', 'success');
    return true;
  }

  function updatePersonalTemplate(
    id: string,
    patch: { name?: string; description?: string },
  ): boolean {
    const idx = templates.value.findIndex((t) => t.id === id);
    if (idx < 0) return false;
    templates.value = templates.value.map((t, i) =>
      i === idx
        ? {
            ...t,
            name: patch.name?.trim() || t.name,
            description: patch.description ?? t.description,
          }
        : t,
    );
    pushToast('已更新个人模板', 'success');
    return true;
  }

  function exportTemplate(id: string) {
    const template = findTemplate(id, templates.value);
    if (!template) return;
    downloadTextFile(
      `${sanitizeFilename(template.name)}-模板.json`,
      JSON.stringify(templateExportFile(template), null, 2),
      'application/json;charset=utf-8',
    );
  }

  /** 模板导入：校验后进入待确认，不直接入库 */
  function previewTemplateImport(text: string): { ok: boolean; error?: string } {
    try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) {
        return { ok: false, error: '文件结构无效' };
      }
      const obj = parsed as Record<string, unknown>;
      if (obj.app !== 'personal-os-3d' || obj.kind !== 'template') {
        return { ok: false, error: '不是 3D 模板文件（kind=template）' };
      }
      if (typeof obj.version === 'number' && obj.version > 1) {
        return { ok: false, error: '模板文件版本过新' };
      }
      const raw = obj.template as Record<string, unknown> | undefined;
      if (!raw || typeof raw !== 'object') return { ok: false, error: '模板内容缺失' };
      const validated = validateImportedProject(raw.sourceProject);
      if (!validated.valid) return { ok: false, error: `模板项目无效：${validated.reason}` };
      const remapped = remapProjectIds(validated.project);
      const template: ThreeDProjectTemplate = {
        id: typeof raw.id === 'string' ? raw.id : remapped.id,
        name: typeof raw.name === 'string' ? raw.name : remapped.name,
        description: typeof raw.description === 'string' ? raw.description : '',
        type: remapped.type,
        builtin: false,
        sourceProject: remapped,
        createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : NOW(),
      };
      pendingTemplateImport.value = template;
      return { ok: true };
    } catch {
      return { ok: false, error: '不是有效的 JSON 文本' };
    }
  }

  function commitTemplateImport(): ThreeDProjectTemplate | null {
    const template = pendingTemplateImport.value;
    if (!template) return null;
    if (templates.value.length >= 24) {
      pushToast('个人模板已达上限（24 个）', 'warning');
      return null;
    }
    // 重复 id 复制为新模板，绝不覆盖
    if (templates.value.some((t) => t.id === template.id)) {
      template.id = `${template.id}-${Date.now().toString(36)}`;
      template.name = `${template.name}（导入）`;
    }
    templates.value = [...templates.value, template];
    pendingTemplateImport.value = null;
    pushToast('已导入个人模板', 'success');
    return template;
  }

  function cancelTemplateImport() {
    pendingTemplateImport.value = null;
  }

  /* ---------- 分镜 / 角色简报导出 ---------- */

  function exportStoryboardMarkdown() {
    const p = activeProject.value;
    if (!p) return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-分镜板.md`,
      storyboardMarkdown(p),
      'text/markdown;charset=utf-8',
    );
  }

  function exportStoryboardJson() {
    const p = activeProject.value;
    if (!p) return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-分镜板.json`,
      storyboardJson(p),
      'application/json;charset=utf-8',
    );
  }

  function exportCharacterBriefMarkdown() {
    const p = activeProject.value;
    if (!p || p.type !== 'character') return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-角色设计板.md`,
      characterBriefMarkdown(p),
      'text/markdown;charset=utf-8',
    );
  }

  function exportCharacterBriefJson() {
    const p = activeProject.value;
    if (!p || p.type !== 'character') return;
    downloadTextFile(
      `${sanitizeFilename(p.name)}-角色设计板.json`,
      characterBriefJson(p),
      'application/json;charset=utf-8',
    );
  }

  /* ---------- 提示条 ---------- */

  function dismissNotices() {
    ui.value.noticeDismissed = true;
  }

  function resetStorage() {
    // 数据损坏时：清空本地数据并重新播种
    projects.value = seedProjects();
    activeProjectId.value = projects.value[0]?.id ?? null;
    presets.value = [];
    templates.value = [];
    past.value = [];
    future.value = [];
    recovered.value = false;
    tooNew.value = false;
    migrated.value = false;
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
    migrated,
    presets,
    templates,
    lastCamera,
    pendingTemplateImport,
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
    selectMany,
    clearSelection,
    selectByActiveType,
    invertSelectionAction,
    currentSelection,
    addAsset,
    removeAsset,
    copyAsset,
    toggleAssetVisible,
    toggleAssetLocked,
    patchAsset,
    setAssetTransform,
    setAssetColor,
    setMaterialPreset: setMaterialPresetAction,
    setMaterialPresetAction,
    updateMaterialParamsAction,
    nudgeAsset,
    /* 层级与批量 */
    createGroupAction,
    moveAssetsToParent,
    reorderInParent,
    deleteGroupAction,
    batchVisibleAction,
    batchLockedAction,
    batchDeleteSelected,
    batchGroupSelected,
    batchColorSelected,
    batchResetSelected,
    batchTransformSelected,
    /* 场景 / 模式 / 简报 */
    updateScene,
    updateCharacterFields,
    updateWorldFields,
    updatePropFields,
    updateBriefFields,
    setCameraPreset,
    /* 灯光 / 环境 */
    addLightAction,
    updateLightAction,
    applyEnvironmentPresetAction,
    saveCustomEnvironmentAction,
    /* 角色姿态 */
    setPoseAction,
    savePersonalPoseAction,
    copyPersonalPoseAction,
    deletePersonalPoseAction,
    applyPersonalPoseAction,
    /* 区域 */
    addRegionAction,
    updateRegionAction,
    removeRegionAction,
    toggleRegionAsset,
    setRegionFilter,
    /* 镜头 */
    setLastCamera,
    saveShotFromCamera,
    applyShot,
    exitShotMode,
    updateShotAction,
    removeShotAction,
    duplicateShotAction,
    toggleShotFavoriteAction,
    reorderShotsAction,
    /* 预设 / 模板 */
    insertPresetAction,
    saveSelectionAsPreset,
    deletePersonalPreset,
    togglePresetFavorite,
    createFromTemplate,
    saveCurrentAsTemplate,
    deletePersonalTemplate,
    updatePersonalTemplate,
    exportTemplate,
    previewTemplateImport,
    commitTemplateImport,
    cancelTemplateImport,
    /* 导出 */
    exportStoryboardMarkdown,
    exportStoryboardJson,
    exportCharacterBriefMarkdown,
    exportCharacterBriefJson,
    /* 生成简报 / Chat 联动 */
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
