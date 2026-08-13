/**
 * Admin 功能域 —— 导入与恢复（事务式）
 *
 * 流程：
 * 1. parseBackupJson：严格解析 + 结构校验 → RestorePreview（模块数量、版本兼容性、摘要）
 * 2. applyRestore：先校验全部目标模块 → 统一提交 → 任一步失败则尽力回滚原快照
 * 3. 提交前自动创建临时回滚备份（内存态，可下载；不落盘，避免敏感数据入 localStorage）
 *
 * 安全边界：
 * - 只接受注册表白名单内的模块与 key；未知模块直接拒绝。
 * - 版本过新（备份版本 > 当前支持）的模块默认拒绝恢复（可改为跳过）。
 * - merge 仅在注册表声明 mergeSupported 的模块启用。
 */
import { buildFullBackup } from './backup';
import { MODULE_REGISTRY, moduleById } from './registry';
import type {
  BackupModule,
  RestoreMode,
  RestorePlanItem,
  RestorePreview,
  RestoreResult,
  RollbackSnapshot,
} from './types';

/* ---------------- 回滚快照（内存态，仅当前会话） ---------------- */

let lastRollback: RollbackSnapshot | null = null;

export function getLastRollbackSnapshot(): RollbackSnapshot | null {
  return lastRollback;
}

export function clearRollbackSnapshot(): void {
  lastRollback = null;
}

/** 生成当前可识别数据的临时回滚备份 */
export function buildRollbackSnapshot(): RollbackSnapshot | null {
  const payload = buildFullBackup();
  if (payload.modules.length === 0) return null;
  lastRollback = {
    createdAt: payload.exportedAt,
    appVersion: payload.appVersion,
    modules: payload.modules,
  };
  return lastRollback;
}

/* ---------------- 解析与预览 ---------------- */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseModuleFromBackup(raw: unknown): { moduleId: string; data: unknown } | null {
  if (!isRecord(raw)) return null;
  const moduleId = typeof raw.moduleId === 'string' ? raw.moduleId : '';
  if (!moduleId || !moduleById(moduleId)) return null;
  const keys = Array.isArray(raw.keys) ? raw.keys : [];
  // 主数据取 kind === 'data' 的第一项
  const dataKey = keys.find((k) => isRecord(k) && k.kind === 'data' && typeof k.key === 'string');
  const data = isRecord(dataKey) ? dataKey.data : null;
  if (data === undefined) return null;
  return { moduleId, data };
}

/** 从备份模块提取记录数摘要（宽容） */
function countOf(moduleId: string, data: unknown): number {
  const entry = moduleById(moduleId);
  if (!entry) return 0;
  const summary = entry.summarize(data);
  return summary.count;
}

function versionFromBackup(moduleId: string, data: unknown): number | null {
  const entry = moduleById(moduleId);
  if (!entry) return null;
  try {
    return entry.versionOf(JSON.stringify(data));
  } catch {
    return null;
  }
}

export interface ParsedBackup {
  valid: boolean;
  error?: string;
  appVersion?: string;
  exportedAt?: string;
  modules: BackupModule[];
}

function invalidParsed(error: string): ParsedBackup {
  return { valid: false, error, modules: [] };
}

/** 严格解析备份 JSON：结构非法 / 未知模块 / 无法解析 → 明确错误 */
export function parseBackupJson(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return invalidParsed('不是有效的 JSON 文件');
  }
  if (!isRecord(parsed)) return invalidParsed('备份文件结构无效：缺少根对象');
  if (parsed.app !== 'personal-os') {
    return invalidParsed('不是 Personal OS 备份文件');
  }
  if (!Array.isArray(parsed.modules)) {
    return invalidParsed('备份文件缺少模块清单');
  }

  const modules: BackupModule[] = [];
  for (const raw of parsed.modules) {
    const item = parseModuleFromBackup(raw);
    if (!item) {
      return invalidParsed('备份包含未识别的模块，已中止解析');
    }
    const entry = moduleById(item.moduleId)!;
    modules.push({
      moduleId: item.moduleId,
      label: entry.label,
      version: versionFromBackup(item.moduleId, item.data),
      keys: [{ key: '', kind: 'data', data: item.data }],
    });
  }

  return {
    valid: true,
    appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : undefined,
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : undefined,
    modules,
  };
}

/** 生成恢复预览：版本冲突、可解析性、支持模式 */
export function buildRestorePreview(parsed: ParsedBackup): RestorePreview {
  if (!parsed.valid) return { valid: false, error: parsed.error, modules: [] };
  const items: RestorePlanItem[] = parsed.modules.map((m) => {
    const entry = moduleById(m.moduleId)!;
    const backupVersion = m.version;
    const current = entry.currentVersion;
    let conflict: RestorePlanItem['conflict'] = 'none';
    if (backupVersion !== null && current !== null) {
      if (backupVersion > current) conflict = 'newer';
      else if (backupVersion === current) conflict = 'same';
      else conflict = 'older';
    }
    const supportedModes: RestoreMode[] =
      conflict === 'newer'
        ? ['skip']
        : entry.mergeSupported && backupVersion !== null
          ? ['skip', 'overwrite', 'merge']
          : ['skip', 'overwrite'];
    return {
      moduleId: m.moduleId,
      label: m.label,
      backupVersion,
      localVersion: current,
      conflict,
      count: countOf(m.moduleId, m.keys[0]?.data),
      parseable: backupVersion !== null || countOf(m.moduleId, m.keys[0]?.data) > 0,
      supportedModes,
    };
  });
  return {
    valid: true,
    appVersion: parsed.appVersion,
    exportedAt: parsed.exportedAt,
    modules: items,
  };
}

/* ---------------- 事务式恢复 ---------------- */

function readAllManagedRaw(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of MODULE_REGISTRY) {
    for (const k of entry.keys) {
      try {
        const raw = window.localStorage.getItem(k.key);
        if (raw !== null) out[k.key] = raw;
      } catch {
        /* 读取失败按不存在处理 */
      }
    }
  }
  return out;
}

/** 合并数据：数组拼接按记录 id 去重；对象信封按数组字段分别合并 */
function mergeData(current: unknown, incoming: unknown): unknown {
  if (Array.isArray(current) && Array.isArray(incoming)) {
    const seen = new Set<string>();
    const out: unknown[] = [];
    for (const item of [...current, ...incoming]) {
      if (isRecord(item) && typeof item.id === 'string') {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
      }
      out.push(item);
    }
    return out;
  }
  if (isRecord(current) && isRecord(incoming)) {
    const out: Record<string, unknown> = { ...current };
    for (const [k, v] of Object.entries(incoming)) {
      if (k === 'version') continue; // 保留本地版本号
      if (Array.isArray(v)) {
        const cur = Array.isArray(current[k]) ? (current[k] as unknown[]) : [];
        out[k] = mergeData(cur, v);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
  return incoming;
}

function currentRawOf(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function removeRaw(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 忽略 */
  }
}

/**
 * 事务式恢复：按模块选择模式执行。
 * - overwrite：用备份数据覆盖主数据 key
 * - merge：与本地数据按记录合并（仅 mergeSupported 模块）
 * - skip：不动
 * 任一步写入失败 → 回滚全部已写 key 到原值；尽力而为，失败也如实报告。
 */
export function applyRestore(
  parsed: ParsedBackup,
  choices: Record<string, RestoreMode>,
): RestoreResult {
  if (!parsed.valid) return { ok: false, restored: [], skipped: [], error: parsed.error };

  // 先校验：非法模式 / 不支持 merge / 版本过新一律拒绝
  for (const m of parsed.modules) {
    const entry = moduleById(m.moduleId)!;
    const mode = choices[m.moduleId] ?? 'skip';
    if (!['skip', 'overwrite', 'merge'].includes(mode)) {
      return {
        ok: false,
        restored: [],
        skipped: [],
        error: `模块「${entry.label}」选择了非法恢复模式`,
      };
    }
    if (mode === 'merge' && !entry.mergeSupported) {
      return {
        ok: false,
        restored: [],
        skipped: [],
        error: `模块「${entry.label}」不支持合并恢复`,
      };
    }
    if (m.version !== null && entry.currentVersion !== null && m.version > entry.currentVersion) {
      return {
        ok: false,
        restored: [],
        skipped: [],
        error: `模块「${entry.label}」备份版本 v${m.version} 高于当前支持 v${entry.currentVersion}，已拒绝`,
      };
    }
  }

  const targets = parsed.modules.filter(
    (m) => choices[m.moduleId] === 'overwrite' || choices[m.moduleId] === 'merge',
  );
  if (targets.length === 0)
    return { ok: true, restored: [], skipped: parsed.modules.map((m) => m.moduleId) };

  // 预读原值（回滚快照）
  const original = readAllManagedRaw();
  const writes: { key: string; value: string }[] = [];

  for (const m of targets) {
    const entry = moduleById(m.moduleId)!;
    const dataKey = entry.keys.find((k) => k.kind === 'data');
    if (!dataKey) continue;
    const incoming = m.keys[0]?.data;
    const mode = choices[m.moduleId] as RestoreMode;
    const currentRaw = currentRawOf(dataKey.key);

    if (mode === 'overwrite') {
      writes.push({ key: dataKey.key, value: JSON.stringify(incoming) });
    } else {
      // merge：本地无数据则等价覆盖
      if (currentRaw === null) {
        writes.push({ key: dataKey.key, value: JSON.stringify(incoming) });
      } else {
        let current: unknown;
        try {
          current = JSON.parse(currentRaw);
        } catch {
          current = null;
        }
        const merged = mergeData(current, incoming);
        writes.push({ key: dataKey.key, value: JSON.stringify(merged) });
      }
    }
  }

  // 统一提交；失败即回滚
  const writtenKeys: string[] = [];
  for (const w of writes) {
    if (!writeRaw(w.key, w.value)) {
      // 回滚已写入的
      let rollbackOk = true;
      for (const done of writtenKeys) {
        const prev = original[done];
        if (prev === undefined) removeRaw(done);
        else if (!writeRaw(done, prev)) rollbackOk = false;
      }
      return {
        ok: false,
        restored: [],
        skipped: [],
        error: `写入失败，已回滚${rollbackOk ? '' : '（部分回滚失败，请使用回滚备份恢复）'}`,
      };
    }
    writtenKeys.push(w.key);
  }

  return {
    ok: true,
    restored: targets.map((t) => t.moduleId),
    skipped: parsed.modules
      .filter((m) => (choices[m.moduleId] ?? 'skip') === 'skip')
      .map((m) => m.moduleId),
  };
}

/** 是否已有可查看的回滚备份 */
export function hasRollbackSnapshot(): boolean {
  return lastRollback !== null;
}
