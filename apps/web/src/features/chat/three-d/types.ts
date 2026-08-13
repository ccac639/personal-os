/**
 * Chat 功能域 —— 3D 工作台数据模型
 *
 * 3D 工作台是「个人创作预览与项目规划」工具：当前只保存结构化项目数据
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

/** 材质预设 */
export type MaterialPresetId =
  'standard' | 'matte' | 'glossy' | 'emissive' | 'wireframe' | 'translucent';

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
  | 'redo';

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

/** 角色模式字段 */
export interface CharacterSettings {
  /** 体型比例 */
  bodyProportions: string;
  /** 姿态（占位） */
  pose: string;
  /** 配色 */
  palette: string[];
  /** 装备占位 */
  equipment: string[];
  /** 角色定位 */
  role: string;
  /** 外观关键词 */
  appearanceKeywords: string;
  /** 服装 / 材质关键词 */
  clothingKeywords: string;
}

/** 世界模式字段 */
export interface WorldSettings {
  /** 时代 / 风格 */
  eraStyle: string;
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
  /** 当前选中资产 */
  activeAssetId: string | null;
  /** 当前相机预设 */
  cameraPreset: CameraPresetId;
  thumbnailPreset: ThumbnailPresetId;
  /** 模式专属字段（按项目类型） */
  character?: CharacterSettings;
  world?: WorldSettings;
  prop?: PropSettings;
  generationBrief: ThreeDGenerationBrief;
  /** 有限数量本地操作记录 */
  history: ThreeDHistoryEntry[];
}

/** 3D 工作台 UI 偏好（随数据持久化，不含任何 WebGL 对象） */
export interface ThreeDUiState {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  bottomOpen: boolean;
  /** 底部面板标签：时间线 / 生成简报 */
  bottomTab: 'history' | 'brief';
  tool: ToolMode;
  assetQuery: string;
  /** 生成简报编辑文本（与项目解耦，仅本地） */
  briefText: string;
  /** 提示条（恢复 / 版本提示）是否已忽略 */
  noticeDismissed: boolean;
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
  createdAt: number;
  /** 状态说明：仅本地预览 */
  note: string;
}

/** 生成服务边界：未来接入真实服务时只替换实现，不改 UI / Store */
export interface ThreeDGenerationService {
  createDraft(input: ThreeDGenerationRequest): Promise<ThreeDGenerationDraft>;
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
