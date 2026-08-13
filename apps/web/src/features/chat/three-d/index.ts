/**
 * Chat 功能域 —— 3D 工作台统一出口
 */
export { useThreeDWorkspaceStore } from './store';
export {
  DeterministicMockGenerationService,
  GENERATION_SERVICE_NOTE,
  cameraPresetLabel,
  getThreeDGenerationService,
  setThreeDGenerationService,
} from './service';
export {
  THREE_D_STORAGE_KEY,
  THREE_D_STORAGE_KEY_V1,
  THREE_D_STORAGE_VERSION,
  clearThreeDWorkspace,
  loadThreeDWorkspace,
  migrateThreeDV0,
  saveThreeDWorkspace,
} from './storage';
export {
  BUILTIN_ASSET_PRESETS,
  BUILTIN_PROJECT_TEMPLATES,
  buildTemplateProject,
  findAssetPreset,
  findTemplate,
} from './presets';
export { CHARACTER_PART_LABELS, applyPoseToTransform, partKeyForName, poseOffsets } from './poses';
export {
  MAX_ASSETS_PER_PROJECT,
  MAX_HISTORY_PER_PROJECT,
  MAX_LIGHTS,
  MAX_PERSONAL_POSES,
  MAX_PRESET_ASSETS,
  MAX_PROJECTS,
  MAX_REGIONS,
  MAX_SELECTION,
  MAX_SHOTS,
  MAX_TEMPLATES,
  MAX_UNDO_STEPS,
} from './constants';
export { default as ThreeDWorkspace } from './components/three-d-workspace.vue';
export type {
  AssetPreset,
  CameraPresetId,
  CharacterSettings,
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
  ThreeDAsset,
  ThreeDCameraState,
  ThreeDDraftFromMessage,
  ThreeDExportFile,
  ThreeDGenerationBrief,
  ThreeDGenerationDraft,
  ThreeDGenerationRequest,
  ThreeDGenerationService,
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
  ThreeDTransform,
  ThreeDUiState,
  ToolMode,
  Vec3Tuple,
  WorldSettings,
} from './types';
