/**
 * Admin 功能域 —— 备份导出
 *
 * - 只导出注册表白名单内的 key（registry.ts 是唯一来源）。
 * - 元数据包含应用版本、导出时间、模块清单、各模块版本。
 * - 安全边界：API Key、Token、附件二进制、完整文件内容、浏览器敏感信息
 *   绝不进入备份 —— 备份内容经 stripSensitiveFields 二次剔除，
 *   且 Provider API Key 本就只存在于内存态，不在 localStorage 中。
 * - 下载使用浏览器原生 Blob / URL.createObjectURL，不引入依赖。
 */
import { MODULE_REGISTRY, moduleById, readModuleDataRaw } from './registry';
import { stripSensitiveFields } from './providers';
import type { BackupModule, BackupPayload } from './types';

/** 与 apps/web/package.json version 保持一致（本地前端版本号） */
export const APP_VERSION = '0.1.0';

export function backupFilename(scope: 'full' | string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `personal-os-backup-${scope}-${date}.json`;
}

/** 读取单个模块的受管数据（主数据 key），构建备份模块项 */
export function buildModuleBackup(moduleId: string): BackupModule | null {
  const entry = moduleById(moduleId);
  if (!entry) return null;
  const raw = readModuleDataRaw(moduleId);
  if (raw === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = raw; // 损坏数据也原样带出，恢复时按损坏拒绝
  }

  return {
    moduleId: entry.id,
    label: entry.label,
    version: entry.versionOf(raw),
    keys: [
      {
        key: entry.keys.find((k) => k.kind === 'data')?.key ?? '',
        kind: 'data',
        data: stripSensitiveFields(parsed),
      },
    ],
  };
}

/** 全量备份：全部已识别模块（缺失的模块跳过） */
export function buildFullBackup(): BackupPayload {
  const modules: BackupModule[] = [];
  for (const entry of MODULE_REGISTRY) {
    const item = buildModuleBackup(entry.id);
    if (item) modules.push(item);
  }
  return {
    app: 'personal-os',
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    modules,
  };
}

/** 生成备份 JSON 文本 */
export function backupToJson(payload: BackupPayload): string {
  return JSON.stringify(payload, null, 2);
}

/** 浏览器原生 Blob 下载；失败返回 false（调用方 toast 提示） */
export function downloadJson(filename: string, json: string): boolean {
  try {
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    return true;
  } catch {
    return false;
  }
}

/** 下载全量备份 */
export function downloadFullBackup(): boolean {
  return downloadJson(backupFilename('full'), backupToJson(buildFullBackup()));
}

/** 下载单模块备份 */
export function downloadModuleBackup(moduleId: string): boolean {
  const item = buildModuleBackup(moduleId);
  if (!item) return false;
  const payload: BackupPayload = {
    app: 'personal-os',
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    modules: [item],
  };
  return downloadJson(backupFilename(moduleId), backupToJson(payload));
}
