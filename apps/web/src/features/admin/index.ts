/**
 * Admin 功能域 —— 导出聚合
 *
 * 管理系统：设置、数据维护、诊断、备份与安全边界工作台（仅本地单所有者）。
 */
export { useAdminStore } from './store';
export { useAdminToasts } from './toast';
export { MODULE_REGISTRY, allManagedKeys, cacheKeys } from './registry';
export { buildFullBackup, buildModuleBackup, backupToJson } from './backup';
export { parseBackupJson, buildRestorePreview, applyRestore } from './restore';
export { buildDiagnosticsReport, diagnosticsToText, diagnosticsToJson } from './diagnostics';
export { getProviderConnectionAdapter, setProviderConnectionAdapter } from './providers';
export type {
  AdminSection,
  AdminPreferences,
  AdminProvider,
  AdminProviderDraft,
  AdminModelEntry,
  BackupPayload,
  RestorePreview,
  RestoreResult,
  DiagnosticsReport,
} from './types';
