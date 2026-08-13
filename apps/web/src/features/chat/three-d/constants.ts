/**
 * Chat 功能域 —— 3D 工作台常量与种子数据
 *
 * 所有演示资产均由基础几何体 + 程序化颜色构成，不使用外链模型 / 贴图 / 图片。
 */
import type {
  CameraPresetId,
  EnvironmentPresetId,
  LightKind,
  LightSettings,
  MaterialParams,
  MaterialPresetId,
  PoseKey,
  PrimitiveKind,
  ShotStatus,
  ThreeDAsset,
  ThreeDProject,
  ThreeDProjectType,
  ThreeDRegion,
  ThreeDShot,
  ThreeDUiState,
  ThumbnailPresetId,
  ToolMode,
  Vec3Tuple,
} from './types';

/** localStorage 键与版本（v2：新增 group 层级、材质、灯光、角色、区域、镜头、模板） */
export const THREE_D_STORAGE_KEY = 'personal-os.chat.3d.v2';
export const THREE_D_STORAGE_VERSION = 2;
/** v1 存储键（迁移读取源） */
export const THREE_D_STORAGE_KEY_V1 = 'personal-os.chat.3d.v1';

/** 导出文件版本（交换格式，与存储版本独立） */
export const THREE_D_EXPORT_VERSION = 1;

/** 合理上限：避免 localStorage 无限增长与性能失控 */
export const MAX_PROJECTS = 40;
export const MAX_ASSETS_PER_PROJECT = 150;
export const MAX_HISTORY_PER_PROJECT = 50;
export const MAX_UNDO_STEPS = 50;
export const MAX_TAGS_PER_PROJECT = 12;
export const MAX_LIGHTS = 12;
export const MAX_REGIONS = 24;
export const MAX_SHOTS = 48;
export const MAX_SELECTION = 60;
export const MAX_PERSONAL_POSES = 20;
export const MAX_ASSET_PRESETS = 40;
export const MAX_TEMPLATES = 24;
export const MAX_PRESET_ASSETS = 40;
export const MAX_SHADOW_LIGHTS = 2;

export const DEFAULT_PROJECT_TYPE: ThreeDProjectType = 'character';

export const PROJECT_TYPE_LABELS: Record<ThreeDProjectType, string> = {
  character: '角色',
  world: '世界',
  prop: '道具',
};

export const PROJECT_STATUS_LABELS: Record<ThreeDProject['status'], string> = {
  draft: '草稿',
  exploring: '探索中',
  ready: '就绪',
  archived: '已归档',
};

export const PRIMITIVE_KINDS: ReadonlyArray<{ key: PrimitiveKind; label: string }> = [
  { key: 'cube', label: '立方体' },
  { key: 'sphere', label: '球体' },
  { key: 'cylinder', label: '圆柱' },
  { key: 'cone', label: '圆锥' },
  { key: 'plane', label: '平面' },
  { key: 'torus', label: '环面' },
];

export const ASSET_TYPE_LABELS: Record<ThreeDAsset['type'], string> = {
  primitive: '基础几何体',
  'character-placeholder': '角色占位',
  'world-placeholder': '世界占位',
  light: '灯光',
  'camera-marker': '镜头标记',
  group: '组合',
};

export const MATERIAL_PRESETS: ReadonlyArray<{ key: MaterialPresetId; label: string }> = [
  { key: 'standard', label: '标准' },
  { key: 'matte', label: '哑光' },
  { key: 'metal', label: '金属' },
  { key: 'plastic', label: '塑料' },
  { key: 'glass', label: '玻璃' },
  { key: 'glossy', label: '光泽' },
  { key: 'emissive', label: '自发光' },
  { key: 'wireframe', label: '线框' },
  { key: 'translucent', label: '半透明' },
  { key: 'terrain', label: '地形' },
];

/** 每种材质预设的受控参数默认值（全部归一化） */
export const MATERIAL_PRESET_PARAMS: Record<MaterialPresetId, MaterialParams> = {
  standard: { roughness: 0.6, metalness: 0.12, opacity: 1, emissiveIntensity: 0 },
  matte: { roughness: 0.96, metalness: 0.02, opacity: 1, emissiveIntensity: 0 },
  metal: { roughness: 0.35, metalness: 0.9, opacity: 1, emissiveIntensity: 0 },
  plastic: { roughness: 0.35, metalness: 0.05, opacity: 1, emissiveIntensity: 0 },
  glass: { roughness: 0.1, metalness: 0, opacity: 0.35, emissiveIntensity: 0 },
  glossy: { roughness: 0.16, metalness: 0.55, opacity: 1, emissiveIntensity: 0 },
  emissive: { roughness: 0.5, metalness: 0.1, opacity: 1, emissiveIntensity: 0.75 },
  wireframe: { roughness: 0.6, metalness: 0.1, opacity: 1, emissiveIntensity: 0 },
  translucent: { roughness: 0.4, metalness: 0.05, opacity: 0.45, emissiveIntensity: 0 },
  terrain: { roughness: 1, metalness: 0, opacity: 1, emissiveIntensity: 0 },
};

/** 材质参数归一化：范围校验 + 规范化 */
export function normalizeMaterialParams(p: Partial<MaterialParams> | undefined): MaterialParams {
  const base = MATERIAL_PRESET_PARAMS.standard;
  const clamp01 = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 1) : d;
  const clamp05 = (v: unknown, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(v, 0), 5) : d;
  return {
    roughness: clamp01(p?.roughness, base.roughness),
    metalness: clamp01(p?.metalness, base.metalness),
    opacity: clamp01(p?.opacity, base.opacity),
    emissiveIntensity: clamp05(p?.emissiveIntensity, base.emissiveIntensity),
  };
}

/** 灯光种类 */
export const LIGHT_KINDS: ReadonlyArray<{ key: LightKind; label: string; hint: string }> = [
  { key: 'ambient', label: '环境光', hint: '均匀照亮整体' },
  { key: 'directional', label: '方向光', hint: '平行光，模拟太阳' },
  { key: 'point', label: '点光', hint: '向四周扩散' },
  { key: 'spot', label: '聚光灯', hint: '锥形光束' },
];

export function defaultLightSettings(kind: LightKind = 'point'): LightSettings {
  return {
    kind,
    enabled: true,
    intensity: kind === 'ambient' ? 0.6 : 1.5,
    color: kind === 'ambient' ? '#cbd5e1' : '#ffffff',
    temperature: null,
    shadowEnabled: false,
    range: kind === 'point' ? 12 : kind === 'spot' ? 18 : 0,
    angle: kind === 'spot' ? 45 : 0,
    target: [0, 0, 0],
  };
}

/** 灯光数量上限（含 sceneSettings 环境基线之外的资产灯光） */
export function lightLimitReached(assets: ThreeDAsset[]): boolean {
  return assets.filter((a) => a.type === 'light').length >= MAX_LIGHTS;
}

export const TOOL_MODES: ReadonlyArray<{ key: ToolMode; label: string; shortcut: string }> = [
  { key: 'select', label: '选择', shortcut: 'V' },
  { key: 'move', label: '移动', shortcut: 'W' },
  { key: 'rotate', label: '旋转', shortcut: 'E' },
  { key: 'scale', label: '缩放', shortcut: 'R' },
];

export const CAMERA_PRESETS: ReadonlyArray<{
  key: CameraPresetId;
  label: string;
  group: '通用' | '角色' | '世界';
}> = [
  { key: 'perspective', label: '透视', group: '通用' },
  { key: 'front', label: '正视', group: '通用' },
  { key: 'side', label: '侧视', group: '通用' },
  { key: 'top', label: '俯视', group: '通用' },
  { key: 'closeup', label: '角色近景', group: '通用' },
  { key: 'birdseye', label: '世界鸟瞰', group: '通用' },
  { key: 'fullbody', label: '全身', group: '角色' },
  { key: 'halfbody', label: '半身', group: '角色' },
  { key: 'face', label: '面部', group: '角色' },
  { key: 'back', label: '背面', group: '角色' },
  { key: 'threeview', label: '三视图', group: '角色' },
  { key: 'street', label: '街道', group: '世界' },
  { key: 'ground', label: '地面', group: '世界' },
  { key: 'building', label: '建筑视角', group: '世界' },
];

export const THUMBNAIL_PRESETS: ReadonlyArray<{ key: ThumbnailPresetId; label: string }> = [
  { key: 'grid', label: '网格' },
  { key: 'wireframe', label: '线框' },
  { key: 'silhouette', label: '剪影' },
  { key: 'topdown', label: '俯拍' },
];

export const IDENTITY = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `3d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const NOW = (): number => Date.now();

/** 默认变换 */
export function defaultTransform(): ThreeDAsset['transform'] {
  return { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

/** 默认场景设置 */
export function defaultSceneSettings(): ThreeDProject['sceneSettings'] {
  return {
    background: '#0f172a',
    groundColor: '#1e293b',
    groundVisible: true,
    gridVisible: true,
    axesVisible: false,
    ambientLight: { enabled: true, color: '#cbd5e1', intensity: 0.55 },
    mainLight: {
      enabled: true,
      color: '#ffffff',
      intensity: 1.6,
      position: [4, 8, 6],
    },
    fog: { enabled: false, color: '#0f172a', near: 24, far: 60 },
    cameraPreset: 'perspective',
  };
}

export function defaultCharacterSettings(): NonNullable<ThreeDProject['character']> {
  return {
    // 档案
    codename: '',
    role: '',
    ageGroup: '',
    bodyType: '',
    style: '',
    personalityKeywords: '',
    appearanceKeywords: '',
    clothingKeywords: '',
    equipmentKeywords: '',
    // 外观
    bodyProportions: 'average',
    headRatio: 1,
    shoulderWidth: 1,
    legLength: 1,
    primaryColor: '#475569',
    secondaryColor: '#94a3b8',
    palette: ['#475569', '#94a3b8', '#e2e8f0'],
    equipment: [],
    // 姿态
    pose: 'stand',
    personalPoses: [],
  };
}

export function defaultWorldSettings(): NonNullable<ThreeDProject['world']> {
  return {
    eraStyle: '',
    location: '',
    regionNotes: '',
    atmosphere: '',
    timeOfDay: 'day',
    weather: 'clear',
    scale: 1,
    shotLanguage: '',
  };
}

export function defaultPropSettings(): NonNullable<ThreeDProject['prop']> {
  return {
    description: '',
    usage: '',
    sizeHint: '',
  };
}

export function defaultGenerationBrief(): ThreeDProject['generationBrief'] {
  return {
    description: '',
    style: '',
    dimensions: '',
    targetPlatform: '',
  };
}

export function defaultUiState(): ThreeDUiState {
  return {
    leftPanelOpen: true,
    rightPanelOpen: true,
    bottomOpen: false,
    bottomTab: 'history',
    tool: 'select',
    assetQuery: '',
    briefText: '',
    noticeDismissed: false,
    snap: {
      grid: false,
      gridStep: 0.5,
      angle: false,
      angleStep: 15,
      scale: false,
      scaleStep: 0.25,
    },
    coordSpace: 'world',
    showBoundingBox: false,
    isolation: false,
    materialPreview: true,
    assetPanelTab: 'tree',
    regionFilter: null,
    assetLibraryQuery: '',
    assetLibraryCategory: 'all',
    designBoardOpen: false,
    storyboardOpen: false,
  };
}

/** 构造资产（默认值集中于此） */
export function makeAsset(
  over: Partial<ThreeDAsset> & { name: string; type: ThreeDAsset['type'] },
): ThreeDAsset {
  const merged: ThreeDAsset = {
    id: IDENTITY(),
    visible: true,
    locked: false,
    transform: defaultTransform(),
    color: '#64748b',
    materialPreset: 'standard',
    materialParams: { ...MATERIAL_PRESET_PARAMS.standard },
    tags: [],
    notes: '',
    ...over,
  };
  // 材质参数归一化（受控字段恒为合法范围）
  merged.materialParams = normalizeMaterialParams(merged.materialParams ?? over.materialParams);
  return merged;
}

/* ---------- 角色 / 世界 / 道具占位几何体 ---------- */

/** 角色占位：基础形体构成的人形占位（头 / 躯干 / 四肢），非真实角色 */
export function characterPlaceholderAssets(): ThreeDAsset[] {
  const rootId = IDENTITY();
  const head = makeAsset({
    id: IDENTITY(),
    name: '头部',
    type: 'character-placeholder',
    color: '#f1c27d',
    parentId: rootId,
    transform: { position: [0, 1.62, 0], rotation: [0, 0, 0], scale: [0.32, 0.34, 0.32] },
    notes: '角色占位：头部（球体近似）',
  });
  const torso = makeAsset({
    id: IDENTITY(),
    name: '躯干',
    type: 'character-placeholder',
    color: '#3b5b92',
    parentId: rootId,
    transform: { position: [0, 1.14, 0], rotation: [0, 0, 0], scale: [0.5, 0.62, 0.3] },
    notes: '角色占位：躯干',
  });
  const armL = makeAsset({
    id: IDENTITY(),
    name: '左臂',
    type: 'character-placeholder',
    color: '#3b5b92',
    parentId: rootId,
    transform: { position: [-0.42, 1.2, 0], rotation: [0, 0, 0.12], scale: [0.14, 0.5, 0.14] },
  });
  const armR = makeAsset({
    id: IDENTITY(),
    name: '右臂',
    type: 'character-placeholder',
    color: '#3b5b92',
    parentId: rootId,
    transform: { position: [0.42, 1.2, 0], rotation: [0, 0, -0.12], scale: [0.14, 0.5, 0.14] },
  });
  const legL = makeAsset({
    id: IDENTITY(),
    name: '左腿',
    type: 'character-placeholder',
    color: '#2f4468',
    parentId: rootId,
    transform: { position: [-0.17, 0.48, 0], rotation: [0, 0, 0], scale: [0.18, 0.62, 0.18] },
  });
  const legR = makeAsset({
    id: IDENTITY(),
    name: '右腿',
    type: 'character-placeholder',
    color: '#2f4468',
    parentId: rootId,
    transform: { position: [0.17, 0.48, 0], rotation: [0, 0, 0], scale: [0.18, 0.62, 0.18] },
  });
  const root = makeAsset({
    id: rootId,
    name: '角色占位（基础比例）',
    type: 'group',
    color: '#94a3b8',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    tags: ['占位'],
    notes: '由基础几何体构成的人体比例占位，非真实角色模型',
  });
  // 组内子项不参与顶层命中（由 group 统一命中）
  return [root, head, torso, armL, armR, legL, legR];
}

/** 世界占位：地面 / 道路 / 建筑块 / 植被占位 */
export function worldPlaceholderAssets(): ThreeDAsset[] {
  const rootId = IDENTITY();
  const ground = makeAsset({
    id: IDENTITY(),
    name: '地面',
    type: 'world-placeholder',
    color: '#3f6212',
    parentId: rootId,
    transform: { position: [0, -0.02, 0], rotation: [0, 0, 0], scale: [10, 0.04, 10] },
    notes: '世界占位：地面块',
  });
  const road = makeAsset({
    id: IDENTITY(),
    name: '道路',
    type: 'world-placeholder',
    color: '#475569',
    parentId: rootId,
    transform: { position: [0, 0.01, 0], rotation: [0, 0, 0], scale: [1.6, 0.02, 10] },
  });
  const buildingA = makeAsset({
    id: IDENTITY(),
    name: '建筑块 A',
    type: 'world-placeholder',
    color: '#b45309',
    parentId: rootId,
    transform: { position: [-3, 1.2, -2], rotation: [0, 0.4, 0], scale: [2, 2.4, 2] },
  });
  const buildingB = makeAsset({
    id: IDENTITY(),
    name: '建筑块 B',
    type: 'world-placeholder',
    color: '#7c3aed',
    parentId: rootId,
    transform: { position: [3.2, 0.8, -1.6], rotation: [0, -0.3, 0], scale: [1.6, 1.6, 1.6] },
  });
  const treeA = makeAsset({
    id: IDENTITY(),
    name: '植被占位 A',
    type: 'world-placeholder',
    color: '#16a34a',
    parentId: rootId,
    transform: { position: [-2.4, 0.75, 2.4], rotation: [0, 0, 0], scale: [1, 1.5, 1] },
  });
  const treeB = makeAsset({
    id: IDENTITY(),
    name: '植被占位 B',
    type: 'world-placeholder',
    color: '#15803d',
    parentId: rootId,
    transform: { position: [2.6, 0.6, 2.8], rotation: [0, 0, 0], scale: [0.8, 1.2, 0.8] },
  });
  const root = makeAsset({
    id: rootId,
    name: '世界占位（街道区块）',
    type: 'group',
    color: '#94a3b8',
    transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    tags: ['占位'],
    notes: '地面 / 道路 / 建筑 / 植被占位组合',
  });
  return [root, ground, road, buildingA, buildingB, treeA, treeB];
}

/** 道具占位：可编辑的简单物件组合（如「复古收音机」） */
export function propPlaceholderAssets(): ThreeDAsset[] {
  const rootId = IDENTITY();
  const body = makeAsset({
    id: IDENTITY(),
    name: '机身',
    type: 'primitive',
    primitiveKind: 'cube',
    color: '#b45309',
    parentId: rootId,
    transform: { position: [0, 0.45, 0], rotation: [0, 0, 0], scale: [1.2, 0.7, 0.6] },
    materialPreset: 'matte',
  });
  const speaker = makeAsset({
    id: IDENTITY(),
    name: '扬声器',
    type: 'primitive',
    primitiveKind: 'cylinder',
    color: '#292524',
    parentId: rootId,
    transform: { position: [0, 0.55, 0.32], rotation: [90, 0, 0], scale: [0.5, 0.12, 0.5] },
  });
  const antenna = makeAsset({
    id: IDENTITY(),
    name: '天线',
    type: 'primitive',
    primitiveKind: 'cylinder',
    color: '#78716c',
    parentId: rootId,
    transform: { position: [-0.3, 1.1, -0.1], rotation: [0, 0, 18], scale: [0.05, 0.8, 0.05] },
  });
  const knobL = makeAsset({
    id: IDENTITY(),
    name: '旋钮左',
    type: 'primitive',
    primitiveKind: 'cylinder',
    color: '#44403c',
    parentId: rootId,
    transform: { position: [-0.4, 0.45, 0.32], rotation: [90, 0, 0], scale: [0.16, 0.1, 0.16] },
  });
  const knobR = makeAsset({
    id: IDENTITY(),
    name: '旋钮右',
    type: 'primitive',
    primitiveKind: 'cylinder',
    color: '#44403c',
    parentId: rootId,
    transform: { position: [0.4, 0.45, 0.32], rotation: [90, 0, 0], scale: [0.12, 0.1, 0.12] },
  });
  const root = makeAsset({
    id: rootId,
    name: '道具占位（复古收音机）',
    type: 'group',
    color: '#94a3b8',
    transform: { position: [0, 0.6, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
    tags: ['占位'],
    notes: '由基础几何体组合的道具占位',
  });
  return [root, body, speaker, antenna, knobL, knobR];
}

/* ---------- 种子项目 ---------- */

function baseProject(
  over: { id: string; name: string; description: string; type: ThreeDProjectType; tags: string[] },
  assets: ThreeDAsset[],
): ThreeDProject {
  const now = NOW();
  return {
    id: over.id,
    name: over.name,
    description: over.description,
    type: over.type,
    status: 'draft',
    tags: over.tags,
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
    ...(over.type === 'character' ? { character: defaultCharacterSettings() } : {}),
    ...(over.type === 'world' ? { world: defaultWorldSettings() } : {}),
    ...(over.type === 'prop' ? { prop: defaultPropSettings() } : {}),
  };
}

/** 本地 mock 种子项目：角色概念 / 世界概念 / 道具概念 */
export function seedProjects(): ThreeDProject[] {
  return [
    baseProject(
      {
        id: 'seed-character-01',
        name: '角色概念：旅行者',
        description: '基础人体比例占位，用于角色设定的体型 / 配色 / 装备预览。',
        type: 'character',
        tags: ['角色', '概念', '占位'],
      },
      characterPlaceholderAssets(),
    ),
    baseProject(
      {
        id: 'seed-world-01',
        name: '世界概念：集市街区',
        description: '地面、道路、建筑块与植被占位，用于世界氛围与布局规划。',
        type: 'world',
        tags: ['世界', '街区', '占位'],
      },
      worldPlaceholderAssets(),
    ),
    baseProject(
      {
        id: 'seed-prop-01',
        name: '道具概念：复古收音机',
        description: '由基础几何体组合的可编辑道具占位。',
        type: 'prop',
        tags: ['道具', '复古', '占位'],
      },
      propPlaceholderAssets(),
    ),
  ];
}

/** 颜色面板（程序化，无外部图片） */
export const COLOR_SWATCHES: readonly string[] = [
  '#64748b',
  '#475569',
  '#0f172a',
  '#ffffff',
  '#e2e8f0',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#facc15',
  '#22c55e',
  '#16a34a',
  '#14b8a6',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#a855f7',
  '#d946ef',
  '#ec4899',
  '#b45309',
];

export const BODY_PROPORTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'child', label: '孩童' },
  { key: 'average', label: '标准' },
  { key: 'tall', label: '高挑' },
  { key: 'heroic', label: '英雄比例' },
];

export const TIME_OF_DAY_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'dawn', label: '黎明' },
  { key: 'day', label: '白昼' },
  { key: 'dusk', label: '黄昏' },
  { key: 'night', label: '夜晚' },
];

export const WEATHER_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'clear', label: '晴朗' },
  { key: 'cloudy', label: '多云' },
  { key: 'rain', label: '雨天' },
  { key: 'fog', label: '雾天' },
  { key: 'snow', label: '雪天' },
];

export const POSE_OPTIONS: ReadonlyArray<{ key: PoseKey; label: string; hint: string }> = [
  { key: 'stand', label: '站立', hint: '标准站姿' },
  { key: 'walk', label: '行走', hint: '双脚交替' },
  { key: 'run', label: '奔跑', hint: '前倾跨步' },
  { key: 'alert', label: '警戒', hint: '戒备姿态' },
  { key: 'sit', label: '坐姿', hint: '屈腿坐姿' },
  { key: 'combat', label: '战斗', hint: '格斗架势' },
];

export const POSE_KEYS: readonly PoseKey[] = ['stand', 'walk', 'run', 'alert', 'sit', 'combat'];

export const AGE_GROUP_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '', label: '未设定' },
  { key: 'child', label: '孩童' },
  { key: 'teen', label: '少年' },
  { key: 'young', label: '青年' },
  { key: 'middle', label: '中年' },
  { key: 'elder', label: '老年' },
];

export const BODY_TYPE_OPTIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: '', label: '未设定' },
  { key: 'slim', label: '纤细' },
  { key: 'average', label: '匀称' },
  { key: 'muscular', label: '健壮' },
  { key: 'heavy', label: '魁梧' },
];

export const SHOT_STATUS_OPTIONS: ReadonlyArray<{ key: ShotStatus; label: string }> = [
  { key: 'draft', label: '草稿' },
  { key: 'planned', label: '已规划' },
  { key: 'ready', label: '就绪' },
  { key: 'final', label: '定稿' },
];

/** 数值输入合法性检查（有限、合理范围） */
export function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function isHexColor(v: unknown): v is string {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);
}

export function isVec3(v: unknown): v is Vec3Tuple {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => isFiniteNumber(n) && Math.abs(n as number) < 1e6)
  );
}

/* ---------- 世界环境预设（本地程序化，无外链资源） ---------- */

export interface EnvironmentPresetDef {
  id: EnvironmentPresetId;
  name: string;
  description: string;
  /** 预设应用后写入的完整场景设置 */
  settings: ThreeDProject['sceneSettings'];
}

export const ENVIRONMENT_PRESETS: readonly EnvironmentPresetDef[] = [
  {
    id: 'studio-day',
    name: '日间工作室',
    description: '明亮中性背景，适合角色与道具展示',
    settings: {
      background: '#e2e8f0',
      groundColor: '#d6d3d1',
      groundVisible: true,
      gridVisible: true,
      axesVisible: false,
      ambientLight: { enabled: true, color: '#e8e4dc', intensity: 0.65 },
      mainLight: {
        enabled: true,
        color: '#ffffff',
        intensity: 1.9,
        position: [4, 8, 6],
      },
      fog: { enabled: false, color: '#e2e8f0', near: 24, far: 60 },
      cameraPreset: 'perspective',
    },
  },
  {
    id: 'night-city',
    name: '夜间城市',
    description: '深蓝夜空与冷色环境光，适合世界夜景',
    settings: {
      background: '#0b1120',
      groundColor: '#1e293b',
      groundVisible: true,
      gridVisible: true,
      axesVisible: false,
      ambientLight: { enabled: true, color: '#334155', intensity: 0.45 },
      mainLight: {
        enabled: true,
        color: '#93c5fd',
        intensity: 0.9,
        position: [-6, 10, -4],
      },
      fog: { enabled: true, color: '#0b1120', near: 18, far: 70 },
      cameraPreset: 'birdseye',
    },
  },
  {
    id: 'foggy-forest',
    name: '薄雾森林',
    description: '绿色基调与浓雾，适合自然场景',
    settings: {
      background: '#3f4a3a',
      groundColor: '#365314',
      groundVisible: true,
      gridVisible: false,
      axesVisible: false,
      ambientLight: { enabled: true, color: '#a3e635', intensity: 0.35 },
      mainLight: {
        enabled: true,
        color: '#d9f99d',
        intensity: 0.8,
        position: [5, 6, 5],
      },
      fog: { enabled: true, color: '#4a5a43', near: 6, far: 34 },
      cameraPreset: 'ground',
    },
  },
  {
    id: 'desert-dusk',
    name: '沙地黄昏',
    description: '暖橙色调与长阴影，适合荒漠氛围',
    settings: {
      background: '#7c2d12',
      groundColor: '#c2703d',
      groundVisible: true,
      gridVisible: false,
      axesVisible: false,
      ambientLight: { enabled: true, color: '#fdba74', intensity: 0.5 },
      mainLight: {
        enabled: true,
        color: '#fed7aa',
        intensity: 1.2,
        position: [-8, 4, 2],
      },
      fog: { enabled: false, color: '#7c2d12', near: 24, far: 60 },
      cameraPreset: 'perspective',
    },
  },
  {
    id: 'showcase',
    name: '纯色展示台',
    description: '无网格无雾的干净展示环境',
    settings: {
      background: '#f8fafc',
      groundColor: '#e2e8f0',
      groundVisible: true,
      gridVisible: false,
      axesVisible: false,
      ambientLight: { enabled: true, color: '#ffffff', intensity: 0.7 },
      mainLight: {
        enabled: true,
        color: '#ffffff',
        intensity: 2.1,
        position: [3, 6, 5],
      },
      fog: { enabled: false, color: '#f8fafc', near: 24, far: 60 },
      cameraPreset: 'perspective',
    },
  },
];

export function environmentPresetById(
  id: EnvironmentPresetId | 'custom' | undefined,
): EnvironmentPresetDef | undefined {
  if (!id || id === 'custom') return undefined;
  return ENVIRONMENT_PRESETS.find((e) => e.id === id);
}

/* ---------- 区域 / 镜头默认值 ---------- */

export function defaultRegion(over: Partial<ThreeDRegion> = {}): ThreeDRegion {
  return {
    id: IDENTITY(),
    name: '新区域',
    purpose: '',
    style: '',
    dangerLevel: 0,
    description: '',
    color: '#3b82f6',
    assetIds: [],
    center: [0, 0.5, 0],
    size: [4, 1, 4],
    ...over,
  };
}

export function defaultShot(over: Partial<ThreeDShot> = {}): ThreeDShot {
  return {
    id: IDENTITY(),
    name: '新镜头',
    position: [4.5, 3.5, 6],
    target: [0, 0.6, 0],
    fov: 50,
    regionId: null,
    notes: '',
    status: 'draft',
    favorite: false,
    at: NOW(),
    ...over,
  };
}

/* ---------- 姿态标签 ---------- */

export function poseLabel(pose: PoseKey): string {
  return POSE_OPTIONS.find((p) => p.key === pose)?.label ?? pose;
}

/** 是否合法姿态键 */
export function isPoseKey(v: unknown): v is PoseKey {
  return typeof v === 'string' && (POSE_KEYS as readonly string[]).includes(v);
}
