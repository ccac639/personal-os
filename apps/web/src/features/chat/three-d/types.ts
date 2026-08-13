/**
 * Chat 功能域 —— 3D 工作台数据模型
 *
 * 3D 工作台是「个人创作预制作与项目规划」工具：当前只保存结构化项目数据
 * 与本地占位几何体，绝不保存真实模型文件、贴图二进制或 WebGL 对象。
 * 未来接入真实 3D 生成服务时，领域模型保持不变，仅替换 service 实现。
 */

/** 项目类型 */
export type ThreeDProjectType = 'character' | 'world' | 'prop';

/** 项目状态 */
export type ThreeDProjectStatus = 'draft' | 'exploring' | 'ready' | 'archived';

/** 资产类型 */
export type ThreeDAssetType =
  'primitive' | 'character-placeholder' | 'world-placeholder' | 'light' | 'camera-marker' | 'group';

/** 基础几何体种类 */
export type PrimitiveKind = 'cube' | 'sphere' | 'cylinder' | 'cone' | 'plane' | 'torus';

/** 材质预设（扩展：金属 / 塑料 / 玻璃 / 地形） */
export type MaterialPresetId =
  | 'standard'
  | 'matte'
  | 'glossy'
  | 'metal'
  | 'plastic'
  | 'glass'
  | 'emissive'
  | 'wireframe'
  | 'translucent'
  | 'terrain';

/** 材质受控参数（全部数值归一化：0..1 / 0..5） */
export interface MaterialParams {
  /** 粗糙度 0..1 */
  roughness: number;
  /** 金属度 0..1 */
  metalness: number;
  /** 透明度 0..1 */
  opacity: number;
  /** 发光强度 0..5 */
  emissiveIntensity: number;
}

/** 灯光种类 */
export type LightKind = 'ambient' | 'directional' | 'point' | 'spot';

/** 灯光参数（附着在 light 类型资产上） */
export interface LightSettings {
  kind: LightKind;
  enabled: boolean;
  /** 强度 0..20 */
  intensity: number;
  /** 颜色（#rrggbb） */
  color: string;
  /** 色温（K，1500..12000）；为 null 时使用 color */
  temperature: number | null;
  /** 阴影开关（全局限制：最多 2 盏灯投射阴影） */
  shadowEnabled: boolean;
  /** 范围 / 距离（point/spot，0 表示无限） */
  range: number;
  /** 聚光灯锥角（度，0..90） */
  angle: number;
  /** 方向光 / 聚光灯目标点 */
  target: Vec3Tuple;
}

/** 相机预设 */
export type CameraPresetId =
  | 'perspective'
  | 'front'
  | 'side'
  | 'top'
  | 'closeup'
  | 'birdseye'
  | 'fullbody'
  | 'halfbody'
  | 'face'
  | 'back'
  | 'threeview'
  | 'street'
  | 'ground'
  | 'building';

/** 变换工具模式 */
export type ToolMode = 'select' | 'move' | 'rotate' | 'scale';

/** 缩略图视觉预设 */
export type ThumbnailPresetId = 'grid' | 'wireframe' | 'silhouette' | 'topdown';

/** 世界环境预设 */
export type EnvironmentPresetId =
  'studio-day' | 'night-city' | 'foggy-forest' | 'desert-dusk' | 'showcase';

/** 程序化姿态（占位模型，非真实骨骼） */
export type PoseKey = 'stand' | 'walk' | 'run' | 'alert' | 'sit' | 'combat';

/** 个人姿态预设 */
export interface PersonalPosePreset {
  id: string;
  name: string;
  pose: PoseKey;
  createdAt: number;
}

/** 镜头状态 */
export type ShotStatus = 'draft' | 'planned' | 'ready' | 'final';

/** 世界区域（Region） */
export interface ThreeDRegion {
  id: string;
  name: string;
  /** 用途 */
  purpose: string;
  /** 风格 */
  style: string;
  /** 危险等级 0..5 */
  dangerLevel: number;
  /** 说明 */
  description: string;
  color: string;
  /** 关联资产 id */
  assetIds: string[];
  /** 半透明区域块中心 */
  center: Vec3Tuple;
  /** 半透明区域块尺寸 */
  size: Vec3Tuple;
}

/** 镜头（Shot） */
export interface ThreeDShot {
  id: string;
  name: string;
  /** 相机位置 */
  position: Vec3Tuple;
  /** 相机目标 */
  target: Vec3Tuple;
  /** 视野（度，10..120） */
  fov: number;
  /** 关联区域 */
  regionId: string | null;
  /** 说明 */
  notes: string;
  status: ShotStatus;
  favorite: boolean;
  /** 创建时间（排序基准） */
  at: number;
}

/** 历史操作种类 */
export type HistoryOpKind =
  | 'create'
  | 'update'
  | 'delete'
  | 'duplicate'
  | 'transform'
  | 'color'
  | 'scene'
  | 'project'
  | 'brief'
  | 'undo'
  | 'redo'
  | 'group'
  | 'light'
  | 'region'
  | 'shot'
  | 'material'
  | 'environment'
  | 'pose'
  | 'template'
  | 'preset';

/** 三维向量（数组形式便于校验与序列化） */
export type Vec3Tuple = [number, number, number];

/** 变换：位置 / 旋转（欧拉角，度）/ 缩放 */
export interface ThreeDTransform {
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
}

/** 资产 */
export interface ThreeDAsset {
  id: string;
  name: string;
  type: ThreeDAssetType;
  /** type === 'primitive' 时的几何体种类 */
  primitiveKind?: PrimitiveKind;
  visible: boolean;
  locked: boolean;
  transform: ThreeDTransform;
  /** hex 颜色（#rrggbb） */
  color: string;
  materialPreset: MaterialPresetId;
  /** 材质受控参数（预设默认值，可单独调整；全部归一化） */
  materialParams?: MaterialParams;
  /** type === 'light' 时的灯光参数 */
  light?: LightSettings;
  /** 父资产 id（group 内组合） */
  parentId?: string;
  tags: string[];
  notes: string;
}

/** 环境 / 场景设置 */
export interface ThreeDSceneSettings {
  background: string;
  groundColor: string;
  groundVisible: boolean;
  gridVisible: boolean;
  axesVisible: boolean;
  ambientLight: {
    enabled: boolean;
    color: string;
    intensity: number;
  };
  mainLight: {
    enabled: boolean;
    color: string;
    intensity: number;
    position: Vec3Tuple;
  };
  fog: {
    enabled: boolean;
    color: string;
    near: number;
    far: number;
  };
  /** 场景默认相机预设 */
  cameraPreset: CameraPresetId;
}

/** 角色模式字段（档案 + 外观 + 姿态） */
export interface CharacterSettings {
  /* ---- 角色档案 ---- */
  /** 代号 */
  codename: string;
  /** 定位 */
  role: string;
  /** 年龄段 */
  ageGroup: string;
  /** 体型 */
  bodyType: string;
  /** 风格 */
  style: string;
  /** 个性关键词 */
  personalityKeywords: string;
  /** 外观关键词 */
  appearanceKeywords: string;
  /** 服装 / 材质关键词 */
  clothingKeywords: string;
  /** 装备关键词 */
  equipmentKeywords: string;
  /* ---- 角色外观 ---- */
  /** 体型比例 */
  bodyProportions: string;
  /** 头部比例 0.5..2 */
  headRatio: number;
  /** 肩宽 0.5..2 */
  shoulderWidth: number;
  /** 腿长 0.5..2 */
  legLength: number;
  /** 主色 */
  primaryColor: string;
  /** 辅色 */
  secondaryColor: string;
  /** 配色 */
  palette: string[];
  /** 装备占位 */
  equipment: string[];
  /* ---- 姿态 ---- */
  pose: PoseKey;
  /** 个人姿态预设（有限数量） */
  personalPoses: PersonalPosePreset[];
}

/** 世界模式字段 */
export interface WorldSettings {
  /** 时代 / 风格 */
  eraStyle: string;
  /** 地点 */
  location: string;
  /** 区域说明 */
  regionNotes: string;
  /** 氛围 */
  atmosphere: string;
  /** 时间 */
  timeOfDay: string;
  /** 天气 */
  weather: string;
  /** 比例尺（单位 / 米） */
  scale: number;
  /** 镜头语言 */
  shotLanguage: string;
}

/** 道具模式字段 */
export interface PropSettings {
  /** 说明 */
  description: string;
  /** 用途 */
  usage: string;
  /** 尺寸提示 */
  sizeHint: string;
}

/** 生成简报：未来 AI 3D 服务的输入 */
export interface ThreeDGenerationBrief {
  description: string;
  style: string;
  dimensions: string;
  targetPlatform: string;
}

/** 本地操作记录（有限数量） */
export interface ThreeDHistoryEntry {
  id: string;
  kind: HistoryOpKind;
  label: string;
  assetId?: string;
  at: number;
}

/** 3D 项目 */
export interface ThreeDProject {
  id: string;
  name: string;
  description: string;
  type: ThreeDProjectType;
  status: ThreeDProjectStatus;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  sceneSettings: ThreeDSceneSettings;
  assets: ThreeDAsset[];
  /** 主选中资产（锚点） */
  activeAssetId: string | null;
  /** 多选集合（包含 activeAssetId） */
  selectedAssetIds: string[];
  /** 当前相机预设 */
  cameraPreset: CameraPresetId;
  thumbnailPreset: ThumbnailPresetId;
  /** 模式专属字段（按项目类型） */
  character?: CharacterSettings;
  world?: WorldSettings;
  prop?: PropSettings;
  generationBrief: ThreeDGenerationBrief;
  /** 世界区域（world 项目） */
  regions: ThreeDRegion[];
  /** 镜头列表（所有项目类型可用） */
  shots: ThreeDShot[];
  /** 当前应用中的镜头 id（画布据此定位相机） */
  activeShotId: string | null;
  /** 世界环境预设（'custom' 为项目自定义环境） */
  environmentPreset: EnvironmentPresetId | 'custom';
  /** 自定义环境名称 */
  environmentCustomName: string;
  /** 有限数量本地操作记录 */
  history: ThreeDHistoryEntry[];
}

/** 本地资产预设（由已有 primitive 组合构成，插入时复制为新 ID） */
export interface AssetPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  keywords: string[];
  builtin: boolean;
  favorite: boolean;
  /** 资产列表（相对坐标，第一项为根 group；插入时整体复制并重映射 id） */
  assets: ThreeDAsset[];
  createdAt: number;
}

/** 3D 项目模板 */
export interface ThreeDProjectTemplate {
  id: string;
  name: string;
  description: string;
  type: ThreeDProjectType;
  builtin: boolean;
  /** 个人模板：项目快照（应用时校验 + ID 重映射，不共享可变引用） */
  sourceProject: ThreeDProject | null;
  createdAt: number;
}

/** 3D 工作台 UI 偏好（随数据持久化，不含任何 WebGL 对象） */
export interface ThreeDUiState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomOpen: boolean;
  /** 底部面板标签：时间线 / 简报 / 分镜 */
  bottomTab: 'history' | 'brief' | 'storyboard';
  tool: ToolMode;
  assetQuery: string;
  /** 生成简报编辑文本（与项目解耦，仅本地） */
  briefText: string;
  /** 提示条（恢复 / 版本提示）是否已忽略 */
  noticeDismissed: boolean;
  /* ---- 编辑辅助 ---- */
  /** 吸附开关与步长 */
  snap: {
    grid: boolean;
    gridStep: number;
    angle: boolean;
    angleStep: number;
    scale: boolean;
    scaleStep: number;
  };
  /** 世界 / 本地坐标系 */
  coordSpace: 'world' | 'local';
  /** 显示选中边界框 */
  showBoundingBox: boolean;
  /** 孤立显示选中项 */
  isolation: boolean;
  /** 材质预览（显示受控材质参数） */
  materialPreview: boolean;
  /** 资产面板标签：资产树 / 预设库 / 区域 */
  assetPanelTab: 'tree' | 'library' | 'regions';
  /** 按区域过滤资产 */
  regionFilter: string | null;
  /** 预设库搜索与分类 */
  assetLibraryQuery: string;
  assetLibraryCategory: string;
  /** 角色设计板（桌面右侧标签，移动端抽屉） */
  designBoardOpen: boolean;
  /** 分镜板（底部面板内） */
  storyboardOpen: boolean;
}

/** 从 Chat 助手消息创建 3D 项目草稿（仅结构化文本） */
export interface ThreeDDraftFromMessage {
  messageId: string;
  sessionId?: string;
  name: string;
  description: string;
  sourceText: string;
}

/** 生成请求 */
export interface ThreeDGenerationRequest {
  projectId: string;
  projectType: ThreeDProjectType;
  briefText: string;
  style: string;
  dimensions: string;
  targetPlatform: string;
  assetCount: number;
  tags: string[];
  cameraPreset: CameraPresetId;
  regions: ThreeDRegion[];
  shots: ThreeDShot[];
}

/** 生成草稿（mock，不生成真实模型） */
export interface ThreeDGenerationDraft {
  requestId: string;
  status: 'draft';
  source: 'mock' | 'remote';
  projectType: ThreeDProjectType;
  /** 结构化生成计划 */
  plan: string[];
  /** 建议资产 */
  suggestedAssets: Array<{
    name: string;
    type: ThreeDAssetType;
    primitiveKind?: PrimitiveKind;
    reason: string;
  }>;
  /** 建议灯光 */
  suggestedLights: Array<{
    kind: 'ambient' | 'key' | 'fill';
    color: string;
    intensity: number;
  }>;
  /** 建议镜头 */
  suggestedCamera: { preset: CameraPresetId; note: string };
  /** 建议区域（world 项目） */
  suggestedRegions?: Array<{
    name: string;
    purpose: string;
    style: string;
    dangerLevel: number;
    color: string;
  }>;
  /** 建议镜头列表 */
  suggestedShots?: Array<{ name: string; preset: CameraPresetId; note: string }>;
  createdAt: number;
  /** 状态说明：仅本地预览 */
  note: string;
}

/** 生成服务边界：未来接入真实服务时只替换实现，不改 UI / Store */
export interface ThreeDGenerationService {
  createDraft(input: ThreeDGenerationRequest): Promise<ThreeDGenerationDraft>;
}

/** 相机状态（保存镜头用） */
export interface ThreeDCameraState {
  position: Vec3Tuple;
  target: Vec3Tuple;
  fov: number;
}

/** 导入预览 */
export interface ThreeDImportPreview {
  total: number;
  validCount: number;
  invalidCount: number;
  version: number;
  projects: Array<{
    index: number;
    name: string;
    type: ThreeDProjectType;
    assetCount: number;
    lightCount: number;
    regionCount: number;
    shotCount: number;
    valid: boolean;
    reason?: string;
  }>;
}

/** 导入执行结果 */
export interface ThreeDImportResult {
  added: number;
  copied: number;
  invalid: number;
}

/** 导出文件结构（与存储信封区分：面向交换） */
export interface ThreeDExportFile {
  app: 'personal-os-3d';
  version: 1;
  kind: 'projects';
  exportedAt: number;
  projects: ThreeDProject[];
}

/** 单项目导出 */
export interface ThreeDSingleExportFile {
  app: 'personal-os-3d';
  version: 1;
  kind: 'project';
  exportedAt: number;
  project: ThreeDProject;
}

/** 模板导出 */
export interface ThreeDTemplateExportFile {
  app: 'personal-os-3d';
  version: 1;
  kind: 'template';
  exportedAt: number;
  template: ThreeDProjectTemplate;
}
