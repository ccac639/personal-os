/**
 * 运行日志筛选（纯函数，无 Vue 依赖）
 *
 * 支持按级别 / 节点 / 时间窗口过滤。时间窗口相对本次运行第一条日志
 * 的时间起点计算，运行结束后日志不会随墙钟时间消失。
 */
import type { RunLogEntry } from './types';

export type LevelFilter = 'all' | 'info' | 'warn' | 'error';

export type TimeFilter = 'all' | '10' | '30' | '60';

export interface LogFilter {
  level: LevelFilter;
  /** '' = 全部节点；'none' = 无节点关联；否则为节点 id */
  node: string;
  time: TimeFilter;
}

export function matchesLevel(e: RunLogEntry, level: LevelFilter): boolean {
  if (level === 'all') return true;
  if (level === 'error') return e.level === 'error';
  if (level === 'warn') return e.level === 'warn' || e.level === 'error';
  return ['info', 'success', 'run'].includes(e.level);
}

export function matchesNode(e: RunLogEntry, node: string): boolean {
  if (node === '') return true;
  if (node === 'none') return e.nodeId === undefined;
  return e.nodeId === node;
}

/** 时间窗口：相对运行起点（第一条日志的 ts） */
export function matchesTime(
  e: RunLogEntry,
  time: TimeFilter,
  firstTs: number | undefined,
): boolean {
  if (time === 'all') return true;
  if (firstTs === undefined || e.ts === undefined) return true;
  return e.ts - firstTs <= Number(time) * 1000;
}

export function filterLogs(entries: RunLogEntry[], filter: LogFilter): RunLogEntry[] {
  const firstTs = entries[0]?.ts;
  return entries.filter(
    (e) =>
      matchesLevel(e, filter.level) &&
      matchesNode(e, filter.node) &&
      matchesTime(e, filter.time, firstTs),
  );
}
