/**
 * 项目执行仪表盘 —— 纯函数（可单测，不依赖 store）
 *
 * 统计口径：
 * - 时间窗口以 YYYY-MM-DD 边界对比任务 createdAt / updatedAt / dueDate；
 * - 延期数 = 窗口内「变为逾期」的任务数（updatedAt 落在窗口内 且 未完成 且 dueDate < 窗口末日）；
 * - 计划完成率 = 今日计划中已勾选完成的比例（独立于看板状态）；
 * - 周目标按「周一开始」的周窗口统计。
 */
import type { FocusItem, FocusSession, TaskItem } from '@/features/tasks/types';
import type { Milestone, ProjectDetail } from './types';
import { dailyFocusMinutes, focusStreak } from '@/features/tasks/focus';

export interface ThroughputStats {
  /** 近 7 天 */
  done7d: number;
  created7d: number;
  delayed7d: number;
  focusMinutes7d: number;
  /** 近 30 天 */
  done30d: number;
  created30d: number;
  delayed30d: number;
  focusMinutes30d: number;
  /** 今日计划完成率 0-100（无计划项时为 null） */
  planCompletionRate: number | null;
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toDateStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDaysStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return toDateStr(new Date(d.getTime() + days * 86_400_000));
}

/** 累计专注分钟数（endedAt 落在 [from, to] 区间内） */
function focusInRange(sessions: FocusSession[], from: string, to: string): number {
  return sessions
    .filter((s) => {
      const k = dateKey(s.endedAt);
      return k >= from && k <= to;
    })
    .reduce((sum, s) => sum + s.minutes, 0);
}

/** 窗口内「变为逾期」的任务数（updatedAt 落在窗口内） */
function delayedInRange(tasks: TaskItem[], from: string, to: string): number {
  return tasks.filter((t) => {
    if (t.status === 'done' || t.status === 'cancelled') return false;
    if (!t.dueDate || t.dueDate >= to) return false;
    const upd = dateKey(t.updatedAt);
    return upd >= from && upd <= to;
  }).length;
}

export function buildThroughput(
  tasks: TaskItem[],
  sessions: FocusSession[],
  today: string,
): ThroughputStats {
  const from7 = addDaysStr(today, -6);
  const from30 = addDaysStr(today, -29);
  return {
    done7d: tasks.filter((t) => {
      const k = dateKey(t.updatedAt);
      return t.status === 'done' && k >= from7 && k <= today;
    }).length,
    created7d: tasks.filter((t) => {
      const k = dateKey(t.createdAt);
      return k >= from7 && k <= today;
    }).length,
    delayed7d: delayedInRange(tasks, from7, today),
    focusMinutes7d: focusInRange(sessions, from7, today),
    done30d: tasks.filter((t) => {
      const k = dateKey(t.updatedAt);
      return t.status === 'done' && k >= from30 && k <= today;
    }).length,
    created30d: tasks.filter((t) => {
      const k = dateKey(t.createdAt);
      return k >= from30 && k <= today;
    }).length,
    delayed30d: delayedInRange(tasks, from30, today),
    focusMinutes30d: focusInRange(sessions, from30, today),
    planCompletionRate: null,
  };
}

/** 个人执行优先级行 */
export type PriorityKind = 'today' | 'week-due' | 'overdue' | 'blocked' | 'stale';

export interface PriorityRow {
  kind: PriorityKind;
  label: string;
  /** 描述（如「3 个任务」） */
  count: number;
  /** 关联项目 id（去重） */
  projectIds: string[];
  /** 关联任务 id */
  taskIds: string[];
  /** 附加说明 */
  hint?: string;
}

export interface PriorityInput {
  tasks: TaskItem[];
  projects: ProjectDetail[];
  focus: FocusItem[];
  focusDone: string[];
  today: string;
  /** 各项目最近活动时间（projectId → ISO） */
  latestActivityAt: Map<string, string>;
  /** 长期无活动阈值天数（默认 14） */
  staleDays?: number;
}

/** 今日计划任务（跨项目，含勾选状态） */
export function todayPlanRows(
  focus: FocusItem[],
  focusDone: string[],
): { taskId: string; done: boolean }[] {
  const doneSet = new Set(focusDone);
  return focus.map((f) => ({ taskId: f.taskId, done: doneSet.has(f.taskId) }));
}

/** 个人执行优先级（按严重度排序；空数据不产生虚假行） */
export function buildPriorities(input: PriorityInput): PriorityRow[] {
  const { tasks, projects, focus, focusDone, today, latestActivityAt, staleDays = 14 } = input;
  const out: PriorityRow[] = [];
  const activeIds = new Set(
    projects.filter((p) => p.status !== 'archived' && p.status !== 'completed').map((p) => p.id),
  );
  const byId = new Map(tasks.map((t) => [t.id, t]));

  // 今日计划
  const plan = todayPlanRows(focus, focusDone);
  const undonePlan = plan.filter((p) => !p.done);
  if (plan.length > 0) {
    out.push({
      kind: 'today',
      label: '今日计划',
      count: undonePlan.length,
      projectIds: [
        ...new Set(
          undonePlan.map((p) => byId.get(p.taskId)?.projectId).filter((x): x is string => !!x),
        ),
      ],
      taskIds: undonePlan.map((p) => p.taskId),
      hint: plan.length > 0 ? `共 ${plan.length} 项，未完成 ${undonePlan.length} 项` : undefined,
    });
  }

  // 本周截止（未完成、dueDate 在本周内）
  const weekEnd = addDaysStr(today, 6 - new Date(`${today}T00:00:00`).getDay());
  const weekDue = tasks.filter(
    (t) =>
      activeIds.has(t.projectId ?? '') &&
      t.status !== 'done' &&
      t.status !== 'cancelled' &&
      !!t.dueDate &&
      t.dueDate >= today &&
      t.dueDate <= weekEnd,
  );
  if (weekDue.length > 0) {
    out.push({
      kind: 'week-due',
      label: '本周截止',
      count: weekDue.length,
      projectIds: [...new Set(weekDue.map((t) => t.projectId).filter((x): x is string => !!x))],
      taskIds: weekDue.map((t) => t.id),
    });
  }

  // 逾期
  const overdue = tasks.filter(
    (t) =>
      activeIds.has(t.projectId ?? '') &&
      t.status !== 'done' &&
      t.status !== 'cancelled' &&
      !!t.dueDate &&
      t.dueDate < today,
  );
  if (overdue.length > 0) {
    out.push({
      kind: 'overdue',
      label: '逾期任务',
      count: overdue.length,
      projectIds: [...new Set(overdue.map((t) => t.projectId).filter((x): x is string => !!x))],
      taskIds: overdue.map((t) => t.id),
      hint: `最早逾期 ${overdue.map((t) => t.dueDate).sort()[0]}`,
    });
  }

  // 受阻（存在未完成前置；跨项目任务也计入，仅统计活动项目）
  const blocked = tasks.filter(
    (t) => activeIds.has(t.projectId ?? '') && t.status !== 'done' && t.status !== 'cancelled',
  );
  const depSet = new Map(
    tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled').map((t) => [t.id, t]),
  );
  const blockedRows = blocked.filter((t) => t.dependsOn.some((d) => depSet.has(d)));
  if (blockedRows.length > 0) {
    out.push({
      kind: 'blocked',
      label: '受阻任务',
      count: blockedRows.length,
      projectIds: [...new Set(blockedRows.map((t) => t.projectId).filter((x): x is string => !!x))],
      taskIds: blockedRows.map((t) => t.id),
    });
  }

  // 长期无活动项目（最近活动距今 > staleDays 天且未归档未完成）
  const stale: string[] = [];
  for (const p of projects) {
    if (!activeIds.has(p.id)) continue;
    if (p.status === 'completed') continue;
    const last = latestActivityAt.get(p.id);
    const lastDay = last ? dateKey(last) : p.updatedAt;
    if (!lastDay) continue;
    const diff = Math.floor(
      (new Date(`${today}T00:00:00`).getTime() - new Date(`${lastDay}T00:00:00`).getTime()) /
        86_400_000,
    );
    if (diff > staleDays) stale.push(p.id);
  }
  if (stale.length > 0) {
    out.push({
      kind: 'stale',
      label: '长期未活动项目',
      count: stale.length,
      projectIds: stale,
      taskIds: [],
      hint: `超过 ${staleDays} 天无活动`,
    });
  }
  return out;
}

// ── 周目标 ──

export interface WeeklyGoal {
  id: string;
  projectId: string;
  /** 周一日期 YYYY-MM-DD */
  weekStart: string;
  description: string;
  /** 本周目标完成任务数 */
  targetTasks: number;
  /** 本周目标专注分钟数 */
  targetFocusMinutes: number;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyGoalProgress {
  doneTasks: number;
  focusMinutes: number;
  /** 任务完成进度 0-100 */
  taskProgress: number;
  /** 专注进度 0-100 */
  focusProgress: number;
  /** 综合进度（两者均值）0-100 */
  overall: number;
  risk: 'none' | 'behind' | 'critical';
}

export const WEEKLY_GOAL_HISTORY_LIMIT = 12;

/** 某日期所在周的周一（YYYY-MM-DD；周日归属上周） */
export function weekStartOf(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  const diff = (d.getDay() + 6) % 7; // 周一=0 … 周日=6
  const monday = new Date(d.getTime() - diff * 86_400_000);
  return toDateStr(monday);
}

/** 今日所在周的周标签（如「2026-08-10 周」） */
export function weekLabel(weekStart: string): string {
  const end = addDaysStr(weekStart, 6);
  return `${weekStart} ~ ${end}`;
}

export function weekProgress(
  goal: WeeklyGoal,
  tasks: TaskItem[],
  sessions: FocusSession[],
  today: string,
): WeeklyGoalProgress {
  const weekEnd = addDaysStr(goal.weekStart, 6);
  const inWeek = tasks.filter((t) => t.projectId === goal.projectId);
  const doneTasks = inWeek.filter((t) => {
    if (t.status !== 'done') return false;
    const k = dateKey(t.updatedAt);
    return k >= goal.weekStart && k <= weekEnd;
  }).length;
  const focusMinutes = focusInRange(
    sessions.filter((s) => inWeek.some((t) => t.id === s.taskId)),
    goal.weekStart,
    weekEnd,
  );
  const taskProgress =
    goal.targetTasks <= 0 ? 0 : Math.min(100, Math.round((doneTasks / goal.targetTasks) * 100));
  const focusProgress =
    goal.targetFocusMinutes <= 0
      ? 0
      : Math.min(100, Math.round((focusMinutes / goal.targetFocusMinutes) * 100));
  const overall =
    goal.targetTasks <= 0 && goal.targetFocusMinutes <= 0
      ? 0
      : Math.round((taskProgress + focusProgress) / 2);
  // 风险：今天已过周中（>= 周四）且任一维度 < 40%；已过周五且任一维度 < 80%
  const weekday = new Date(`${today}T00:00:00`).getDay();
  let risk: WeeklyGoalProgress['risk'] = 'none';
  const minP = Math.min(taskProgress, focusProgress);
  if (weekday >= 5 && minP < 80) risk = 'critical';
  else if (weekday >= 3 && minP < 40) risk = 'behind';
  else if (weekday >= 3 && minP < 70) risk = 'behind';
  return { doneTasks, focusMinutes, taskProgress, focusProgress, overall, risk };
}

/** 专注连续天数（复用 focus.ts 的 focusStreak） */
export function streakDays(sessions: FocusSession[], today: string): number {
  return focusStreak(sessions, today);
}

/** 里程碑风险摘要（复用 health 逻辑的轻量版） */
export function milestoneRiskSummary(
  milestones: Milestone[],
  today: string,
): {
  total: number;
  done: number;
  atRisk: number;
  overdue: number;
} {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === 'done').length;
  const overdue = milestones.filter(
    (m) => m.status !== 'done' && m.dueDate && m.dueDate < today,
  ).length;
  const atRisk = milestones.filter((m) => {
    if (m.status === 'done' || !m.dueDate) return false;
    const diff = Math.floor(
      (new Date(`${m.dueDate}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) /
        86_400_000,
    );
    return diff <= 7 && diff >= 0;
  }).length;
  return { total, done, atRisk, overdue };
}

/** 周目标历史裁剪（保留最近 N 条，按 weekStart 降序） */
export function trimWeeklyGoalHistory(
  goals: WeeklyGoal[],
  limit = WEEKLY_GOAL_HISTORY_LIMIT,
): WeeklyGoal[] {
  return [...goals].sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1)).slice(0, limit);
}

export { dailyFocusMinutes };
