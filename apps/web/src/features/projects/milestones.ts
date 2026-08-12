/**
 * 里程碑纯函数（可单测，不依赖 store）
 *
 * 进度定义：里程碑关联任务中「已完成」任务占（关联任务数）的比例；
 * 若未关联任何任务，进度为 0。
 */
import type { Milestone, MilestoneStatus } from './types';

/** 里程碑进度风险状态 */
export type MilestoneRisk = 'on-track' | 'at-risk' | 'overdue' | 'done';

export interface MilestoneProgress {
  total: number;
  done: number;
  /** 完成率 0-100（无关联任务时为 0） */
  progress: number;
  /** 剩余（未完成）任务数 */
  remaining: number;
}

export interface MilestoneDerived extends Milestone, MilestoneProgress {
  risk: MilestoneRisk;
  /** 是否逾期（未完成且截止日期早于今天） */
  overdue: boolean;
}

/** 里程碑展示状态（列表 / 时间轴降级说明用） */
export type MilestoneDisplayState =
  'done' | 'overdue' | 'due-soon' | 'no-date' | 'no-tasks' | 'normal';

export const MILESTONE_STATE_META: Record<
  MilestoneDisplayState,
  { label: string; cls: string; reason: string }
> = {
  done: { label: '已完成', cls: 'text-green-600 bg-green-500/10', reason: '里程碑已完成' },
  overdue: {
    label: '已逾期',
    cls: 'text-red-600 bg-red-500/10',
    reason: '截止日期已过且未完成',
  },
  'due-soon': {
    label: '即将到期',
    cls: 'text-amber-600 bg-amber-500/10',
    reason: '距离截止日期不足 7 天',
  },
  'no-date': {
    label: '未设置日期',
    cls: 'text-surface-800/60 bg-surface-100',
    reason: '未设置开始或截止日期',
  },
  'no-tasks': {
    label: '未关联任务',
    cls: 'text-surface-800/60 bg-surface-100',
    reason: '未关联任何任务，进度恒为 0',
  },
  normal: { label: '正常', cls: 'text-sky-600 bg-sky-500/10', reason: '按计划推进中' },
};

/** 里程碑进度计算（纯函数） */
export function milestoneProgress(
  milestone: Pick<Milestone, 'taskIds'>,
  taskDone: (taskId: string) => boolean,
): MilestoneProgress {
  const total = milestone.taskIds.length;
  const done = milestone.taskIds.filter(taskDone).length;
  return {
    total,
    done,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
    remaining: total - done,
  };
}

/** 里程碑风险判定（纯函数）
 * - done：已完成；
 * - overdue：未完成且截止日期已过；
 * - at-risk：未完成、有截止日期、剩余天数 ≤ 7 且进度 < 100%；
 * - on-track：其余。
 */
export function milestoneRisk(
  status: MilestoneStatus,
  dueDate: string | undefined,
  today: string,
): MilestoneRisk {
  if (status === 'done') return 'done';
  if (!dueDate) return 'on-track';
  if (dueDate < today) return 'overdue';
  const daysLeft = Math.round(
    (new Date(`${dueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
      86_400_000,
  );
  if (daysLeft <= 7) return 'at-risk';
  return 'on-track';
}

/**
 * 里程碑展示状态（纯函数）
 * 优先级：done > overdue > due-soon（≤7 天）> no-date > no-tasks > normal
 */
export function milestoneState(
  milestone: Pick<Milestone, 'status' | 'dueDate' | 'taskIds'>,
  today: string,
): MilestoneDisplayState {
  if (milestone.status === 'done') return 'done';
  if (milestone.dueDate && milestone.dueDate < today) return 'overdue';
  if (milestone.dueDate) {
    const daysLeft = Math.round(
      (new Date(`${milestone.dueDate}T00:00:00`).getTime() -
        new Date(`${today}T00:00:00`).getTime()) /
        86_400_000,
    );
    if (daysLeft <= 7) return 'due-soon';
  }
  if (!milestone.dueDate) return 'no-date';
  if (milestone.taskIds.length === 0) return 'no-tasks';
  return 'normal';
}

/** 清洗里程碑关联任务：去重、保序、丢弃空串（有效任务过滤由调用方结合任务列表完成） */
export function sanitizeMilestoneTaskIds(taskIds: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of taskIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** 里程碑中未完成关联任务数（完成提醒 / 风险提示用） */
export function unfinishedLinkedCount(
  milestone: Pick<Milestone, 'taskIds'>,
  taskDone: (taskId: string) => boolean,
): number {
  return milestone.taskIds.filter((id) => !taskDone(id)).length;
}

/** 里程碑排序（纯函数）：done 排最后，其余按 order、dueDate 升序 */
export function sortMilestones(
  list: Milestone[],
  statusOf: (m: Milestone) => MilestoneStatus = (m) => m.status,
): Milestone[] {
  return [...list].sort((a, b) => {
    const sa = statusOf(a) === 'done' ? 1 : 0;
    const sb = statusOf(b) === 'done' ? 1 : 0;
    if (sa !== sb) return sa - sb;
    if (a.order !== b.order) return a.order - b.order;
    if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate && !b.dueDate) return -1;
    if (!a.dueDate && b.dueDate) return 1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
}
