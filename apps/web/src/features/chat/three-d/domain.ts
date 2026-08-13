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
  MAX_PERSONAL_POSES,
  MAX_PRESET_ASSETS,
  MAX_PROJECTS,
  MAX_REGIONS,
  MAX_SELECTION,
  MAX_SHOTS,
  MAX_TAGS_PER_PROJECT,
  NOW,
  THREE_D_EXPORT_VERSION,
  characterPlaceholderAssets,
  defaultCharacterSettings,
  defaultGenerationBrief,
  defaultLightSettings,
  defaultPropSettings,
  defaultRegion,
  defaultSceneSettings,
  defaultShot,
  defaultWorldSettings,
  environmentPresetById,
  ENVIRONMENT_PRESETS,
  isHexColor,
  isPoseKey,
  isVec3,
  lightLimitReached,
  makeAsset,
  MATERIAL_PRESET_PARAMS,
  normalizeMaterialParams,
  worldPlaceholderAssets,
} from './constants';
import type {
  AssetPreset,
  CameraPresetId,
  EnvironmentPresetId,
  HistoryOpKind,
  LightKind,
  LightSettings,
  MaterialParams,
  MaterialPresetId,
  PersonalPosePreset,
  PoseKey,
  PrimitiveKind,
  ShotStatus,
  ThumbnailPresetId,
  ThreeDAsset,
  ThreeDCameraState,
  ThreeDExportFile,
  ThreeDGenerationBrief,
  ThreeDHistoryEntry,
  ThreeDImportPreview,
  ThreeDImportResult,
  ThreeDProject,
  ThreeDProjectStatus,
  ThreeDProjectTemplate,
  ThreeDProjectType,
  ThreeDRegion,
  ThreeDShot,
  ThreeDSingleExportFile,
  ThreeDTemplateExportFile,
  Vec3Tuple,
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
    selectedAssetIds: [],
    cameraPreset: 'perspective',
    thumbnailPreset: 'grid',
    generationBrief: defaultGenerationBrief(),
    regions: [],
    shots: [],
    activeShotId: null,
    environmentPreset: 'custom',
    environmentCustomName: '',
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
  if (input.type === 'light' && lightLimitReached(project.assets)) return null;
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
    asset.light = defaultLightSettings('point');
    asset.materialParams = normalizeMaterialParams({ emissiveIntensity: 0.5 });
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
    if (c.codename) lines.push(`- 姓名 / 代号：${c.codename}`);
    if (c.role) lines.push(`- 角色定位：${c.role}`);
    if (c.ageGroup) lines.push(`- 年龄段：${c.ageGroup}`);
    if (c.bodyType) lines.push(`- 体型：${c.bodyType}`);
    if (c.style) lines.push(`- 风格：${c.style}`);
    if (c.personalityKeywords) lines.push(`- 个性：${c.personalityKeywords}`);
    lines.push(`- 体型比例：${c.bodyProportions}`);
    lines.push(`- 头部比例：${c.headRatio}`);
    lines.push(`- 肩宽：${c.shoulderWidth}`);
    lines.push(`- 腿长：${c.legLength}`);
    lines.push(`- 姿态：${c.pose}`);
    if (c.palette.length > 0) lines.push(`- 配色：${c.palette.join(' / ')}`);
    if (c.appearanceKeywords) lines.push(`- 外观关键词：${c.appearanceKeywords}`);
    if (c.clothingKeywords) lines.push(`- 服装/材质关键词：${c.clothingKeywords}`);
    if (c.equipmentKeywords) lines.push(`- 装备关键词：${c.equipmentKeywords}`);
    if (c.equipment.length > 0) lines.push(`- 装备占位：${c.equipment.join('、')}`);
  }

  if (project.type === 'world' && project.world) {
    const w = project.world;
    lines.push('');
    lines.push('## 世界设定');
    if (w.eraStyle) lines.push(`- 时代/风格：${w.eraStyle}`);
    if (w.location) lines.push(`- 地点：${w.location}`);
    if (w.regionNotes) lines.push(`- 区域说明：${w.regionNotes}`);
    if (w.atmosphere) lines.push(`- 氛围：${w.atmosphere}`);
    lines.push(`- 时间：${w.timeOfDay}`);
    lines.push(`- 天气：${w.weather}`);
    lines.push(`- 比例尺：${w.scale} 单位/米`);
    if (w.shotLanguage) lines.push(`- 镜头语言：${w.shotLanguage}`);
    if (project.regions.length > 0) {
      lines.push('');
      lines.push('### 区域');
      for (const r of project.regions) {
        lines.push(`- ${r.name}：${r.purpose || '未设定用途'} · 危险 ${r.dangerLevel}/5`);
      }
    }
    if (project.shots.length > 0) {
      lines.push('');
      lines.push('### 镜头');
      for (const s of project.shots) {
        lines.push(
          `- ${s.name}：${s.notes ? `${s.notes} · ` : ''}FOV ${s.fov}°${s.favorite ? ' ★' : ''}`,
        );
      }
    }
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
  const previewFor = (
    result: { valid: true; project: ThreeDProject } | { valid: false; reason: string },
  ): ThreeDImportPreview['projects'][number] => ({
    index: 0,
    name: result.valid ? result.project.name : '（无效项目）',
    type: result.valid ? result.project.type : 'character',
    assetCount: result.valid ? result.project.assets.length : 0,
    lightCount: result.valid ? result.project.assets.filter((a) => a.type === 'light').length : 0,
    regionCount: result.valid ? result.project.regions.length : 0,
    shotCount: result.valid ? result.project.shots.length : 0,
    valid: result.valid,
    reason: result.valid ? undefined : result.reason,
  });
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
        projects: [previewFor(result)],
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
      preview.projects.push({ ...previewFor(result), index: i });
      if (result.valid) {
        preview.validCount += 1;
        projects.push(result.project);
      } else {
        preview.invalidCount += 1;
      }
    });
    return { ok: true, preview, projects };
  }
  if (obj.kind === 'template' && typeof obj.template === 'object' && obj.template !== null) {
    const t = obj.template as Record<string, unknown>;
    const project = validateImportedProject(t.sourceProject);
    if (!project.valid) {
      return { ok: false, error: `模板项目无效：${project.reason}` };
    }
    const preview: ThreeDImportPreview = {
      total: 1,
      validCount: 1,
      invalidCount: 0,
      version,
      projects: [
        {
          index: 0,
          name: `模板：${String(t.name ?? '未命名')}`,
          type: project.project.type,
          assetCount: project.project.assets.length,
          lightCount: project.project.assets.filter((a) => a.type === 'light').length,
          regionCount: project.project.regions.length,
          shotCount: project.project.shots.length,
          valid: true,
        },
      ],
    };
    return { ok: true, preview, projects: [] };
  }
  return { ok: false, error: '缺少可识别的项目数据（kind=project / projects / template）' };
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
  // parentId 必须引用已存在资产，且不得形成循环层级
  const ids = new Set(assets.map((a) => a.id));
  for (const a of assets) {
    if (a.parentId && !ids.has(a.parentId)) {
      return { valid: false, reason: `资产 ${a.name} 的父资产不存在` };
    }
  }
  const parentOf = new Map<string, string | null>();
  for (const a of assets) parentOf.set(a.id, a.parentId ?? null);
  for (const a of assets) {
    let cursor: string | null = a.parentId ?? null;
    let hops = 0;
    while (cursor) {
      if (cursor === a.id || hops > assets.length) {
        return { valid: false, reason: `资产 ${a.name} 的父资产形成循环` };
      }
      cursor = parentOf.get(cursor) ?? null;
      hops += 1;
    }
  }
  const scene = validateSceneSettings(p.sceneSettings);
  if (!scene.valid) return scene;
  const brief = validateBrief(p.generationBrief);
  if (!brief.valid) return brief;
  // 区域（world 项目；其余类型接受但清空）
  const regions: ThreeDRegion[] = [];
  if (Array.isArray(p.regions)) {
    if (p.regions.length > MAX_REGIONS) {
      return { valid: false, reason: `区域数量超限（>${MAX_REGIONS}）` };
    }
    const seenRegionIds = new Set<string>();
    for (const rawRegion of p.regions) {
      const r = validateImportedRegion(rawRegion, seenRegionIds, ids);
      if (!r.valid) return r;
      regions.push(r.region);
    }
  }
  // 镜头
  const shots: ThreeDShot[] = [];
  if (Array.isArray(p.shots)) {
    if (p.shots.length > MAX_SHOTS) {
      return { valid: false, reason: `镜头数量超限（>${MAX_SHOTS}）` };
    }
    const seenShotIds = new Set<string>();
    const regionIds = new Set(regions.map((r) => r.id));
    for (const rawShot of p.shots) {
      const s = validateImportedShot(rawShot, seenShotIds, regionIds);
      if (!s.valid) return s;
      shots.push(s.shot);
    }
  }
  const activeShotId =
    typeof p.activeShotId === 'string' && shots.some((s) => s.id === p.activeShotId)
      ? p.activeShotId
      : null;

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
    selectedAssetIds: Array.isArray(p.selectedAssetIds)
      ? p.selectedAssetIds
          .filter((x): x is string => typeof x === 'string' && ids.has(x))
          .slice(0, MAX_SELECTION)
      : [],
    cameraPreset: isCameraPreset(p.cameraPreset) ? p.cameraPreset : 'perspective',
    thumbnailPreset: isThumbnailPreset(p.thumbnailPreset) ? p.thumbnailPreset : 'grid',
    generationBrief: brief.brief,
    regions: p.type === 'world' ? regions : [],
    shots,
    activeShotId: p.type === 'world' ? activeShotId : activeShotId,
    environmentPreset:
      p.environmentPreset === 'custom' ||
      ENVIRONMENT_PRESETS.some((e) => e.id === p.environmentPreset)
        ? (p.environmentPreset as ThreeDProject['environmentPreset'])
        : 'custom',
    environmentCustomName:
      typeof p.environmentCustomName === 'string' ? p.environmentCustomName.slice(0, 60) : '',
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
  'metal',
  'plastic',
  'glass',
  'emissive',
  'wireframe',
  'translucent',
  'terrain',
]);
const LIGHT_KINDS_SET = new Set<string>(['ambient', 'directional', 'point', 'spot']);
const SHOT_STATUSES_SET = new Set<string>(['draft', 'planned', 'ready', 'final']);
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
  // 材质受控参数：存在时必须为合法数值（归一化由 normalizeProject 完成）
  let materialParams: MaterialParams | undefined;
  if (a.materialParams !== undefined) {
    if (typeof a.materialParams !== 'object' || a.materialParams === null) {
      return { valid: false, reason: `资产 ${String(a.name)} 材质参数非法` };
    }
    const mp = a.materialParams as Record<string, unknown>;
    if (
      !isFiniteNum(mp.roughness) ||
      !isFiniteNum(mp.metalness) ||
      !isFiniteNum(mp.opacity) ||
      !isFiniteNum(mp.emissiveIntensity)
    ) {
      return { valid: false, reason: `资产 ${String(a.name)} 材质参数数值非法` };
    }
    materialParams = normalizeMaterialParams(mp);
  }
  // 灯光参数：light 资产必须有合法 light 字段（缺失时按旧版默认点光补齐）；非 light 资产不得携带
  let light: LightSettings | undefined;
  if (type === 'light') {
    if (a.light === undefined || a.light === null) {
      // 兼容 v1：旧版灯光只是标记，补齐默认点光参数
      light = defaultLightSettings('point');
    } else if (typeof a.light === 'object') {
      const l = a.light as Record<string, unknown>;
      if (typeof l.kind !== 'string' || !LIGHT_KINDS_SET.has(l.kind)) {
        return { valid: false, reason: `灯光资产 ${String(a.name)} 未知灯光种类` };
      }
      if (typeof l.enabled !== 'boolean' || !isFiniteNum(l.intensity) || !isHex(l.color)) {
        return { valid: false, reason: `灯光资产 ${String(a.name)} 参数非法` };
      }
      light = {
        kind: l.kind as LightSettings['kind'],
        enabled: l.enabled as boolean,
        intensity: Math.min(Math.max(l.intensity as number, 0), 20),
        color: l.color as string,
        temperature:
          l.temperature === null
            ? null
            : isFiniteNum(l.temperature)
              ? Math.min(Math.max(l.temperature as number, 1500), 12000)
              : null,
        shadowEnabled: l.shadowEnabled === true,
        range: isFiniteNum(l.range) ? Math.min(Math.max(l.range as number, 0), 100) : 0,
        angle: isFiniteNum(l.angle) ? Math.min(Math.max(l.angle as number, 0), 90) : 0,
        target: validateVec3(l.target) ? (l.target as [number, number, number]) : [0, 0, 0],
      };
    } else {
      return { valid: false, reason: `灯光资产 ${String(a.name)} 缺少 light 参数` };
    }
  } else if (a.light !== undefined) {
    return { valid: false, reason: `资产 ${String(a.name)} light 参数只能用于灯光资产` };
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
    // 缺失时按预设默认补全（v1 兼容），存在时归一化
    materialParams: materialParams ?? {
      ...MATERIAL_PRESET_PARAMS[a.materialPreset as MaterialPresetId],
    },
    light,
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

function validateImportedRegion(
  raw: unknown,
  seenIds: Set<string>,
  assetIds: Set<string>,
): { valid: true; region: ThreeDRegion } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '区域不是对象' };
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0)
    return { valid: false, reason: '区域 id 缺失' };
  if (seenIds.has(r.id)) return { valid: false, reason: `区域 id 重复：${r.id}` };
  seenIds.add(r.id);
  if (typeof r.name !== 'string' || r.name.trim().length === 0) {
    return { valid: false, reason: '区域名称缺失' };
  }
  if (!isHex(r.color)) return { valid: false, reason: `区域 ${String(r.name)} 颜色非法` };
  if (!validateVec3(r.center) || !validateVec3(r.size)) {
    return { valid: false, reason: `区域 ${String(r.name)} 边界数值非法` };
  }
  const assetIdsClean = Array.isArray(r.assetIds)
    ? r.assetIds
        .filter((x): x is string => typeof x === 'string' && assetIds.has(x))
        .slice(0, MAX_SELECTION)
    : [];
  return {
    valid: true,
    region: {
      id: r.id as string,
      name: (r.name as string).trim().slice(0, 60),
      purpose: typeof r.purpose === 'string' ? r.purpose.slice(0, 200) : '',
      style: typeof r.style === 'string' ? r.style.slice(0, 200) : '',
      dangerLevel: isFiniteNum(r.dangerLevel)
        ? Math.min(Math.max(r.dangerLevel as number, 0), 5)
        : 0,
      description: typeof r.description === 'string' ? r.description.slice(0, 1000) : '',
      color: r.color as string,
      assetIds: assetIdsClean,
      center: r.center as [number, number, number],
      size: r.size as [number, number, number],
    },
  };
}

function validateImportedShot(
  raw: unknown,
  seenIds: Set<string>,
  regionIds: Set<string>,
): { valid: true; shot: ThreeDShot } | { valid: false; reason: string } {
  if (typeof raw !== 'object' || raw === null) return { valid: false, reason: '镜头不是对象' };
  const s = raw as Record<string, unknown>;
  if (typeof s.id !== 'string' || s.id.length === 0)
    return { valid: false, reason: '镜头 id 缺失' };
  if (seenIds.has(s.id)) return { valid: false, reason: `镜头 id 重复：${s.id}` };
  seenIds.add(s.id);
  if (typeof s.name !== 'string' || s.name.trim().length === 0) {
    return { valid: false, reason: '镜头名称缺失' };
  }
  if (!validateVec3(s.position) || !validateVec3(s.target)) {
    return { valid: false, reason: `镜头 ${String(s.name)} 相机位置非法` };
  }
  const status = SHOT_STATUSES_SET.has(String(s.status)) ? (s.status as ShotStatus) : 'draft';
  return {
    valid: true,
    shot: {
      id: s.id as string,
      name: (s.name as string).trim().slice(0, 60),
      position: s.position as [number, number, number],
      target: s.target as [number, number, number],
      fov: isFiniteNum(s.fov) ? Math.min(Math.max(s.fov as number, 10), 120) : 50,
      regionId: typeof s.regionId === 'string' && regionIds.has(s.regionId) ? s.regionId : null,
      notes: typeof s.notes === 'string' ? s.notes.slice(0, 500) : '',
      status,
      favorite: s.favorite === true,
      at: isFiniteNum(s.at) ? (s.at as number) : NOW(),
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
  const personalPoses = Array.isArray(raw.personalPoses)
    ? raw.personalPoses
        .filter(
          (x): x is Record<string, unknown> =>
            typeof x === 'object' &&
            x !== null &&
            typeof (x as Record<string, unknown>).id === 'string',
        )
        .slice(0, MAX_PERSONAL_POSES)
        .map((x) => ({
          id: String(x.id).slice(0, 60),
          name: typeof x.name === 'string' ? x.name.slice(0, 40) : '姿态',
          pose: isPoseKey(x.pose) ? x.pose : 'stand',
          createdAt: isFiniteNum(x.createdAt) ? (x.createdAt as number) : NOW(),
        }))
    : [];
  return {
    codename: typeof raw.codename === 'string' ? raw.codename.slice(0, 60) : base.codename,
    role: typeof raw.role === 'string' ? raw.role.slice(0, 200) : base.role,
    ageGroup: typeof raw.ageGroup === 'string' ? raw.ageGroup.slice(0, 40) : base.ageGroup,
    bodyType: typeof raw.bodyType === 'string' ? raw.bodyType.slice(0, 40) : base.bodyType,
    style: typeof raw.style === 'string' ? raw.style.slice(0, 60) : base.style,
    personalityKeywords:
      typeof raw.personalityKeywords === 'string'
        ? raw.personalityKeywords.slice(0, 500)
        : base.personalityKeywords,
    appearanceKeywords:
      typeof raw.appearanceKeywords === 'string'
        ? raw.appearanceKeywords.slice(0, 500)
        : base.appearanceKeywords,
    clothingKeywords:
      typeof raw.clothingKeywords === 'string'
        ? raw.clothingKeywords.slice(0, 500)
        : base.clothingKeywords,
    equipmentKeywords:
      typeof raw.equipmentKeywords === 'string'
        ? raw.equipmentKeywords.slice(0, 500)
        : base.equipmentKeywords,
    bodyProportions:
      typeof raw.bodyProportions === 'string' ? raw.bodyProportions : base.bodyProportions,
    headRatio: isFiniteNum(raw.headRatio)
      ? Math.min(Math.max(raw.headRatio as number, 0.5), 2)
      : base.headRatio,
    shoulderWidth: isFiniteNum(raw.shoulderWidth)
      ? Math.min(Math.max(raw.shoulderWidth as number, 0.5), 2)
      : base.shoulderWidth,
    legLength: isFiniteNum(raw.legLength)
      ? Math.min(Math.max(raw.legLength as number, 0.5), 2)
      : base.legLength,
    primaryColor: isHex(raw.primaryColor) ? (raw.primaryColor as string) : base.primaryColor,
    secondaryColor: isHex(raw.secondaryColor)
      ? (raw.secondaryColor as string)
      : base.secondaryColor,
    palette: palette.length > 0 ? palette : base.palette,
    equipment,
    pose: isPoseKey(raw.pose) ? raw.pose : 'stand',
    personalPoses,
  };
}

function sanitizeWorld(raw: Record<string, unknown>): NonNullable<ThreeDProject['world']> {
  const base = defaultWorldSettings();
  return {
    eraStyle: typeof raw.eraStyle === 'string' ? raw.eraStyle.slice(0, 200) : base.eraStyle,
    location: typeof raw.location === 'string' ? raw.location.slice(0, 200) : base.location,
    regionNotes:
      typeof raw.regionNotes === 'string' ? raw.regionNotes.slice(0, 1000) : base.regionNotes,
    atmosphere: typeof raw.atmosphere === 'string' ? raw.atmosphere.slice(0, 500) : base.atmosphere,
    timeOfDay: typeof raw.timeOfDay === 'string' ? raw.timeOfDay : base.timeOfDay,
    weather: typeof raw.weather === 'string' ? raw.weather : base.weather,
    scale: isFiniteNum(raw.scale) && (raw.scale as number) > 0 ? (raw.scale as number) : base.scale,
    shotLanguage:
      typeof raw.shotLanguage === 'string' ? raw.shotLanguage.slice(0, 500) : base.shotLanguage,
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

/* ============================================================
 * v2 —— 资产层级（group 容器 / 嵌套 / 排序 / 删除策略）
 * ============================================================ */

export interface CreateGroupInput {
  name?: string;
  parentId?: string;
}

export function createGroup(
  project: ThreeDProject,
  input: CreateGroupInput = {},
): ThreeDAsset | null {
  if (project.assets.length >= MAX_ASSETS_PER_PROJECT) return null;
  const group = makeAsset({
    name: input.name?.trim() || '组合',
    type: 'group',
    parentId: input.parentId,
    color: '#94a3b8',
  });
  project.assets.push(group);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'group', `创建组合「${group.name}」`, group.id);
  return group;
}

/** 把一组资产移入目标父节点（阻止成为自身或后代的父节点） */
export function canNest(
  project: ThreeDProject,
  ids: string[],
  targetParentId: string | null,
): boolean {
  if (targetParentId === null) return true;
  if (ids.includes(targetParentId)) return false;
  // 目标父节点不能是任一被移动资产的子孙（否则形成循环）
  for (const id of ids) {
    if (descendantIds(project, id).includes(targetParentId)) return false;
  }
  return true;
}

export function nestAssets(
  project: ThreeDProject,
  ids: string[],
  targetParentId: string | null,
): { moved: number } {
  if (!canNest(project, ids, targetParentId)) return { moved: 0 };
  let moved = 0;
  for (const id of ids) {
    const asset = assetById(project, id);
    if (!asset || asset.locked) continue;
    asset.parentId = targetParentId ?? undefined;
    moved += 1;
  }
  project.updatedAt = NOW();
  project.history = appendHistory(
    project.history,
    'group',
    `移动 ${moved} 项资产${targetParentId ? ' 到组合' : ' 到顶层'}`,
  );
  return { moved };
}

/** 调整同一父节点下的资产顺序（数组顺序即树顺序） */
export function reorderAssets(
  project: ThreeDProject,
  parentId: string | null,
  orderedIds: string[],
): boolean {
  const children = assetChildren(project, parentId);
  if (orderedIds.length === 0) return false;
  const order = new Map<string, number>();
  orderedIds.forEach((id, i) => order.set(id, i));
  const hasAll = orderedIds.length === children.length && orderedIds.every((id) => order.has(id));
  if (!hasAll) return false;
  project.assets.sort((a, b) => {
    const pa = a.parentId ?? null;
    const pb = b.parentId ?? null;
    if (pa !== parentId || pb !== parentId) return 0;
    return (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  });
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'group', '调整资产顺序');
  return true;
}

/** 删除组合：策略一删除全部子项；策略二保留子项并提升到父级 */
export function deleteGroupWithStrategy(
  project: ThreeDProject,
  groupId: string,
  strategy: 'delete-children' | 'promote',
): boolean {
  const group = assetById(project, groupId);
  if (!group || group.type !== 'group') return false;
  if (strategy === 'delete-children') {
    return deleteAsset(project, groupId);
  }
  const children = assetChildren(project, groupId);
  // 提升策略：仅移除组合本身；直接子项改挂到组合的父级（后代保留在子项下）
  const removeIds = new Set([groupId]);
  for (const child of children) {
    // 子项保留自身变换，提升到组合的父级（组合变换不合并，保持确定性）
    child.parentId = group.parentId;
  }
  project.assets = project.assets.filter((a) => !removeIds.has(a.id));
  clearSelectionRefs(project, removeIds);
  project.updatedAt = NOW();
  project.history = appendHistory(
    project.history,
    'group',
    `删除组合「${group.name}」（保留 ${children.length} 个子项）`,
    groupId,
  );
  return true;
}

function clearSelectionRefs(project: ThreeDProject, ids: Set<string>) {
  if (project.activeAssetId && ids.has(project.activeAssetId)) project.activeAssetId = null;
  project.selectedAssetIds = project.selectedAssetIds.filter((id) => !ids.has(id));
}

/** 简单世界位置：沿父链累加（占位层级忽略旋转缩放，近似足够） */
export function simpleWorldPosition(project: ThreeDProject, assetId: string): Vec3Tuple {
  let asset = assetById(project, assetId);
  let pos: Vec3Tuple = [0, 0, 0];
  while (asset) {
    pos = [
      pos[0] + asset.transform.position[0],
      pos[1] + asset.transform.position[1],
      pos[2] + asset.transform.position[2],
    ];
    asset = asset.parentId ? assetById(project, asset.parentId) : undefined;
  }
  return pos;
}

/** 选择集共同中心（世界位置平均） */
export function selectionWorldCenter(project: ThreeDProject, ids: string[]): Vec3Tuple {
  const positions = ids.map((id) => simpleWorldPosition(project, id));
  if (positions.length === 0) return [0, 0, 0];
  const sum = positions.reduce<Vec3Tuple>(
    (acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]],
    [0, 0, 0],
  );
  return [
    Math.round((sum[0] / positions.length) * 1000) / 1000,
    Math.round((sum[1] / positions.length) * 1000) / 1000,
    Math.round((sum[2] / positions.length) * 1000) / 1000,
  ];
}

/* ============================================================
 * v2 —— 多选与批量操作
 * ============================================================ */

export function selectionTargets(project: ThreeDProject): ThreeDAsset[] {
  const ids =
    project.selectedAssetIds.length > 0
      ? project.selectedAssetIds
      : project.activeAssetId
        ? [project.activeAssetId]
        : [];
  return ids.map((id) => assetById(project, id)).filter((a): a is ThreeDAsset => Boolean(a));
}

export function syncSelection(project: ThreeDProject, ids: string[]): void {
  const valid = ids.filter((id) => assetById(project, id)).slice(0, MAX_SELECTION);
  project.selectedAssetIds = valid;
  if (valid.length > 0) {
    project.activeAssetId = valid[valid.length - 1] ?? null;
  } else {
    project.activeAssetId = null;
  }
}

export function selectByType(project: ThreeDProject, type: ThreeDAsset['type']): string[] {
  return project.assets.filter((a) => a.type === type && !a.parentId).map((a) => a.id);
}

export function invertSelection(project: ThreeDProject, current: string[]): string[] {
  const roots = project.assets.filter((a) => !a.parentId).map((a) => a.id);
  return roots.filter((id) => !current.includes(id)).slice(0, MAX_SELECTION);
}

function batchUpdateAssets(
  project: ThreeDProject,
  ids: string[],
  mutate: (asset: ThreeDAsset) => void,
  label: string,
  kind: HistoryOpKind,
): number {
  let changed = 0;
  for (const id of ids) {
    const asset = assetById(project, id);
    if (!asset || asset.locked) continue;
    mutate(asset);
    changed += 1;
  }
  if (changed > 0) {
    project.updatedAt = NOW();
    project.history = appendHistory(project.history, kind, `${label}（${changed} 项）`);
  }
  return changed;
}

export function batchSetVisible(project: ThreeDProject, ids: string[], visible: boolean): number {
  return batchUpdateAssets(
    project,
    ids,
    (a) => {
      a.visible = visible;
    },
    visible ? '批量显示' : '批量隐藏',
    'update',
  );
}

export function batchSetLocked(project: ThreeDProject, ids: string[], locked: boolean): number {
  // 解锁必须绕过 locked 检查（锁定状态本身就是要修改的目标）
  let changed = 0;
  for (const id of ids) {
    const asset = assetById(project, id);
    if (!asset || asset.locked === locked) continue;
    asset.locked = locked;
    changed += 1;
  }
  if (changed > 0) {
    project.updatedAt = NOW();
    project.history = appendHistory(
      project.history,
      'update',
      `${locked ? '批量锁定' : '批量解锁'}（${changed} 项）`,
    );
  }
  return changed;
}

export function batchSetColor(project: ThreeDProject, ids: string[], color: string): number {
  if (!isHexColor(color)) return 0;
  return batchUpdateAssets(
    project,
    ids,
    (a) => {
      a.color = color;
    },
    '批量改色',
    'color',
  );
}

export function batchResetTransform(project: ThreeDProject, ids: string[]): number {
  return batchUpdateAssets(
    project,
    ids,
    (a) => {
      a.transform = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    },
    '批量重置变换',
    'transform',
  );
}

export function batchDelete(project: ThreeDProject, ids: string[]): number {
  const targets = ids
    .map((id) => assetById(project, id))
    .filter((a): a is ThreeDAsset => a !== undefined && !a.locked);
  const removeIds = new Set<string>();
  for (const a of targets) {
    removeIds.add(a.id);
    for (const d of descendantIds(project, a.id)) removeIds.add(d);
  }
  if (removeIds.size === 0) return 0;
  project.assets = project.assets.filter((a) => !removeIds.has(a.id));
  clearSelectionRefs(project, removeIds);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'delete', `批量删除 ${targets.length} 项`);
  return targets.length;
}

/** 把选择集组合为新 group（共同中心为基准；仅组合选择集内的顶层项，后代跟随） */
export function groupSelection(
  project: ThreeDProject,
  ids: string[],
  name?: string,
): ThreeDAsset | null {
  const candidates = ids
    .map((id) => assetById(project, id))
    .filter((a): a is ThreeDAsset => a !== undefined && !a.locked);
  const candidateIds = new Set(candidates.map((a) => a.id));
  // 顶层优先：排除祖先也在选择集内的项（后代随祖先一起移动）
  const targets = candidates.filter((a) => {
    let cursor = a.parentId ? assetById(project, a.parentId) : undefined;
    while (cursor) {
      if (candidateIds.has(cursor.id)) return false;
      cursor = cursor.parentId ? assetById(project, cursor.parentId) : undefined;
    }
    return true;
  });
  if (targets.length === 0) return null;
  const group = createGroup(project, { name });
  if (!group) return null;
  const center = selectionWorldCenter(
    project,
    targets.map((a) => a.id),
  );
  group.transform.position = center;
  // 先计算世界位置，再重新挂载（避免父链变化影响计算）
  const worlds = targets.map((a) => ({ id: a.id, world: simpleWorldPosition(project, a.id) }));
  for (const a of targets) {
    a.parentId = group.id;
  }
  for (const { id, world } of worlds) {
    const asset = assetById(project, id);
    if (!asset) continue;
    // 保持世界位置：局部 = 世界 - 组中心
    asset.transform.position = [
      Math.round((world[0] - center[0]) * 1000) / 1000,
      Math.round((world[1] - center[1]) * 1000) / 1000,
      Math.round((world[2] - center[2]) * 1000) / 1000,
    ];
  }
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'group', `组合 ${targets.length} 项资产`);
  return group;
}

function rotateVec3(v: Vec3Tuple, axis: 0 | 1 | 2, deg: number): Vec3Tuple {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const [x, y, z] = v;
  if (axis === 0) return [x, y * c - z * s, y * s + z * c];
  if (axis === 1) return [x * c + z * s, y, -x * s + z * c];
  return [x * c - y * s, x * s + y * c, z];
}

/**
 * 批量变换：移动直接叠加位移；旋转 / 缩放以共同中心为基准调整位置偏移，
 * 同时作用于各资产自身旋转 / 缩放（占位模型局部近似，文档化）。
 */
export function batchTransform(
  project: ThreeDProject,
  ids: string[],
  op: 'move' | 'rotate' | 'scale',
  delta: Vec3Tuple,
): number {
  const targets = ids
    .map((id) => assetById(project, id))
    .filter((a): a is ThreeDAsset => a !== undefined && !a.locked);
  if (targets.length === 0) return 0;
  const center = selectionWorldCenter(
    project,
    targets.map((a) => a.id),
  );
  for (const asset of targets) {
    const t = cloneTransform(asset.transform);
    if (op === 'move') {
      t.position = [
        Math.round((t.position[0] + delta[0]) * 1000) / 1000,
        Math.round((t.position[1] + delta[1]) * 1000) / 1000,
        Math.round((t.position[2] + delta[2]) * 1000) / 1000,
      ];
    } else if (op === 'rotate') {
      const rel: Vec3Tuple = [
        t.position[0] - center[0],
        t.position[1] - center[1],
        t.position[2] - center[2],
      ];
      let rotated = rotateVec3(rel, 2, delta[2]);
      rotated = rotateVec3(rotated, 1, delta[1]);
      rotated = rotateVec3(rotated, 0, delta[0]);
      t.position = [
        Math.round((center[0] + rotated[0]) * 1000) / 1000,
        Math.round((center[1] + rotated[1]) * 1000) / 1000,
        Math.round((center[2] + rotated[2]) * 1000) / 1000,
      ];
      t.rotation = [
        Math.round((t.rotation[0] + delta[0]) * 100) / 100,
        Math.round((t.rotation[1] + delta[1]) * 100) / 100,
        Math.round((t.rotation[2] + delta[2]) * 100) / 100,
      ];
    } else {
      const factor: Vec3Tuple = [
        delta[0] === 0 ? 1 : 1 + delta[0],
        delta[1] === 0 ? 1 : 1 + delta[1],
        delta[2] === 0 ? 1 : 1 + delta[2],
      ];
      const rel: Vec3Tuple = [
        t.position[0] - center[0],
        t.position[1] - center[1],
        t.position[2] - center[2],
      ];
      t.position = [
        Math.round((center[0] + rel[0] * factor[0]) * 1000) / 1000,
        Math.round((center[1] + rel[1] * factor[1]) * 1000) / 1000,
        Math.round((center[2] + rel[2] * factor[2]) * 1000) / 1000,
      ];
      t.scale = [
        Math.min(Math.max(t.scale[0] * factor[0], 0.01), 100),
        Math.min(Math.max(t.scale[1] * factor[1], 0.01), 100),
        Math.min(Math.max(t.scale[2] * factor[2], 0.01), 100),
      ];
    }
    asset.transform = t;
  }
  project.updatedAt = NOW();
  project.history = appendHistory(
    project.history,
    'transform',
    `批量${op === 'move' ? '移动' : op === 'rotate' ? '旋转' : '缩放'}（${targets.length} 项，共同中心）`,
  );
  return targets.length;
}

export interface ThreeDUiSnap {
  grid: boolean;
  gridStep: number;
  angle: boolean;
  angleStep: number;
  scale: boolean;
  scaleStep: number;
}

/** 吸附：位置 → 网格步长；旋转 → 角度步长；缩放 → 比例步长 */
export function applySnap(
  value: number,
  kind: 'grid' | 'angle' | 'scale',
  snap: ThreeDUiSnap,
): number {
  if (kind === 'grid' && snap.grid) {
    const step = snap.gridStep > 0 ? snap.gridStep : 0.5;
    return Math.round(value / step) * step;
  }
  if (kind === 'angle' && snap.angle) {
    const step = snap.angleStep > 0 ? snap.angleStep : 15;
    return Math.round(value / step) * step;
  }
  if (kind === 'scale' && snap.scale) {
    const step = snap.scaleStep > 0 ? snap.scaleStep : 0.25;
    return Math.round(value / step) * step;
  }
  return Math.round(value * 1000) / 1000;
}

/* ============================================================
 * v2 —— 材质 / 灯光 / 环境
 * ============================================================ */

export function setMaterialPreset(
  project: ThreeDProject,
  assetId: string,
  preset: MaterialPresetId,
): ThreeDAsset | null {
  return updateAsset(
    project,
    assetId,
    {
      materialPreset: preset,
      // 切换预设时重置为「该预设」的默认受控参数（非标准默认）
      materialParams: { ...MATERIAL_PRESET_PARAMS[preset] },
    },
    '材质预设更新',
    'material',
  );
}

export function updateMaterialParams(
  project: ThreeDProject,
  assetId: string,
  params: Partial<MaterialParams>,
): ThreeDAsset | null {
  const asset = assetById(project, assetId);
  if (!asset) return null;
  const next = normalizeMaterialParams({ ...asset.materialParams, ...params });
  return updateAsset(project, assetId, { materialParams: next }, '材质参数更新', 'material');
}

const LIGHT_KIND_LABELS: Record<LightKind, string> = {
  ambient: '环境光',
  directional: '方向光',
  point: '点光',
  spot: '聚光灯',
};

export function addLightToProject(
  project: ThreeDProject,
  kind: LightKind,
  parentId?: string,
): ThreeDAsset | null {
  if (lightLimitReached(project.assets)) return null;
  const asset = makeAsset({
    name: `${LIGHT_KIND_LABELS[kind] ?? '灯光'}`,
    type: 'light',
    parentId,
    color: kind === 'ambient' ? '#fbbf24' : '#ffffff',
    materialPreset: 'emissive',
    light: defaultLightSettings(kind),
    materialParams: normalizeMaterialParams({ emissiveIntensity: 0.5 }),
  });
  project.assets.push(asset);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'light', `新增${asset.name}`, asset.id);
  return asset;
}

export function updateLightSettings(
  project: ThreeDProject,
  assetId: string,
  patch: Partial<LightSettings>,
): ThreeDAsset | null {
  const asset = assetById(project, assetId);
  if (!asset || asset.type !== 'light') return null;
  const current = asset.light ?? defaultLightSettings('point');
  const next: LightSettings = {
    ...current,
    ...patch,
    intensity: clampFinite(patch.intensity ?? current.intensity, 0, 20),
    range: clampFinite(patch.range ?? current.range, 0, 100),
    angle: clampFinite(patch.angle ?? current.angle, 0, 90),
    temperature:
      patch.temperature === null
        ? null
        : clampFinite(patch.temperature ?? current.temperature ?? 6500, 1500, 12000),
  };
  if (
    next.kind !== 'ambient' &&
    next.kind !== 'directional' &&
    next.kind !== 'point' &&
    next.kind !== 'spot'
  ) {
    next.kind = 'point';
  }
  return updateAsset(project, assetId, { light: next }, '灯光参数更新', 'light');
}

function clampFinite(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, min), max) : min;
}

/** 应用环境预设（可撤销；写入完整场景设置） */
export function applyEnvironmentPreset(
  project: ThreeDProject,
  id: EnvironmentPresetId,
): ThreeDProject {
  const preset = environmentPresetById(id);
  const next = cloneProject(project);
  if (preset) {
    next.sceneSettings = JSON.parse(
      JSON.stringify(preset.settings),
    ) as ThreeDProject['sceneSettings'];
    next.environmentPreset = id;
    next.environmentCustomName = '';
  }
  next.updatedAt = NOW();
  next.history = appendHistory(
    next.history,
    'environment',
    `应用环境预设「${preset?.name ?? id}」`,
  );
  return next;
}

export function saveCustomEnvironment(project: ThreeDProject, name: string): ThreeDProject {
  const next = cloneProject(project);
  next.environmentPreset = 'custom';
  next.environmentCustomName = name.trim().slice(0, 60) || '自定义环境';
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'environment', '保存自定义环境');
  return next;
}

/* ============================================================
 * v2 —— 角色档案 / 姿态
 * ============================================================ */

export function setCharacterPose(project: ThreeDProject, pose: PoseKey): ThreeDProject {
  if (!isPoseKey(pose)) return project;
  const next = cloneProject(project);
  next.character = { ...(next.character ?? defaultCharacterSettings()), pose };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'pose', `应用姿态：${pose}`);
  return next;
}

export function addPersonalPose(
  project: ThreeDProject,
  name: string,
  pose: PoseKey,
): ThreeDProject | null {
  const next = cloneProject(project);
  const list = next.character?.personalPoses ?? [];
  if (list.length >= MAX_PERSONAL_POSES) return null;
  const entry: PersonalPosePreset = {
    id: IDENTITY(),
    name: name.trim().slice(0, 40) || `姿态 ${list.length + 1}`,
    pose,
    createdAt: NOW(),
  };
  next.character = {
    ...(next.character ?? defaultCharacterSettings()),
    personalPoses: [...list, entry],
  };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'pose', `保存个人姿态「${entry.name}」`);
  return next;
}

export function copyPersonalPose(project: ThreeDProject, poseId: string): ThreeDProject | null {
  const list = project.character?.personalPoses ?? [];
  if (list.length >= MAX_PERSONAL_POSES) return null;
  const source = list.find((p) => p.id === poseId);
  if (!source) return null;
  const next = cloneProject(project);
  const copy: PersonalPosePreset = {
    id: IDENTITY(),
    name: `${source.name}（副本）`,
    pose: source.pose,
    createdAt: NOW(),
  };
  next.character = {
    ...(next.character ?? defaultCharacterSettings()),
    personalPoses: [...(next.character?.personalPoses ?? []), copy],
  };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'pose', `复制个人姿态「${source.name}」`);
  return next;
}

export function deletePersonalPose(project: ThreeDProject, poseId: string): ThreeDProject {
  const next = cloneProject(project);
  const list = next.character?.personalPoses ?? [];
  next.character = {
    ...(next.character ?? defaultCharacterSettings()),
    personalPoses: list.filter((p) => p.id !== poseId),
  };
  next.updatedAt = NOW();
  next.history = appendHistory(next.history, 'pose', '删除个人姿态');
  return next;
}

/** 应用个人姿态预设（等价于应用其姿态键） */
export function applyPersonalPose(project: ThreeDProject, poseId: string): ThreeDProject {
  const entry = project.character?.personalPoses.find((p) => p.id === poseId);
  if (!entry) return project;
  return setCharacterPose(project, entry.pose);
}

/* ---- Chat 文本草稿 → 角色档案预填（确定性规则，不自动生成） ---- */

const STYLE_DICT = [
  '科幻',
  '赛博',
  '奇幻',
  '中世纪',
  '现代',
  '复古',
  '写实',
  '卡通',
  '机甲',
  '废土',
  '蒸汽',
  '童话',
  '和风',
  '军武',
];

const APPAREL_DICT = [
  '兜帽',
  '披风',
  '铠甲',
  '长袍',
  '护目镜',
  '义肢',
  '面罩',
  '头盔',
  '斗篷',
  '皮衣',
  '制服',
];

export interface CharacterPrefill {
  codename: string;
  role: string;
  style: string;
  personalityKeywords: string;
  appearanceKeywords: string;
  clothingKeywords: string;
  equipmentKeywords: string;
}

export function prefillCharacterFromText(text: string): CharacterPrefill {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const codename = (lines[0] ?? '').slice(0, 30);
  const role = (lines[1] ?? lines[0] ?? '').slice(0, 60);
  const style = STYLE_DICT.find((s) => text.includes(s)) ?? '';
  // 引号 / 括号内短语作为个性关键词（最多 4 个）
  const quoted = text.match(/[「『“"（(]([^」』”"）)]{2,20})[」』”"）)]/g) ?? [];
  const personalityKeywords = quoted
    .map((q) => q.replace(/[「『“"（(」』”"）)]/g, '').trim())
    .filter(Boolean)
    .slice(0, 4)
    .join('、');
  const apparels = APPAREL_DICT.filter((k) => text.includes(k)).slice(0, 4);
  return {
    codename,
    role,
    style,
    personalityKeywords,
    appearanceKeywords: apparels.join('、'),
    clothingKeywords: apparels.join('、'),
    equipmentKeywords: '',
  };
}

/* ============================================================
 * v2 —— 世界区域（Region）
 * ============================================================ */

export function addRegionToProject(
  project: ThreeDProject,
  over: Partial<ThreeDRegion> = {},
): ThreeDRegion | null {
  if (project.regions.length >= MAX_REGIONS) return null;
  const region = defaultRegion(over);
  project.regions.push(region);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'region', `创建区域「${region.name}」`);
  return region;
}

export function updateRegion(
  project: ThreeDProject,
  regionId: string,
  patch: Partial<Omit<ThreeDRegion, 'id'>>,
): ThreeDRegion | null {
  const region = project.regions.find((r) => r.id === regionId);
  if (!region) return null;
  const idx = project.regions.findIndex((r) => r.id === regionId);
  const next: ThreeDRegion = {
    ...region,
    ...patch,
    id: region.id,
    dangerLevel: clampFinite(patch.dangerLevel ?? region.dangerLevel, 0, 5),
    assetIds: (patch.assetIds ?? region.assetIds)
      .filter((id) => assetById(project, id))
      .slice(0, MAX_SELECTION),
  };
  project.regions[idx] = next;
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'region', `更新区域「${next.name}」`);
  return next;
}

export function deleteRegion(project: ThreeDProject, regionId: string): boolean {
  const idx = project.regions.findIndex((r) => r.id === regionId);
  if (idx < 0) return false;
  const name = project.regions[idx]?.name ?? '';
  project.regions = project.regions.filter((r) => r.id !== regionId);
  // 关联镜头解除绑定
  for (const shot of project.shots) {
    if (shot.regionId === regionId) shot.regionId = null;
  }
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'region', `删除区域「${name}」`);
  return true;
}

export function assetsInRegion(project: ThreeDProject, regionId: string): string[] {
  const region = project.regions.find((r) => r.id === regionId);
  if (!region) return [];
  return region.assetIds.filter((id) => assetById(project, id));
}

/* ============================================================
 * v2 —— 镜头（Shot）与分镜
 * ============================================================ */

export function addShotToProject(
  project: ThreeDProject,
  camera: ThreeDCameraState,
  over: Partial<ThreeDShot> = {},
): ThreeDShot | null {
  if (project.shots.length >= MAX_SHOTS) return null;
  const shot = defaultShot({
    position: isVec3(camera.position) ? [...camera.position] : undefined,
    target: isVec3(camera.target) ? [...camera.target] : undefined,
    fov: clampFinite(camera.fov, 10, 120),
    ...over,
  });
  project.shots.push(shot);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'shot', `保存镜头「${shot.name}」`, shot.id);
  return shot;
}

export function updateShot(
  project: ThreeDProject,
  shotId: string,
  patch: Partial<Omit<ThreeDShot, 'id'>>,
): ThreeDShot | null {
  const idx = project.shots.findIndex((s) => s.id === shotId);
  if (idx < 0) return null;
  const current = project.shots[idx]!;
  const next: ThreeDShot = {
    ...current,
    ...patch,
    id: current.id,
    fov: clampFinite(patch.fov ?? current.fov, 10, 120),
    regionId:
      patch.regionId === null ||
      (typeof patch.regionId === 'string' && project.regions.some((r) => r.id === patch.regionId))
        ? patch.regionId
        : current.regionId,
  };
  if (patch.position && isVec3(patch.position)) next.position = [...patch.position];
  if (patch.target && isVec3(patch.target)) next.target = [...patch.target];
  project.shots[idx] = next;
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'shot', `更新镜头「${next.name}」`);
  return next;
}

export function deleteShot(project: ThreeDProject, shotId: string): boolean {
  const idx = project.shots.findIndex((s) => s.id === shotId);
  if (idx < 0) return false;
  project.shots = project.shots.filter((s) => s.id !== shotId);
  if (project.activeShotId === shotId) project.activeShotId = null;
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'shot', '删除镜头');
  return true;
}

export function copyShot(project: ThreeDProject, shotId: string): ThreeDShot | null {
  if (project.shots.length >= MAX_SHOTS) return null;
  const source = project.shots.find((s) => s.id === shotId);
  if (!source) return null;
  // JSON 克隆：source 可能是 Vue 响应式 Proxy，structuredClone 会抛 DataCloneError
  const copy: ThreeDShot = {
    ...(JSON.parse(JSON.stringify(source)) as ThreeDShot),
    id: IDENTITY(),
    name: `${source.name}（副本）`,
    at: NOW(),
  };
  project.shots.push(copy);
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'shot', `复制镜头「${source.name}」`, copy.id);
  return copy;
}

export function reorderShots(project: ThreeDProject, orderedIds: string[]): boolean {
  const order = new Map(orderedIds.map((id, i) => [id, i]));
  if (project.shots.length !== orderedIds.length || !project.shots.every((s) => order.has(s.id))) {
    return false;
  }
  project.shots = [...project.shots].sort(
    (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
  );
  project.updatedAt = NOW();
  project.history = appendHistory(project.history, 'shot', '调整镜头顺序');
  return true;
}

export function toggleShotFavorite(project: ThreeDProject, shotId: string): boolean {
  const shot = project.shots.find((s) => s.id === shotId);
  if (!shot) return false;
  shot.favorite = !shot.favorite;
  project.updatedAt = NOW();
  project.history = appendHistory(
    project.history,
    'shot',
    shot.favorite ? '收藏镜头' : '取消收藏镜头',
  );
  return true;
}

/* ---- 分镜 / 角色简报导出 ---- */

function shotSummary(project: ThreeDProject, shot: ThreeDShot): string {
  const region = shot.regionId ? project.regions.find((r) => r.id === shot.regionId) : undefined;
  return `- ${shot.name}${shot.favorite ? ' ★' : ''}：位置 ${shot.position.join(',')} / 目标 ${shot.target.join(',')} / FOV ${shot.fov}°${region ? ` / 区域：${region.name}` : ''}${shot.notes ? ` / 备注：${shot.notes}` : ''}（${shot.status}）`;
}

export function storyboardMarkdown(project: ThreeDProject): string {
  const lines: string[] = [];
  lines.push(`# 分镜板：${project.name}`);
  lines.push('');
  lines.push(`- 项目类型：${project.type}`);
  if (project.shots.length === 0) {
    lines.push('');
    lines.push('（暂无镜头）');
  } else {
    lines.push('');
    lines.push(`## 镜头（${project.shots.length}）`);
    lines.push('');
    project.shots.forEach((s) => lines.push(shotSummary(project, s)));
  }
  if (project.regions.length > 0) {
    lines.push('');
    lines.push(`## 区域（${project.regions.length}）`);
    lines.push('');
    for (const r of project.regions) {
      lines.push(
        `- ${r.name}：${r.purpose || '未设定用途'} · 危险 ${r.dangerLevel}/5 · ${r.style || '未设定风格'}`,
      );
    }
  }
  lines.push('');
  lines.push('> 由 Personal OS 3D 工作台导出（本地模拟建议）');
  return lines.join('\n');
}

export function storyboardJson(project: ThreeDProject): string {
  return JSON.stringify(
    {
      app: 'personal-os-3d',
      kind: 'storyboard',
      projectId: project.id,
      projectName: project.name,
      shots: project.shots.map((s) => ({
        id: s.id,
        name: s.name,
        position: s.position,
        target: s.target,
        fov: s.fov,
        regionId: s.regionId,
        notes: s.notes,
        status: s.status,
        favorite: s.favorite,
      })),
      regions: project.regions.map((r) => ({
        id: r.id,
        name: r.name,
        purpose: r.purpose,
        dangerLevel: r.dangerLevel,
      })),
      exportedAt: NOW(),
    },
    null,
    2,
  );
}

export function characterBriefMarkdown(project: ThreeDProject): string {
  const c = project.character ?? defaultCharacterSettings();
  const lines: string[] = [];
  lines.push(`# 角色设计板：${project.name}`);
  lines.push('');
  lines.push('## 档案');
  lines.push(`- 姓名 / 代号：${c.codename || project.name}`);
  lines.push(`- 定位：${c.role || '未设定'}`);
  lines.push(`- 年龄段：${c.ageGroup || '未设定'}`);
  lines.push(`- 体型：${c.bodyType || '未设定'}`);
  lines.push(`- 风格：${c.style || '未设定'}`);
  if (c.personalityKeywords) lines.push(`- 个性：${c.personalityKeywords}`);
  if (c.appearanceKeywords) lines.push(`- 外观：${c.appearanceKeywords}`);
  if (c.clothingKeywords) lines.push(`- 服装：${c.clothingKeywords}`);
  if (c.equipmentKeywords) lines.push(`- 装备：${c.equipmentKeywords}`);
  lines.push('');
  lines.push('## 外观');
  lines.push(`- 体型比例：${c.bodyProportions}`);
  lines.push(`- 头部比例：${c.headRatio}`);
  lines.push(`- 肩宽：${c.shoulderWidth}`);
  lines.push(`- 腿长：${c.legLength}`);
  lines.push(`- 主色：${c.primaryColor}`);
  lines.push(`- 辅色：${c.secondaryColor}`);
  if (c.palette.length > 0) lines.push(`- 配色：${c.palette.join(' / ')}`);
  if (c.equipment.length > 0) lines.push(`- 装备占位：${c.equipment.join('、')}`);
  lines.push('');
  lines.push('## 姿态');
  lines.push(`- 当前姿态：${c.pose}`);
  if (c.personalPoses.length > 0) {
    lines.push(`- 个人姿态：${c.personalPoses.map((p) => `${p.name}（${p.pose}）`).join('、')}`);
  }
  lines.push('');
  lines.push('## 镜头');
  if (project.shots.length > 0) {
    project.shots.forEach((s) => lines.push(shotSummary(project, s)));
  } else {
    lines.push('- （暂无镜头）');
  }
  lines.push('');
  lines.push('> 由 Personal OS 3D 工作台导出（本地模拟建议）');
  return lines.join('\n');
}

export function characterBriefJson(project: ThreeDProject): string {
  return JSON.stringify(
    {
      app: 'personal-os-3d',
      kind: 'character-brief',
      projectId: project.id,
      projectName: project.name,
      character: project.character ?? null,
      shots: project.shots,
      brief: project.generationBrief,
      exportedAt: NOW(),
    },
    null,
    2,
  );
}

/* ============================================================
 * v2 —— 资产预设库与项目模板
 * ============================================================ */

/** 插入预设：全部复制为全新 ID，根资产落在 spawn 位置，子项保持相对坐标 */
export function insertAssetPreset(
  project: ThreeDProject,
  preset: AssetPreset,
  spawn: Vec3Tuple = [0, 0, 0],
): ThreeDAsset | null {
  if (project.assets.length + preset.assets.length > MAX_ASSETS_PER_PROJECT) return null;
  const idMap = new Map<string, string>();
  const placed: ThreeDAsset[] = [];
  for (const src of preset.assets) {
    const copy = cloneAsset(src);
    copy.id = IDENTITY();
    copy.locked = false;
    copy.notes = src.notes
      ? `${src.notes}（来自预设「${preset.name}」）`
      : `来自预设「${preset.name}」`;
    idMap.set(src.id, copy.id);
    if (src.parentId) {
      copy.parentId = idMap.get(src.parentId) ?? src.parentId;
    } else {
      copy.transform = {
        ...copy.transform,
        position: [
          Math.round((src.transform.position[0] + spawn[0]) * 1000) / 1000,
          Math.round((src.transform.position[1] + spawn[1]) * 1000) / 1000,
          Math.round((src.transform.position[2] + spawn[2]) * 1000) / 1000,
        ],
      };
    }
    placed.push(copy);
  }
  project.assets.push(...placed);
  const root = placed.find((a) => !a.parentId) ?? placed[0] ?? null;
  project.updatedAt = NOW();
  project.history = appendHistory(
    project.history,
    'preset',
    `插入预设「${preset.name}」（${placed.length} 项）`,
    root?.id,
  );
  return root;
}

/** 从选择集生成个人资产预设（本地 ID 稳定化，可反复插入） */
export function presetFromSelection(
  project: ThreeDProject,
  ids: string[],
  name: string,
  category: string,
  description = '',
): AssetPreset | null {
  const roots = ids.filter((id) => {
    const a = assetById(project, id);
    return a && !ids.includes(a.parentId ?? '');
  });
  const included = new Set<string>();
  for (const r of roots) {
    included.add(r);
    for (const d of descendantIds(project, r)) included.add(d);
  }
  if (included.size === 0 || included.size > MAX_PRESET_ASSETS) return null;
  const assets = [...included]
    .map((id) => assetById(project, id))
    .filter((a): a is ThreeDAsset => Boolean(a))
    .map(cloneAsset);
  const localIds = new Map<string, string>();
  assets.forEach((a, i) => localIds.set(a.id, `P${i + 1}`));
  for (const a of assets) {
    a.id = localIds.get(a.id)!;
    a.parentId = a.parentId && localIds.has(a.parentId) ? localIds.get(a.parentId) : undefined;
    a.locked = false;
  }
  return {
    id: IDENTITY(),
    name: name.trim().slice(0, 40) || '未命名预设',
    category: category.trim().slice(0, 20) || '自定义',
    description: description.slice(0, 200),
    keywords: [],
    builtin: false,
    favorite: false,
    assets,
    createdAt: NOW(),
  };
}

/** 项目 → 个人模板（快照；应用时校验 + ID 重映射，不共享可变引用） */
export function templateFromProject(
  project: ThreeDProject,
  name: string,
  description = '',
): ThreeDProjectTemplate {
  const snapshot = cloneProject(project);
  snapshot.history = [];
  return {
    id: IDENTITY(),
    name: normalizeName(name),
    description: description.trim().slice(0, 200),
    type: project.type,
    builtin: false,
    sourceProject: snapshot,
    createdAt: NOW(),
  };
}

/** 全量 ID 重映射：项目 / 资产 / 区域 / 镜头（保持相互引用一致） */
export function remapProjectIds(project: ThreeDProject): ThreeDProject {
  const p = cloneProject(project);
  const idMap = new Map<string, string>([[p.id, IDENTITY()]]);
  p.id = idMap.get(project.id)!;
  for (const a of p.assets) idMap.set(a.id, IDENTITY());
  for (const a of p.assets) {
    a.id = idMap.get(a.id)!;
    if (a.parentId && idMap.has(a.parentId)) a.parentId = idMap.get(a.parentId);
  }
  for (const r of p.regions) idMap.set(r.id, IDENTITY());
  for (const r of p.regions) {
    r.id = idMap.get(r.id)!;
    r.assetIds = r.assetIds.map((x) => idMap.get(x) ?? x).filter(Boolean);
  }
  for (const s of p.shots) idMap.set(s.id, IDENTITY());
  for (const s of p.shots) {
    s.id = idMap.get(s.id)!;
    if (s.regionId && idMap.has(s.regionId)) s.regionId = idMap.get(s.regionId) ?? null;
  }
  p.activeAssetId =
    p.activeAssetId && idMap.has(p.activeAssetId) ? (idMap.get(p.activeAssetId) ?? null) : null;
  p.selectedAssetIds = p.selectedAssetIds.map((x) => idMap.get(x) ?? x).filter(Boolean);
  p.activeShotId =
    p.activeShotId && idMap.has(p.activeShotId) ? (idMap.get(p.activeShotId) ?? null) : null;
  p.history = [];
  p.createdAt = NOW();
  p.updatedAt = NOW();
  return p;
}

/** 应用个人模板：走导入校验 + ID 重映射，生成全新项目（不共享引用） */
export function applyTemplateToProject(template: ThreeDProjectTemplate): ThreeDProject | null {
  if (template.builtin || !template.sourceProject) return null;
  const validated = validateImportedProject(template.sourceProject);
  if (!validated.valid) return null;
  const remapped = remapProjectIds(validated.project);
  remapped.name = normalizeName(template.name);
  remapped.description = template.description;
  return remapped;
}

export function templateExportFile(template: ThreeDProjectTemplate): ThreeDTemplateExportFile {
  return {
    app: 'personal-os-3d',
    version: THREE_D_EXPORT_VERSION,
    kind: 'template',
    exportedAt: NOW(),
    template: JSON.parse(JSON.stringify(template)) as ThreeDProjectTemplate,
  };
}

/* ============================================================
 * v2 —— 归一化（v1 迁移 / 宽松兼容读取 / 模板快照）
 *
 * 旧项目绝不能因字段缺失无法打开：所有新字段（层级、材质参数、灯光、
 * 角色档案、区域、镜头、环境预设）缺失时填充默认值；损坏资产逐条丢弃
 * 保留其余；迁移幂等（对已是 v2 的数据再次调用结果不变）。
 * ============================================================ */

function normalizeSceneRaw(raw: unknown): ThreeDProject['sceneSettings'] {
  const base = defaultSceneSettings();
  if (typeof raw !== 'object' || raw === null) return base;
  const s = raw as Record<string, unknown>;
  const amb = (
    typeof s.ambientLight === 'object' && s.ambientLight !== null ? s.ambientLight : {}
  ) as Record<string, unknown>;
  const main = (
    typeof s.mainLight === 'object' && s.mainLight !== null ? s.mainLight : {}
  ) as Record<string, unknown>;
  const fog = (typeof s.fog === 'object' && s.fog !== null ? s.fog : {}) as Record<string, unknown>;
  return {
    background: isHex(s.background) ? (s.background as string) : base.background,
    groundColor: isHex(s.groundColor) ? (s.groundColor as string) : base.groundColor,
    groundVisible: typeof s.groundVisible === 'boolean' ? s.groundVisible : base.groundVisible,
    gridVisible: typeof s.gridVisible === 'boolean' ? s.gridVisible : base.gridVisible,
    axesVisible: typeof s.axesVisible === 'boolean' ? s.axesVisible : base.axesVisible,
    ambientLight: {
      enabled: typeof amb.enabled === 'boolean' ? amb.enabled : base.ambientLight.enabled,
      color: isHex(amb.color) ? (amb.color as string) : base.ambientLight.color,
      intensity:
        isFiniteNum(amb.intensity) && (amb.intensity as number) >= 0
          ? Math.min(Math.max(amb.intensity as number, 0), 3)
          : base.ambientLight.intensity,
    },
    mainLight: {
      enabled: typeof main.enabled === 'boolean' ? main.enabled : base.mainLight.enabled,
      color: isHex(main.color) ? (main.color as string) : base.mainLight.color,
      intensity:
        isFiniteNum(main.intensity) && (main.intensity as number) >= 0
          ? Math.min(Math.max(main.intensity as number, 0), 20)
          : base.mainLight.intensity,
      position: validateVec3(main.position)
        ? (main.position as [number, number, number])
        : base.mainLight.position,
    },
    fog: {
      enabled: fog.enabled === true,
      color: isHex(fog.color) ? (fog.color as string) : base.fog.color,
      near:
        isFiniteNum(fog.near) && (fog.near as number) >= 0 ? (fog.near as number) : base.fog.near,
      far:
        isFiniteNum(fog.far) && (fog.far as number) >= 0
          ? Math.min(Math.max(fog.far as number, 0), 1000)
          : base.fog.far,
    },
    cameraPreset: isCameraPreset(s.cameraPreset) ? s.cameraPreset : base.cameraPreset,
  };
}

function normalizeBriefRaw(raw: unknown): ThreeDProject['generationBrief'] {
  const base = defaultGenerationBrief();
  if (typeof raw !== 'object' || raw === null) return base;
  const b = raw as Record<string, unknown>;
  return {
    description:
      typeof b.description === 'string' ? b.description.slice(0, 2000) : base.description,
    style: typeof b.style === 'string' ? b.style.slice(0, 500) : base.style,
    dimensions: typeof b.dimensions === 'string' ? b.dimensions.slice(0, 100) : base.dimensions,
    targetPlatform:
      typeof b.targetPlatform === 'string' ? b.targetPlatform.slice(0, 100) : base.targetPlatform,
  };
}

/**
 * 归一化任意结构的项目数据为完整合法的 v2 项目；无法修复时返回 null。
 * 幂等：输出再次归一化结果不变。
 */
export function normalizeProject(raw: unknown): ThreeDProject | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.id !== 'string' || p.id.length === 0) return null;
  // 资产逐条宽松校验：损坏条目丢弃，保留其余
  const assets: ThreeDAsset[] = [];
  if (Array.isArray(p.assets)) {
    const seen = new Set<string>();
    for (const a of p.assets.slice(0, MAX_ASSETS_PER_PROJECT)) {
      const r = validateImportedAsset(a, seen);
      if (r.valid) assets.push(r.asset);
    }
  }
  const cleaned: Record<string, unknown> = {
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name : '未命名项目',
    description: typeof p.description === 'string' ? p.description : '',
    type: p.type === 'world' || p.type === 'prop' ? p.type : 'character',
    status:
      p.status === 'draft' ||
      p.status === 'exploring' ||
      p.status === 'ready' ||
      p.status === 'archived'
        ? p.status
        : 'draft',
    tags: Array.isArray(p.tags) ? p.tags.filter((t): t is string => typeof t === 'string') : [],
    createdAt: isFiniteNum(p.createdAt) ? p.createdAt : NOW(),
    updatedAt: isFiniteNum(p.updatedAt) ? p.updatedAt : NOW(),
    sceneSettings: normalizeSceneRaw(p.sceneSettings),
    assets,
    activeAssetId: typeof p.activeAssetId === 'string' ? p.activeAssetId : null,
    selectedAssetIds: Array.isArray(p.selectedAssetIds)
      ? p.selectedAssetIds.filter((x): x is string => typeof x === 'string')
      : [],
    cameraPreset: isCameraPreset(p.cameraPreset) ? p.cameraPreset : 'perspective',
    thumbnailPreset: isThumbnailPreset(p.thumbnailPreset) ? p.thumbnailPreset : 'grid',
    generationBrief: normalizeBriefRaw(p.generationBrief),
    regions: Array.isArray(p.regions) ? p.regions.slice(0, MAX_REGIONS) : [],
    shots: Array.isArray(p.shots) ? p.shots.slice(0, MAX_SHOTS) : [],
    activeShotId: typeof p.activeShotId === 'string' ? p.activeShotId : null,
    environmentPreset:
      p.environmentPreset === 'custom' ||
      ENVIRONMENT_PRESETS.some((e) => e.id === p.environmentPreset)
        ? p.environmentPreset
        : 'custom',
    environmentCustomName:
      typeof p.environmentCustomName === 'string' ? p.environmentCustomName : '',
    ...(p.type === 'character'
      ? {
          character:
            typeof p.character === 'object' && p.character !== null
              ? p.character
              : defaultCharacterSettings(),
        }
      : {}),
    ...(p.type === 'world'
      ? {
          world: typeof p.world === 'object' && p.world !== null ? p.world : defaultWorldSettings(),
        }
      : {}),
    ...(p.type === 'prop'
      ? { prop: typeof p.prop === 'object' && p.prop !== null ? p.prop : defaultPropSettings() }
      : {}),
  };
  const result = validateImportedProject(cleaned);
  if (result.valid) return result.project;
  // 兜底：资产全部无效时仍保留项目骨架（空资产 + 默认字段），绝不让旧数据打不开
  const skeleton = validateImportedProject({
    ...cleaned,
    assets: [],
    regions: [],
    shots: [],
    activeAssetId: null,
    selectedAssetIds: [],
    activeShotId: null,
  });
  return skeleton.valid ? skeleton.project : null;
}
