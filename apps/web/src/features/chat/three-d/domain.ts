/**
 * Chat 功能域 —— 3D 工作台领域逻辑（纯函数，无副作用）
 *
 * 项目 / 资产 CRUD 的纯逻辑、资产树辅助、生成简报构建、导入导出结构。
 * store 层负责状态与撤销重做；组件只调用这里导出的纯函数。
 */
import {
  DEFAULT_PROJECT_TYPE,
  IDENTITY,
  MAX_ASSETS_PER_PROJECT,
  MAX_HISTORY_PER_PROJECT,
  MAX_PROJECTS,
  MAX_TAGS_PER_PROJECT,
  NOW,
  THREE_D_EXPORT_VERSION,
  characterPlaceholderAssets,
  defaultCharacterSettings,
  defaultGenerationBrief,
  defaultPropSettings,
  defaultSceneSettings,
  defaultWorldSettings,
  makeAsset,
  worldPlaceholderAssets,
} from './constants';
import type {
  CameraPresetId,
  HistoryOpKind,
  PrimitiveKind,
  ThumbnailPresetId,
  ThreeDAsset,
  ThreeDExportFile,
  ThreeDGenerationBrief,
  ThreeDHistoryEntry,
  ThreeDImportPreview,
  ThreeDImportResult,
  ThreeDProject,
  ThreeDProjectStatus,
  ThreeDProjectType,
  ThreeDSingleExportFile,
} from './types';

/* ---------- 基础工具 ---------- */

/**
 * 深拷贝：使用 JSON 往返而不是 structuredClone。
 * store 传入的项目对象可能是 Vue 响应式 Proxy，structuredClone 会抛
 * DataCloneError；JSON 往返对纯数据模型安全且确定。
 */
export function cloneProject(p: ThreeDProject): ThreeDProject {
  return JSON.parse(JSON.stringify(p)) as ThreeDProject;
}

export function cloneAsset(a: ThreeDAsset): ThreeDAsset {
  return JSON.parse(JSON.stringify(a)) as ThreeDAsset;
}

export function cloneTransform(t: ThreeDAsset['transform']): ThreeDAsset['transform'] {
  return JSON.parse(JSON.stringify(t)) as ThreeDAsset['transform'];
}

export function assetById(project: ThreeDProject, id: string | null): ThreeDAsset | undefined {
  if (!id) return undefined;
  return project.assets.find((a) => a.id === id);
}

export function assetChildren(project: ThreeDProject, parentId: string | null): ThreeDAsset[] {
  return project.assets.filter((a) => (a.parentId ?? null) === parentId);
}

export function descendantIds(project: ThreeDProject, rootId: string): string[] {
  const out: string[] = [];
  const walk = (id: string) => {
    for (const a of project.assets) {
      if (a.parentId === id) {
        out.push(a.id);
        walk(a.id);
      }
    }
  };
  walk(rootId);
  return out;
}

/** 可选中资产：顶层资产（不含已隐藏） */
export function selectableAssets(project: ThreeDProject): ThreeDAsset[] {
  return project.assets.filter((a) => !a.parentId);
}

export function normalizeName(raw: string): string {
  const name = raw.trim().slice(0, 60);
  return name || '未命名项目';
}

export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().slice(0, 20);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
    if (out.length >= MAX_TAGS_PER_PROJECT) break;
  }
  return out;
}

/** 追加历史记录（上限截断） */
export function appendHistory(
  history: ThreeDHistoryEntry[],
  kind: HistoryOpKind,
  label: string,
  assetId?: string,
): ThreeDHistoryEntry[] {
  const entry: ThreeDHistoryEntry = { id: IDENTITY(), kind, label, assetId, at: NOW() };
  return [...history, entry].slice(-MAX_HISTORY_PER_PROJECT);
}

/* ---------- 项目 ---------- */

export interface NewProjectInput {
  name: string;
  description?: string;
  type?: ThreeDProjectType;
  tags?: string[];
}

export function createProject(input: NewProjectInput): ThreeDProject {
  const type = input.type ?? DEFAULT_PROJECT_TYPE;
  const now = NOW();
  let assets: ThreeDAsset[] = [];
  if (type === 'character') assets = characterPlaceholderAssets();
  else if (type === 'world') assets = worldPlaceholderAssets();
  else {
    // 道具：空场景起步，由用户组合 primitive
    assets = [];
  }
  const project: ThreeDProject = {
    id: IDENTITY(),
    name: normalizeName(input.name),
    description: (input.description ?? '').trim(),
    type,
    status: 'draft',
    tags: normalizeTags(input.tags ?? []),
    createdAt: now,
    updatedAt: now,
    sceneSettings: defaultSceneSettings(),
    assets,
    activeAssetId: null,
    cameraPreset: 'perspective',
    thumbnailPreset: 'grid',
    generationBrief: defaultGenerationBrief(),
    history: [],
    ...(type === 'character' ? { character: defaultCharacterSettings() } : {}),
    ...(type === 'world' ? { world: defaultWorldSettings() } : {}),
    ...(type === 'prop' ? { prop: defaultPropSettings() } : {}),
  };
  // 种子占位（角色 / 世界）记录为初始操作
  if (type === 'character') {
    project.history = appendHistory(project.history, 'create', '创建角色占位');
  } else if (type === 'world') {
    project.history = appendHistory(project.history, 'create', '创建世界占位');
  }
  return project;
}

export function updateProject(
  project: ThreeDProject,
  patch: Partial<Pick<ThreeDProject, 'name' | 'description' | 'status' | 'tags' | 'type'>>,
): ThreeDProject {
  const next = cloneProject(project);
  if (patch.name !== undefined) next.name = normalizeName(patch.name);
  if (patch.description !== undefined) next.description = patch.description;
  if (patch.status !== undefined) next.status = patch.status;
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  next.updatedAt = NOW();
  return next;
}

/** 确保不超过项目数量上限：超出时剔除最旧的（不删除种子项目） */
export function enforceProjectLimit(projects: ThreeDProject[]): {
  kept: ThreeDProject[];
  evicted: string[];
} {
  if (projects.length <= MAX_PROJECTS) return { kept: projects, evicted: [] };
  const seedIds = new Set(['seed-character-01', 'seed-world-01', 'seed-prop-01']);
  const evictable = projects
    .filter((p) => !seedIds.has(p.id))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const evicted: string[] = [];
  let kept = [...projects];
  while (kept.length > MAX_PROJECTS && evictable.length > 0) {
    const victim = evictable.shift();
    if (!victim) break;
    kept = kept.filter((p) => p.id !== victim.id);
    evicted.push(victim.name);
  }
  return { kept, evicted };
}

/* ---------- 资产 ---------- */

export interface AddAssetInput {
  type: ThreeDAsset['type'];
  primitiveKind?: PrimitiveKind;
  name?: string;
  parentId?: string;
}

export function defaultNameFor(type: ThreeDAsset['type'], primitiveKind?: PrimitiveKind): string {
  if (type === 'primitive' && primitiveKind) {
    const labels: Record<PrimitiveKind, string> = {
      cube: '立方体',
      sphere: '球体',
      cylinder: '圆柱',
      cone: '圆锥',
      plane: '平面',
      torus: '环面',
    };
    return labels[primitiveKind] ?? '基础几何体';
  }
  if (type === 'character-placeholder') return '角色占位';
  if (type === 'world-placeholder') return '世界占位';
  if (type === 'light') return '灯光';
  if (type === 'camera-marker') return '镜头标记';
  return '组合';
}

export function addAssetToProject(
  project: ThreeDProject,
  input: AddAssetInput,
): ThreeDAsset | null {
  if (project.assets.length >= MAX_ASSETS_PER_PROJECT) return null;
  const asset = makeAsset({
    name: input.name?.trim() || defaultNameFor(input.type, input.primitiveKind),
    type: input.type,
    primitiveKind: input.type === 'primitive' ? input.primitiveKind : undefined,
    parentId: input.parentId,
  });
  // 默认颜色按类型区分（程序化配色）
  if (input.type === 'light') {
    asset.color = '#fbbf24';
    asset.materialPreset = 'emissive';
  } else if (input.type === 'camera-marker') {
    asset.color = '#38bdf8';
    asset.materialPreset = 'wireframe';
  } else if (input.type === 'character-placeholder') {
    asset.color = '#f1c27d';
  } else if (input.type === 'world-placeholder') {
    asset.color = '#16a34a';
  } else if (input.type === 'primitive') {
    asset.color = '#6366f1';
  }
  project.assets.push(asset);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'create', `新增${asset.name}`, asset.id);
  return asset;
}

export function updateAsset(
  project: ThreeDProject,
  assetId: string,
  patch: Partial<Omit<ThreeDAsset, 'id'>>,
  opLabel = '更新资产',
  opKind: HistoryOpKind = 'update',
): ThreeDAsset | null {
  const asset = assetById(project, assetId);
  if (!asset) return null;
  const next = { ...asset, ...patch, id: asset.id };
  const idx = project.assets.findIndex((a) => a.id === assetId);
  if (idx >= 0) project.assets[idx] = next;
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, opKind, opLabel, assetId);
  return next;
}

export function duplicateAsset(project: ThreeDProject, assetId: string): ThreeDAsset | null {
  if (project.assets.length >= MAX_ASSETS_PER_PROJECT) return null;
  const source = assetById(project, assetId);
  if (!source) return null;
  const copy = cloneAsset(source);
  copy.id = IDENTITY();
  copy.name = `${source.name}（副本）`;
  copy.locked = false;
  copy.transform = {
    position: [
      source.transform.position[0] + 0.6,
      source.transform.position[1],
      source.transform.position[2],
    ],
    rotation: [...source.transform.rotation],
    scale: [...source.transform.scale],
  };
  // 复制子树（层级关系同步）
  const children = descendantIds(project, assetId);
  const idMap = new Map<string, string>([[source.id, copy.id]]);
  for (const childId of children) {
    const child = assetById(project, childId);
    if (!child) continue;
    const childCopy = cloneAsset(child);
    childCopy.id = IDENTITY();
    childCopy.name = `${child.name}（副本）`;
    childCopy.locked = false;
    idMap.set(childId, childCopy.id);
    childCopy.parentId = idMap.get(child.parentId ?? '') ?? copy.id;
    project.assets.push(childCopy);
  }
  project.assets.push(copy);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'duplicate', `复制${source.name}`, copy.id);
  return copy;
}

export function deleteAsset(project: ThreeDProject, assetId: string): boolean {
  const target = assetById(project, assetId);
  if (!target) return false;
  const ids = new Set([assetId, ...descendantIds(project, assetId)]);
  project.assets = project.assets.filter((a) => !ids.has(a.id));
  if (project.activeAssetId && ids.has(project.activeAssetId)) {
    project.activeAssetId = null;
  }
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'delete', `删除${target.name}`, assetId);
  return true;
}

export function setTransform(
  project: ThreeDProject,
  assetId: string,
  transform: ThreeDAsset['transform'],
): ThreeDAsset | null {
  return updateAsset(project, assetId, { transform }, '变换更新', 'transform');
}

export function setColor(
  project: ThreeDProject,
  assetId: string,
  color: string,
): ThreeDAsset | null {
  return updateAsset(project, assetId, { color }, '颜色更新', 'color');
}

/** 沿轴微调（W/E/R 模式 + 方向键） */
export function nudgeTransform(
  project: ThreeDProject,
  assetId: string,
  axis: 0 | 1 | 2,
  direction: 1 | -1,
  tool: 'move' | 'rotate' | 'scale',
  step: number,
): ThreeDAsset | null {
  const asset = assetById(project, assetId);
  if (!asset) return null;
  const transform = structuredClone(asset.transform);
  if (tool === 'scale') {
    const next = transform.scale[axis] + direction * step;
    if (next <= 0.01 || next > 100) return asset;
    transform.scale[axis] = Math.round(next * 1000) / 1000;
  } else if (tool === 'rotate') {
    transform.rotation[axis] =
      Math.round((transform.rotation[axis] + direction * step) * 100) / 100;
  } else {
    transform.position[axis] =
      Math.round((transform.position[axis] + direction * step) * 1000) / 1000;
  }
  return setTransform(project, assetId, transform);
}

/* ---------- 场景设置 ---------- */

export function updateSceneSettings(
  project: ThreeDProject,
  patch: Partial<ThreeDProject['sceneSettings']>,
): ThreeDProject {
  const next = cloneProject(project);
  next.sceneSettings = { ...next.sceneSettings, ...patch };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'scene', '场景设置更新');
  return next;
}

/* ---------- 模式字段 ---------- */

export function updateCharacter(
  project: ThreeDProject,
  patch: Partial<NonNullable<ThreeDProject['character']>>,
): ThreeDProject {
  const next = cloneProject(project);
  next.character = { ...(next.character ?? defaultCharacterSettings()), ...patch };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'update', '角色设定更新');
  return next;
}

export function updateWorld(
  project: ThreeDProject,
  patch: Partial<NonNullable<ThreeDProject['world']>>,
): ThreeDProject {
  const next = cloneProject(project);
  next.world = { ...(next.world ?? defaultWorldSettings()), ...patch };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'update', '世界设定更新');
  return next;
}

export function updateProp(
  project: ThreeDProject,
  patch: Partial<NonNullable<ThreeDProject['prop']>>,
): ThreeDProject {
  const next = cloneProject(project);
  next.prop = { ...(next.prop ?? defaultPropSettings()), ...patch };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'update', '道具设定更新');
  return next;
}

export function updateBrief(
  project: ThreeDProject,
  brief: ThreeDGenerationBrief,
  record = true,
): ThreeDProject {
  const next = cloneProject(project);
  next.generationBrief = brief;
  next.updatedAt = NOW();
  if (record) next.history = appendHistory(next.history, 'brief', '生成简报更新');
  return next;
}

/* ---------- 生成简报文本 ---------- */

export function buildBriefText(project: ThreeDProject): string {
  const lines: string[] = [];
  lines.push(`# ${project.name}`);
  if (project.description) lines.push(`\n${project.description}`);
  lines.push('');
  lines.push(
    `- 类型：${project.type === 'character' ? '角色' : project.type === 'world' ? '世界' : '道具'}`,
  );
  lines.push(`- 状态：${project.status}`);
  if (project.tags.length > 0) lines.push(`- 标签：${project.tags.join('、')}`);
  if (project.generationBrief.style) lines.push(`- 风格：${project.generationBrief.style}`);
  if (project.generationBrief.dimensions)
    lines.push(`- 尺寸：${project.generationBrief.dimensions}`);
  if (project.generationBrief.targetPlatform)
    lines.push(`- 目标平台：${project.generationBrief.targetPlatform}`);

  if (project.type === 'character' && project.character) {
    const c = project.character;
    lines.push('');
    lines.push('## 角色设定');
    if (c.role) lines.push(`- 角色定位：${c.role}`);
    lines.push(`- 体型比例：${c.bodyProportions}`);
    lines.push(`- 姿态：${c.pose}`);
    if (c.palette.length > 0) lines.push(`- 配色：${c.palette.join(' / ')}`);
    if (c.appearanceKeywords) lines.push(`- 外观关键词：${c.appearanceKeywords}`);
    if (c.clothingKeywords) lines.push(`- 服装/材质关键词：${c.clothingKeywords}`);
    if (c.equipment.length > 0) lines.push(`- 装备占位：${c.equipment.join('、')}`);
  }

  if (project.type === 'world' && project.world) {
    const w = project.world;
    lines.push('');
    lines.push('## 世界设定');
    if (w.eraStyle) lines.push(`- 时代/风格：${w.eraStyle}`);
    if (w.regionNotes) lines.push(`- 区域说明：${w.regionNotes}`);
    if (w.atmosphere) lines.push(`- 氛围：${w.atmosphere}`);
    lines.push(`- 时间：${w.timeOfDay}`);
    lines.push(`- 天气：${w.weather}`);
    lines.push(`- 比例尺：${w.scale} 单位/米`);
  }

  if (project.type === 'prop' && project.prop) {
    const p = project.prop;
    lines.push('');
    lines.push('## 道具设定');
    if (p.description) lines.push(`- 说明：${p.description}`);
    if (p.usage) lines.push(`- 用途：${p.usage}`);
    if (p.sizeHint) lines.push(`- 尺寸：${p.sizeHint}`);
  }

  lines.push('');
  lines.push('## 资产清单');
  const roots = project.assets.filter((a) => !a.parentId);
  if (roots.length === 0) {
    lines.push('- （暂无资产）');
  } else {
    for (const a of roots) {
      lines.push(`- ${a.name}（${a.type}${a.primitiveKind ? `:${a.primitiveKind}` : ''}）`);
    }
  }

  if (project.generationBrief.description) {
    lines.push('');
    lines.push('## 生成描述');
    lines.push(project.generationBrief.description);
  }
  return lines.join('\n');
}

export function briefTextToMarkdown(text: string): string {
  return text;
}

export function briefJson(project: ThreeDProject): string {
  return JSON.stringify(
    {
      app: 'personal-os-3d',
      kind: 'brief',
      projectId: project.id,
      projectName: project.name,
      projectType: project.type,
      brief: project.generationBrief,
      character: project.character ?? null,
      world: project.world ?? null,
      prop: project.prop ?? null,
      tags: project.tags,
      assetCount: project.assets.length,
      exportedAt: NOW(),
    },
    null,
    2,
  );
}

/* ---------- 导入导出 ---------- */

export function projectExportFile(project: ThreeDProject): ThreeDSingleExportFile {
  return {
    app: 'personal-os-3d',
    version: THREE_D_EXPORT_VERSION,
    kind: 'project',
    exportedAt: NOW(),
    project: cloneProject(project),
  };
}

export function libraryExportFile(projects: ThreeDProject[]): ThreeDExportFile {
  return {
    app: 'personal-os-3d',
    version: THREE_D_EXPORT_VERSION,
    kind: 'projects',
    exportedAt: NOW(),
    projects: projects.map(cloneProject),
  };
}

/** 导入数据校验结果：合法项目列表 + 预览 */
export function parseImportPreview(
  text: string,
):
  | { ok: true; preview: ThreeDImportPreview; projects: ThreeDProject[] }
  | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '不是有效的 JSON 文本' };
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: '文件结构无效：应为对象' };
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.app !== 'personal-os-3d') {
    return { ok: false, error: '不是 Personal OS 3D 工作台导出文件' };
  }
  const version = obj.version;
  if (typeof version !== 'number' || version > THREE_D_EXPORT_VERSION) {
    return {
      ok: false,
      error: `文件版本过新（v${String(version)}），当前支持 v${THREE_D_EXPORT_VERSION}`,
    };
  }
  if (obj.kind === 'project' && obj.project) {
    const result = validateImportedProject(obj.project);
    const projects = result.valid ? [result.project] : [];
    return {
      ok: true,
      preview: {
        total: 1,
        validCount: projects.length,
        invalidCount: projects.length === 1 ? 0 : 1,
        version,
        projects: [
          {
            index: 0,
            name: result.valid ? result.project.name : '（无效项目）',
            type: result.valid ? result.project.type : 'character',
            assetCount: result.valid ? result.project.assets.length : 0,
            valid: result.valid,
            reason: result.valid ? undefined : result.reason,
          },
        ],
      },
      projects,
    };
  }
  if (obj.kind === 'projects' && Array.isArray(obj.projects)) {
    const preview: ThreeDImportPreview = {
      total: obj.projects.length,
      validCount: 0,
      invalidCount: 0,
      version,
      projects: [],
    };
    const projects: ThreeDProject[] = [];
    obj.projects.forEach((raw, i) => {
      const result = validateImportedProject(raw);
      preview.projects.push({
        index: i,
        name: result.valid ? result.project.name : '（无效项目）',
        type: result.valid ? result.project.type : 'character',
        assetCount: result.valid ? result.project.assets.length : 0,
        valid: result.valid,
        reason: result.valid ? undefined : result.reason,
      });
      if (result.valid) {
        preview.validCount += 1;
        projects.push(result.project);
      } else {
        preview.invalidCount += 1;
      }
    });
    return { ok: true, preview, projects };
  }
  return { ok: false, error: '缺少可识别的项目数据（kind=project / projects）' };
}

/** 严格校验单个项目：结构 / 类型 / 数值 / 颜色 */
export function validateImportedProject(
  raw: unknown,
): { valid: true; project: ThreeDProject } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '项目不是对象' };
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0) return { valid: false, reason: 'id 缺失' };
  if (typeof p.name !== 'string' || p.name.trim().length === 0)
    return { valid: false, reason: '名称缺失' };
  if (p.type !== 'character' && p.type !== 'world' && p.type !== 'prop') {
    return { valid: false, reason: `未知项目类型：${String(p.type)}` };
  }
  if (
    p.status !== 'draft' &&
    p.status !== 'exploring' &&
    p.status !== 'ready' &&
    p.status !== 'archived'
  ) {
    return { valid: false, reason: `未知项目状态：${String(p.status)}` };
  }
  if (typeof p.createdAt !== 'number' || typeof p.updatedAt !== 'number') {
    return { valid: false, reason: '时间戳缺失' };
  }
  if (!Array.isArray(p.assets)) return { valid: false, reason: '资产列表缺失' };
  if (p.assets.length > MAX_ASSETS_PER_PROJECT)
    return { valid: false, reason: `资产数量超限（>${MAX_ASSETS_PER_PROJECT}）` };
  const assets: ThreeDAsset[] = [];
  const seenIds = new Set<string>();
  for (const rawAsset of p.assets) {
    const r = validateImportedAsset(rawAsset, seenIds);
    if (!r.valid) return r;
    assets.push(r.asset);
  }
  // parentId 必须引用已存在资产
  const ids = new Set(assets.map((a) => a.id));
  for (const a of assets) {
    if (a.parentId && !ids.has(a.parentId)) {
      return { valid: false, reason: `资产 ${a.name} 的父资产不存在` };
    }
  }
  const scene = validateSceneSettings(p.sceneSettings);
  if (!scene.valid) return scene;
  const brief = validateBrief(p.generationBrief);
  if (!brief.valid) return brief;

  const project: ThreeDProject = {
    id: p.id as string,
    name: (p.name as string).trim(),
    description: typeof p.description === 'string' ? p.description : '',
    type: p.type as ThreeDProjectType,
    status: p.status as ThreeDProjectStatus,
    tags: Array.isArray(p.tags)
      ? normalizeTags(p.tags.filter((t): t is string => typeof t === 'string'))
      : [],
    createdAt: p.createdAt as number,
    updatedAt: p.updatedAt as number,
    sceneSettings: scene.settings,
    assets,
    activeAssetId:
      typeof p.activeAssetId === 'string' && ids.has(p.activeAssetId) ? p.activeAssetId : null,
    cameraPreset: isCameraPreset(p.cameraPreset) ? p.cameraPreset : 'perspective',
    thumbnailPreset: isThumbnailPreset(p.thumbnailPreset) ? p.thumbnailPreset : 'grid',
    generationBrief: brief.brief,
    history: [],
    ...(p.type === 'character' && typeof p.character === 'object' && p.character !== null
      ? { character: sanitizeCharacter(p.character as Record<string, unknown>) }
      : p.type === 'character'
        ? { character: defaultCharacterSettings() }
        : {}),
    ...(p.type === 'world' && typeof p.world === 'object' && p.world !== null
      ? { world: sanitizeWorld(p.world as Record<string, unknown>) }
      : p.type === 'world'
        ? { world: defaultWorldSettings() }
        : {}),
    ...(p.type === 'prop' && typeof p.prop === 'object' && p.prop !== null
      ? { prop: sanitizeProp(p.prop as Record<string, unknown>) }
      : p.type === 'prop'
        ? { prop: defaultPropSettings() }
        : {}),
  };
  return { valid: true, project };
}

const PRIMITIVE_KINDS_SET = new Set<string>([
  'cube',
  'sphere',
  'cylinder',
  'cone',
  'plane',
  'torus',
]);
const ASSET_TYPES_SET = new Set<string>([
  'primitive',
  'character-placeholder',
  'world-placeholder',
  'light',
  'camera-marker',
  'group',
]);
const MATERIAL_PRESETS_SET = new Set<string>([
  'standard',
  'matte',
  'glossy',
  'emissive',
  'wireframe',
  'translucent',
]);
const CAMERA_PRESETS_SET = new Set<string>([
  'perspective',
  'front',
  'side',
  'top',
  'closeup',
  'birdseye',
  'fullbody',
  'halfbody',
  'face',
  'back',
  'threeview',
  'street',
  'ground',
  'building',
]);
const THUMBNAIL_PRESETS_SET = new Set<string>(['grid', 'wireframe', 'silhouette', 'topdown']);

function isCameraPreset(v: unknown): v is CameraPresetId {
  return typeof v === 'string' && CAMERA_PRESETS_SET.has(v);
}

function isThumbnailPreset(v: unknown): v is ThumbnailPresetId {
  return typeof v === 'string' && THUMBNAIL_PRESETS_SET.has(v);
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function validateVec3(v: unknown): v is [number, number, number] {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    (v as unknown[]).every((n) => isFiniteNum(n) && Math.abs(n as number) < 1e6)
  );
}

function isHex(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

function validateImportedAsset(
  raw: unknown,
  seenIds: Set<string>,
): { valid: true; asset: ThreeDAsset } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '资产不是对象' };
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== 'string' || a.id.length === 0)
    return { valid: false, reason: '资产 id 缺失' };
  if (seenIds.has(a.id)) return { valid: false, reason: `资产 id 重复：${a.id}` };
  seenIds.add(a.id);
  if (typeof a.name !== 'string' || a.name.trim().length === 0)
    return { valid: false, reason: '资产名称缺失' };
  if (typeof a.type !== 'string' || !ASSET_TYPES_SET.has(a.type)) {
    return { valid: false, reason: `未知资产类型：${String(a.type)}` };
  }
  const type = a.type as ThreeDAsset['type'];
  if (type === 'primitive') {
    if (typeof a.primitiveKind !== 'string' || !PRIMITIVE_KINDS_SET.has(a.primitiveKind)) {
      return { valid: false, reason: `未知几何体种类：${String(a.primitiveKind)}` };
    }
  } else if (a.primitiveKind !== undefined) {
    return { valid: false, reason: 'primitiveKind 只能用于 primitive 资产' };
  }
  if (typeof a.visible !== 'boolean')
    return { valid: false, reason: `资产 ${String(a.name)} visible 非法` };
  if (typeof a.locked !== 'boolean')
    return { valid: false, reason: `资产 ${String(a.name)} locked 非法` };
  if (typeof a.transform !== 'object' || a.transform === null) {
    return { valid: false, reason: `资产 ${String(a.name)} transform 缺失` };
  }
  const t = a.transform as Record<string, unknown>;
  if (!validateVec3(t.position) || !validateVec3(t.rotation) || !validateVec3(t.scale)) {
    return { valid: false, reason: `资产 ${String(a.name)} transform 数值非法` };
  }
  if (!isHex(a.color)) return { valid: false, reason: `资产 ${String(a.name)} 颜色非法` };
  if (typeof a.materialPreset !== 'string' || !MATERIAL_PRESETS_SET.has(a.materialPreset)) {
    return { valid: false, reason: `资产 ${String(a.name)} 材质预设未知` };
  }
  const asset: ThreeDAsset = {
    id: a.id,
    name: (a.name as string).trim(),
    type,
    primitiveKind: type === 'primitive' ? (a.primitiveKind as PrimitiveKind) : undefined,
    visible: a.visible as boolean,
    locked: a.locked as boolean,
    transform: {
      position: t.position as [number, number, number],
      rotation: t.rotation as [number, number, number],
      scale: t.scale as [number, number, number],
    },
    color: a.color as string,
    materialPreset: a.materialPreset as ThreeDAsset['materialPreset'],
    parentId: typeof a.parentId === 'string' ? a.parentId : undefined,
    tags: Array.isArray(a.tags)
      ? a.tags.filter((x): x is string => typeof x === 'string').slice(0, MAX_TAGS_PER_PROJECT)
      : [],
    notes: typeof a.notes === 'string' ? a.notes.slice(0, 500) : '',
  };
  return { valid: true, asset };
}

function validateSceneSettings(
  raw: unknown,
): { valid: true; settings: ThreeDProject['sceneSettings'] } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '场景设置缺失' };
  const s = raw as Record<string, unknown>;
  if (!isHex(s.background)) return { valid: false, reason: '背景颜色非法' };
  if (!isHex(s.groundColor)) return { valid: false, reason: '地面颜色非法' };
  if (
    typeof s.groundVisible !== 'boolean' ||
    typeof s.gridVisible !== 'boolean' ||
    typeof s.axesVisible !== 'boolean'
  ) {
    return { valid: false, reason: '场景开关非法' };
  }
  const ambient = s.ambientLight as Record<string, unknown> | undefined;
  const main = s.mainLight as Record<string, unknown> | undefined;
  const fog = s.fog as Record<string, unknown> | undefined;
  if (
    !ambient ||
    typeof ambient !== 'object' ||
    !isHex(ambient.color) ||
    !isFiniteNum(ambient.intensity)
  ) {
    return { valid: false, reason: '环境光设置非法' };
  }
  if (
    !main ||
    typeof main !== 'object' ||
    !isHex(main.color) ||
    !isFiniteNum(main.intensity) ||
    !validateVec3(main.position)
  ) {
    return { valid: false, reason: '主光设置非法' };
  }
  if (
    !fog ||
    typeof fog !== 'object' ||
    !isHex(fog.color) ||
    !isFiniteNum(fog.near) ||
    !isFiniteNum(fog.far)
  ) {
    return { valid: false, reason: '雾效设置非法' };
  }
  return {
    valid: true,
    settings: {
      background: s.background as string,
      groundColor: s.groundColor as string,
      groundVisible: s.groundVisible as boolean,
      gridVisible: s.gridVisible as boolean,
      axesVisible: s.axesVisible as boolean,
      ambientLight: {
        enabled: ambient.enabled !== false,
        color: ambient.color as string,
        intensity: clamp01(ambient.intensity as number),
      },
      mainLight: {
        enabled: main.enabled !== false,
        color: main.color as string,
        intensity: Math.min(Math.max(main.intensity as number, 0), 20),
        position: main.position as [number, number, number],
      },
      fog: {
        enabled: fog.enabled === true,
        color: fog.color as string,
        near: Math.max(fog.near as number, 0),
        far: Math.min(Math.max(fog.far as number, 0), 1000),
      },
      cameraPreset: isCameraPreset(s.cameraPreset) ? s.cameraPreset : 'perspective',
    },
  };
}

function clamp01(v: number): number {
  return Math.min(Math.max(v, 0), 3);
}

function validateBrief(
  raw: unknown,
): { valid: true; brief: ThreeDGenerationBrief } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '生成简报缺失' };
  const b = raw as Record<string, unknown>;
  if (
    typeof b.description !== 'string' ||
    typeof b.style !== 'string' ||
    typeof b.dimensions !== 'string' ||
    typeof b.targetPlatform !== 'string'
  ) {
    return { valid: false, reason: '生成简报字段非法' };
  }
  return {
    valid: true,
    brief: {
      description: b.description.slice(0, 2000),
      style: b.style.slice(0, 500),
      dimensions: b.dimensions.slice(0, 100),
      targetPlatform: b.targetPlatform.slice(0, 100),
    },
  };
}

function sanitizeCharacter(raw: Record<string, unknown>): NonNullable<ThreeDProject['character']> {
  const base = defaultCharacterSettings();
  const palette = Array.isArray(raw.palette)
    ? raw.palette.filter((x): x is string => typeof x === 'string' && isHex(x)).slice(0, 8)
    : base.palette;
  const equipment = Array.isArray(raw.equipment)
    ? raw.equipment.filter((x): x is string => typeof x === 'string').slice(0, 12)
    : base.equipment;
  return {
    bodyProportions:
      typeof raw.bodyProportions === 'string' ? raw.bodyProportions : base.bodyProportions,
    pose: typeof raw.pose === 'string' ? raw.pose : base.pose,
    palette: palette.length > 0 ? palette : base.palette,
    equipment,
    role: typeof raw.role === 'string' ? raw.role.slice(0, 200) : base.role,
    appearanceKeywords:
      typeof raw.appearanceKeywords === 'string'
        ? raw.appearanceKeywords.slice(0, 500)
        : base.appearanceKeywords,
    clothingKeywords:
      typeof raw.clothingKeywords === 'string'
        ? raw.clothingKeywords.slice(0, 500)
        : base.clothingKeywords,
  };
}

function sanitizeWorld(raw: Record<string, unknown>): NonNullable<ThreeDProject['world']> {
  const base = defaultWorldSettings();
  return {
    eraStyle: typeof raw.eraStyle === 'string' ? raw.eraStyle.slice(0, 200) : base.eraStyle,
    regionNotes:
      typeof raw.regionNotes === 'string' ? raw.regionNotes.slice(0, 1000) : base.regionNotes,
    atmosphere: typeof raw.atmosphere === 'string' ? raw.atmosphere.slice(0, 500) : base.atmosphere,
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : base.timeOfDay,
    weather: typeof raw.weather === 'string' ? raw.weather : base.weather,
    scale: isFiniteNum(raw.scale) && (raw.scale as number) > 0 ? (raw.scale as number) : base.scale,
  };
}

function sanitizeProp(raw: Record<string, unknown>): NonNullable<ThreeDProject['prop']> {
  const base = defaultPropSettings();
  return {
    description:
      typeof raw.description === 'string' ? raw.description.slice(0, 500) : base.description,
    usage: typeof raw.usage === 'string' ? raw.usage.slice(0, 500) : base.usage,
    sizeHint: typeof raw.sizeHint === 'string' ? raw.sizeHint.slice(0, 200) : base.sizeHint,
  };
}

/** 合并导入：重复 id 一律复制为新 id（绝不覆盖已有项目） */
export function mergeImportedProjects(
  existing: ThreeDProject[],
  incoming: ThreeDProject[],
): { projects: ThreeDProject[]; result: ThreeDImportResult } {
  const existingIds = new Set(existing.map((p) => p.id));
  const projects = [...existing];
  let added = 0;
  let copied = 0;
  for (const raw of incoming) {
    const project = cloneProject(raw);
    project.history = [];
    if (existingIds.has(project.id)) {
      project.id = IDENTITY();
      project.name = `${project.name}（导入）`;
      copied += 1;
    } else {
      added += 1;
    }
    existingIds.add(project.id);
    projects.push(project);
  }
  return { projects, result: { added, copied, invalid: incoming.length - added - copied } };
}

/** 从 Chat 助手消息构建草稿（仅结构化文本） */
export function draftFromMessageContent(content: string): {
  name: string;
  description: string;
  sourceText: string;
} {
  const lines = content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const first = lines[0] ?? '';
  const name = first.length > 30 ? `${first.slice(0, 27)}…` : first || '未命名 3D 项目';
  const rest = lines.slice(1).join(' ');
  const description = rest.length > 200 ? `${rest.slice(0, 197)}…` : rest;
  const sourceText = content.slice(0, 4000);
  return { name, description, sourceText };
}

/** 是否可从消息创建（文本可读、非附件占位） */
export function isDraftableMessageContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length === 0) return false;
  // 附件占位 / 二进制特征拒绝
  if (/data:image|data:audio|data:video|^\[附件/.test(trimmed)) return false;
  return true;
}

/** 从 3D 工作台返回 Chat 的草稿文本 */
export function chatDraftText(project: ThreeDProject): string {
  const lines: string[] = [];
  lines.push(`【3D 工作台】继续讨论项目「${project.name}」`);
  if (project.description) lines.push(`\n项目说明：${project.description}`);
  const brief = buildBriefText(project);
  lines.push(`\n\`\`\`text\n${brief}\n\`\`\``);
  return lines.join('\n');
}
