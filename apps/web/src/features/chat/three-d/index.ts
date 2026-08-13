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
  THREE_D_STORAGE_VERSION,
  clearThreeDWorkspace,
  loadThreeDWorkspace,
  migrateThreeDV0,
  saveThreeDWorkspace,
} from './storage';
export {
  MAX_ASSETS_PER_PROJECT,
  MAX_HISTORY_PER_PROJECT,
  MAX_PROJECTS,
  MAX_UNDO_STEPS,
} from './constants';
export { default as ThreeDWorkspace } from './components/three-d-workspace.vue';
export type {
  CameraPresetId,
  CharacterSettings,
  HistoryOpKind,
  MaterialPresetId,
  PrimitiveKind,
  ThreeDAsset,
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
  ThreeDProjectType,
  ThreeDSingleExportFile,
  ThreeDTransform,
  ThreeDUiState,
  ToolMode,
  Vec3Tuple,
  WorldSettings,
} from './types';
