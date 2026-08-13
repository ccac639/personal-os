/**
 * 本地运行历史（纯函数，无 Vue 依赖）
 *
 * - 每次运行写入独立记录（workflowId / 版本签名 / 状态 / 输入输出摘要 / 节点结果 / 日志）
 * - 数量上限可配置（默认 100，固定项不受清理影响）
 * - 独立持久化边界：`personal-os-workflow-runs`
 * - 不记录敏感字段（输入摘要经脱敏处理）
 */
import type { RunHistoryEntry, RunHistoryStatus, RunMode, RunNodeResult } from './types';
import { uid } from './modules';

export const RUNS_STORAGE_KEY = 'personal-os-workflow-runs';
export const MAX_RUNS_DEFAULT = 100;

export interface RunRecordInput {
  workflowId: string;
  workflowName: string;
  workflowVersion: string;
  mode: RunMode;
  status: RunHistoryStatus;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  inputSummary: Record<string, unknown>;
  outputSummary: Record<string, unknown>;
  nodeResults: RunNodeResult[];
  logs: RunHistoryEntry['logs'];
  failedNodeId?: string;
  error?: string;
}

export function createRunRecord(input: RunRecordInput): RunHistoryEntry {
  return {
    id: uid('run'),
    ...input,
    // 日志截断上限（避免单条记录过大）
    logs: input.logs.slice(-200),
  };
}

/* ---------- 持久化（localStorage，写入失败返回 false 而非抛出） ---------- */

export function loadRunHistory(max = MAX_RUNS_DEFAULT): {
  records: RunHistoryEntry[];
  warnings: string[];
} {
  const warnings: string[] = [];
  try {
    const raw = localStorage.getItem(RUNS_STORAGE_KEY);
    if (!raw) return { records: [], warnings };
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !Array.isArray((parsed as { runs?: unknown }).runs)
    ) {
      warnings.push('运行历史数据损坏，已重置');
      return { records: [], warnings };
    }
    const runs = (parsed as { runs: RunHistoryEntry[] }).runs.filter(isValidRunEntry);
    return { records: runs.slice(0, max), warnings };
  } catch {
    warnings.push('运行历史读取失败，已重置');
    return { records: [], warnings };
  }
}

function isValidRunEntry(r: unknown): r is RunHistoryEntry {
  if (!r || typeof r !== 'object') return false;
  const e = r as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    typeof e.workflowId === 'string' &&
    typeof e.startedAt === 'number' &&
    typeof e.finishedAt === 'number'
  );
}

export function saveRunHistory(records: RunHistoryEntry[]): boolean {
  try {
    localStorage.setItem(RUNS_STORAGE_KEY, JSON.stringify({ version: 1, runs: records }));
    return true;
  } catch {
    return false;
  }
}

/** 追加一条记录并按上限清理（固定项保留），返回新列表 */
export function appendRunRecord(
  records: RunHistoryEntry[],
  record: RunHistoryEntry,
  max = MAX_RUNS_DEFAULT,
): RunHistoryEntry[] {
  const next = [record, ...records];
  return pruneRunRecords(next, max);
}

export function pruneRunRecords(records: RunHistoryEntry[], max: number): RunHistoryEntry[] {
  const pinned = records.filter((r) => r.pinned);
  const unpinned = records.filter((r) => !r.pinned);
  const keep = max - pinned.length;
  const trimmed = keep > 0 ? unpinned.slice(0, keep) : [];
  return [...trimmed, ...pinned].sort((a, b) => b.startedAt - a.startedAt);
}

/* ---------- 筛选 ---------- */

export interface RunHistoryFilter {
  status: 'all' | RunHistoryStatus;
  /** '' = 全部；否则按工作流 id */
  workflowId: string;
  mode: 'all' | RunMode;
  /** 'all' 或版本签名前缀 */
  version: string;
  /** 固定项筛选（true = 仅固定） */
  pinnedOnly: boolean;
}

export function filterRunHistory(
  records: RunHistoryEntry[],
  filter: RunHistoryFilter,
): RunHistoryEntry[] {
  return records.filter((r) => {
    if (filter.status !== 'all' && r.status !== filter.status) return false;
    if (filter.workflowId && r.workflowId !== filter.workflowId) return false;
    if (filter.mode !== 'all' && r.mode !== filter.mode) return false;
    if (filter.version && filter.version !== 'all' && !r.workflowVersion.startsWith(filter.version))
      return false;
    if (filter.pinnedOnly && !r.pinned) return false;
    return true;
  });
}

/** 删除单条 / 清空全部（固定项删除时也允许） */
export function removeRunRecord(records: RunHistoryEntry[], id: string): RunHistoryEntry[] {
  return records.filter((r) => r.id !== id);
}

export function clearRunHistory(
  records: RunHistoryEntry[],
  keepPinned: boolean,
): RunHistoryEntry[] {
  return keepPinned ? records.filter((r) => r.pinned) : [];
}

/* ---------- 对比 ---------- */

export interface RunComparison {
  aId: string;
  bId: string;
  statusChanged: boolean;
  durationChanged: boolean;
  inputDiff: Array<{ path: string; kind: string; from?: unknown; to?: unknown }>;
  outputDiff: Array<{ path: string; kind: string; from?: unknown; to?: unknown }>;
  failedNodeChanged: boolean;
  failedNodeA?: string;
  failedNodeB?: string;
}

export function compareRuns(a: RunHistoryEntry, b: RunHistoryEntry): RunComparison {
  return {
    aId: a.id,
    bId: b.id,
    statusChanged: a.status !== b.status,
    durationChanged: a.durationMs !== b.durationMs,
    inputDiff: objectDiffEntries(a.inputSummary, b.inputSummary),
    outputDiff: objectDiffEntries(a.outputSummary, b.outputSummary),
    failedNodeChanged: a.failedNodeId !== b.failedNodeId,
    failedNodeA: a.failedNodeId,
    failedNodeB: b.failedNodeId,
  };
}

/** 复用 diff.ts 的递归差异，但只保留路径/类型/值（不依赖 Vue） */
import { diffObjects } from './diff';

function objectDiffEntries(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): Array<{ path: string; kind: string; from?: unknown; to?: unknown }> {
  return diffObjects(a, b).map((e) => ({ path: e.path, kind: e.kind, from: e.from, to: e.to }));
}

/** 导出单条记录 JSON（脱敏摘要已在上层保证） */
export function exportRunRecord(record: RunHistoryEntry): string {
  return JSON.stringify(record, null, 2);
}
