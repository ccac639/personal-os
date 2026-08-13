/**
 * Admin 功能域 —— 存储注册表（受管模块白名单）
 *
 * 安全边界：
 * - 本表是「可管理 localStorage key」的唯一定义来源；未列入的 key 永不进入
 *   清理 / 备份 / 导入范围。
 * - 各模块 key 常量来自其公开结构（storage / persistence / migrate 模块的
 *   导出常量值），此处只复制字符串值，不 import 业务模块代码，避免耦合与副作用。
 * - 版本识别与摘要均为「宽容解析」：并行模块数据结构变更、数据损坏、
 *   localStorage 被禁用都必须可容忍（降级为 missing / corrupt / unreadable）。
 * - API Key、Token、附件二进制绝不落盘，因此本表也不包含任何敏感 key。
 */
import type { AdminModuleEntry, ModuleSnapshot, ModuleStatus } from './types';

/** Admin 自身偏好 key（版本信封 personal-os.admin.v1） */
export const ADMIN_STORAGE_KEY = 'personal-os.admin.v1';
export const ADMIN_STORAGE_VERSION = 1;
/** Admin Provider 会话配置 key（仅 hasKey 布尔，Key 内容永不落盘） */
export const ADMIN_PROVIDERS_KEY = 'personal-os.admin.providers.v1';

/* ---------------- 各模块 key（来自公开常量，只读快照） ---------------- */

export const CHAT_KEYS = {
  data: 'personal-os.chat.v1',
  prefs: 'personal-os.chat.prefs.v1',
  presets: 'personal-os.chat.presets.v1',
};

export const WORKFLOW_KEYS = {
  data: 'personal-os-workflows-v3',
  legacyV2: 'personal-os-workflows-v1',
  legacyV1: 'personal-os-workflow-v1',
  templates: 'personal-os-workflow-templates',
};

export const PROJECT_KEYS = {
  data: 'personal-os.projects.v3',
  activities: 'personal-os.projects.activities.v3',
  retrospectives: 'personal-os.projects.retrospectives.v3',
  snapshots: 'personal-os.projects.snapshots.v3',
  ui: 'personal-os.projects.ui.v3',
  legacyProjectsV2: 'personal-os.projects.v2',
  legacyProjectsV1: 'personal-os.projects.v1',
  legacyActivitiesV2: 'personal-os.projects.activities.v2',
  legacyActivitiesV1: 'personal-os.projects.activities.v1',
  legacyUiV2: 'personal-os.projects.ui.v2',
};

export const TASK_KEYS = {
  data: 'personal-os.tasks.v3',
  ui: 'personal-os.tasks.ui.v3',
  templates: 'personal-os.tasks.templates.v1',
  legacyV2: 'personal-os.tasks.v2',
  legacyV1: 'personal-os.tasks.v1',
  legacyUiV2: 'personal-os.tasks.ui.v2',
};

export const ACHIEVEMENT_KEYS = {
  data: 'personal-os-achievements-v1',
  ui: 'personal-os-achievements-ui-v1',
};

/* ---------------- 宽容解析工具 ---------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 从信封对象提取数字版本（{ version } / { schemaVersion }） */
function envelopeVersion(parsed: unknown): number | null {
  if (Array.isArray(parsed)) {
    const first = parsed[0];
    if (isRecord(first) && typeof first.schemaVersion === 'number') return first.schemaVersion;
    if (parsed.length === 0) return null;
    return null;
  }
  if (isRecord(parsed)) {
    if (typeof parsed.version === 'number') return parsed.version;
    if (typeof parsed.schemaVersion === 'number') return parsed.schemaVersion;
  }
  return null;
}

/** 从信封对象提取记录数组（workflows / items / data.projects / data.tasks 等） */
function recordArray(parsed: unknown): unknown[] | null {
  if (Array.isArray(parsed)) return parsed;
  if (!isRecord(parsed)) return null;
  for (const field of ['workflows', 'items', 'data', 'sessions']) {
    const v = parsed[field];
    if (Array.isArray(v)) return v;
    if (isRecord(v)) {
      for (const sub of ['projects', 'tasks', 'items', 'milestones']) {
        if (Array.isArray(v[sub])) return v[sub] as unknown[];
      }
    }
  }
  return null;
}

/* ---------------- 注册表 ---------------- */

export const MODULE_REGISTRY: AdminModuleEntry[] = [
  {
    id: 'chat',
    label: 'Chat',
    currentVersion: 1,
    mergeSupported: true,
    keys: [
      { key: CHAT_KEYS.data, kind: 'data' },
      { key: CHAT_KEYS.prefs, kind: 'cache' },
      { key: CHAT_KEYS.presets, kind: 'cache' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: (parsed) => {
      const arr = recordArray(parsed);
      const count = arr?.length ?? 0;
      return { count, detail: `${count} 条会话` };
    },
  },
  {
    id: 'workflows',
    label: '工作流',
    currentVersion: 3,
    mergeSupported: true,
    keys: [
      { key: WORKFLOW_KEYS.data, kind: 'data' },
      { key: WORKFLOW_KEYS.templates, kind: 'cache' },
      { key: WORKFLOW_KEYS.legacyV2, kind: 'legacy' },
      { key: WORKFLOW_KEYS.legacyV1, kind: 'legacy' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: (parsed) => {
      const arr = recordArray(parsed);
      const count = arr?.length ?? 0;
      return { count, detail: `${count} 条工作流` };
    },
  },
  {
    id: 'projects',
    label: '开发中',
    currentVersion: 3,
    mergeSupported: false,
    keys: [
      { key: PROJECT_KEYS.data, kind: 'data' },
      { key: PROJECT_KEYS.activities, kind: 'data' },
      { key: PROJECT_KEYS.retrospectives, kind: 'data' },
      { key: PROJECT_KEYS.snapshots, kind: 'cache' },
      { key: PROJECT_KEYS.ui, kind: 'cache' },
      { key: PROJECT_KEYS.legacyProjectsV2, kind: 'legacy' },
      { key: PROJECT_KEYS.legacyProjectsV1, kind: 'legacy' },
      { key: PROJECT_KEYS.legacyActivitiesV2, kind: 'legacy' },
      { key: PROJECT_KEYS.legacyActivitiesV1, kind: 'legacy' },
      { key: PROJECT_KEYS.legacyUiV2, kind: 'legacy' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: (parsed) => {
      const arr = recordArray(parsed);
      const count = arr?.length ?? 0;
      return { count, detail: `${count} 个项目` };
    },
  },
  {
    id: 'tasks',
    label: '任务',
    currentVersion: 3,
    mergeSupported: false,
    keys: [
      { key: TASK_KEYS.data, kind: 'data' },
      { key: TASK_KEYS.ui, kind: 'cache' },
      { key: TASK_KEYS.templates, kind: 'cache' },
      { key: TASK_KEYS.legacyV2, kind: 'legacy' },
      { key: TASK_KEYS.legacyV1, kind: 'legacy' },
      { key: TASK_KEYS.legacyUiV2, kind: 'legacy' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: (parsed) => {
      const arr = recordArray(parsed);
      const count = arr?.length ?? 0;
      return { count, detail: `${count} 条任务` };
    },
  },
  {
    id: 'achievements',
    label: '已完成',
    currentVersion: 2,
    mergeSupported: true,
    keys: [
      { key: ACHIEVEMENT_KEYS.data, kind: 'data' },
      { key: ACHIEVEMENT_KEYS.ui, kind: 'cache' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: (parsed) => {
      const arr = recordArray(parsed);
      const count = arr?.length ?? 0;
      return { count, detail: `${count} 条成果` };
    },
  },
  {
    id: 'admin',
    label: '管理系统',
    currentVersion: 1,
    mergeSupported: false,
    keys: [
      { key: ADMIN_STORAGE_KEY, kind: 'data' },
      { key: ADMIN_PROVIDERS_KEY, kind: 'data' },
    ],
    versionOf: (raw) => {
      try {
        return envelopeVersion(JSON.parse(raw));
      } catch {
        return null;
      }
    },
    summarize: () => ({ count: 1, detail: '1 份偏好设置' }),
  },
];

export function moduleById(id: string): AdminModuleEntry | undefined {
  return MODULE_REGISTRY.find((m) => m.id === id);
}

/** 全部受管 key 白名单（去重保序） */
export function allManagedKeys(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of MODULE_REGISTRY) {
    for (const k of m.keys) {
      if (!seen.has(k.key)) {
        seen.add(k.key);
        out.push(k.key);
      }
    }
  }
  return out;
}

/** 数据 + 缓存类 key（清理「缓存类数据」用；legacy 不属于缓存） */
export function cacheKeys(): string[] {
  const out: string[] = [];
  for (const m of MODULE_REGISTRY) {
    for (const k of m.keys) {
      if (k.kind === 'cache') out.push(k.key);
    }
  }
  return out;
}

function safeGetItem(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function byteSize(value: string): number {
  try {
    return new Blob([value]).size;
  } catch {
    return value.length * 2;
  }
}

function parseRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** 扫描单个模块：宽容处理缺失 / 损坏 / 不可读 / 版本过新 */
export function scanModule(entry: AdminModuleEntry): ModuleSnapshot {
  const keysFound: string[] = [];
  let sizeBytes = 0;
  let rawData: string | null = null;

  for (const k of entry.keys) {
    const raw = safeGetItem(k.key);
    if (raw === null) continue;
    keysFound.push(k.key);
    sizeBytes += byteSize(raw);
    if (k.kind === 'data' && rawData === null) rawData = raw;
  }

  if (keysFound.length === 0) {
    return {
      moduleId: entry.id,
      label: entry.label,
      status: 'missing',
      present: false,
      version: null,
      summary: null,
      keysFound: [],
      sizeBytes: 0,
    };
  }

  if (rawData === null) {
    // 只有缓存/遗留 key 存在：可读取但无主数据
    return {
      moduleId: entry.id,
      label: entry.label,
      status: 'ok',
      present: true,
      version: entry.currentVersion,
      summary: null,
      keysFound,
      sizeBytes,
    };
  }

  const parsed = parseRaw(rawData);
  if (parsed === undefined) {
    return {
      moduleId: entry.id,
      label: entry.label,
      status: 'corrupt',
      present: true,
      version: null,
      summary: null,
      keysFound,
      sizeBytes,
    };
  }

  const version = entry.versionOf(rawData);
  let status: ModuleStatus = 'ok';
  if (version !== null && entry.currentVersion !== null && version > entry.currentVersion) {
    status = 'newer';
  } else if (version === null && Array.isArray(parsed) && parsed.length === 0) {
    status = 'ok'; // 空数组可接受
  }

  const summary = entry.summarize(parsed);
  return {
    moduleId: entry.id,
    label: entry.label,
    status,
    present: true,
    version,
    summary,
    keysFound,
    sizeBytes,
  };
}

/** 扫描全部注册模块（含本地存储总用量估算） */
export function scanAllModules(): { snapshots: ModuleSnapshot[]; totalBytes: number } {
  const snapshots: ModuleSnapshot[] = [];
  let totalBytes = 0;
  for (const entry of MODULE_REGISTRY) {
    const snap = scanModule(entry);
    snapshots.push(snap);
    totalBytes += snap.sizeBytes;
  }
  return { snapshots, totalBytes };
}

/** 读取模块主数据 key 的原始值（用于备份） */
export function readModuleDataRaw(moduleId: string): string | null {
  const entry = moduleById(moduleId);
  if (!entry) return null;
  for (const k of entry.keys) {
    if (k.kind === 'data') {
      const raw = safeGetItem(k.key);
      if (raw !== null) return raw;
    }
  }
  return null;
}

/** 读取模块全部受管 key 的原始值（用于回滚快照） */
export function readModuleRawAll(moduleId: string): Record<string, string> {
  const entry = moduleById(moduleId);
  if (!entry) return {};
  const out: Record<string, string> = {};
  for (const k of entry.keys) {
    const raw = safeGetItem(k.key);
    if (raw !== null) out[k.key] = raw;
  }
  return out;
}

export interface ClearResult {
  removed: string[];
  failed: string[];
}

/** 按白名单 key 精确清理（绝不使用通配符 / 遍历删除未知数据） */
function removeKeys(keys: string[]): ClearResult {
  const removed: string[] = [];
  const failed: string[] = [];
  for (const key of keys) {
    try {
      window.localStorage.removeItem(key);
      removed.push(key);
    } catch {
      failed.push(key);
    }
  }
  return { removed, failed };
}

/** 清理单个模块的全部受管 key */
export function clearModuleData(moduleId: string): ClearResult {
  const entry = moduleById(moduleId);
  if (!entry) return { removed: [], failed: [] };
  return removeKeys(entry.keys.map((k) => k.key));
}

/** 仅清理缓存类数据（全部模块的 cache key） */
export function clearCacheOnly(): ClearResult {
  return removeKeys(cacheKeys());
}

/** 清理全部受管模块数据 */
export function clearAllManagedData(): ClearResult {
  return removeKeys(allManagedKeys());
}
