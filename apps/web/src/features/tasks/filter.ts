/**
 * 任务截止日期筛选与分组纯函数（可单测，不依赖 store）
 */
import type { DueGroup, TaskDateFilter, TaskItem } from './types';

export function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 距今天数（今天=0，未来为正，过去为负；无日期返回 null） */
export function daysFromToday(dueDate: string | undefined, today: string): number | null {
  if (!dueDate) return null;
  const due = new Date(`${dueDate}T00:00:00`);
  const base = new Date(`${today}T00:00:00`);
  if (Number.isNaN(due.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.round((due.getTime() - base.getTime()) / 86_400_000);
}

/** 按截止日期筛选（纯函数；overdue 不计已完成任务，与统计口径一致） */
export function filterTasksByDate(
  list: TaskItem[],
  filter: TaskDateFilter,
  today: string,
): TaskItem[] {
  if (filter === 'all') return list;
  return list.filter((t) => {
    const d = daysFromToday(t.dueDate, today);
    if (filter === 'none') return d === null;
    if (d === null) return false;
    if (filter === 'today') return d === 0;
    if (filter === 'overdue') return d < 0 && t.status !== 'done';
    // upcoming：今天起 7 天内
    if (filter === 'upcoming') return d >= 0 && d <= 7;
    return false;
  });
}

/** 任务归属的截止分组（排序用：逾期 < 今天 < 7 天内 < 更晚 < 无日期） */
export function dueGroupOf(dueDate: string | undefined, today: string): DueGroup {
  const d = daysFromToday(dueDate, today);
  if (d === null) return 'none';
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 7) return 'upcoming';
  return 'later';
}

export const DUE_GROUP_ORDER: Record<DueGroup, number> = {
  overdue: 0,
  today: 1,
  upcoming: 2,
  later: 3,
  none: 4,
};

/** 按截止分组聚合（返回按组顺序排列的 [组, 任务列表] 数组） */
export function groupTasksByDue(
  list: TaskItem[],
  today: string,
): { group: DueGroup; tasks: TaskItem[] }[] {
  const buckets = new Map<DueGroup, TaskItem[]>();
  for (const t of list) {
    const g = dueGroupOf(t.dueDate, today);
    const arr = buckets.get(g) ?? [];
    arr.push(t);
    buckets.set(g, arr);
  }
  return (Object.keys(DUE_GROUP_ORDER) as DueGroup[])
    .filter((g) => buckets.has(g))
    .map((g) => ({ group: g, tasks: buckets.get(g)! }));
}
