/**
 * 项目健康统计 / 复盘模板 / 归档快照 —— 纯函数（可单测，不依赖 store）
 */
import type {
  Milestone,
  ProjectActivity,
  ProjectDetail,
  ProjectSnapshot,
  Retrospective,
} from './types';
import type { FocusSession, TaskItem } from '@/features/tasks/types';
import { milestoneProgress, milestoneRisk } from './milestones';
import type { MilestoneDerived } from './milestones';

export interface HealthStats {
  /** 完成率 0-100（不计已取消） */
  completionRate: number;
  /** 已逾期且未完成的任务数 */
  overdueCount: number;
  /** 该项目任务累计专注分钟数 */
  focusMinutes: number;
  /** 最近 7 天活动数 */
  activity7d: number;
  /** 最近 30 天活动数 */
  activity30d: number;
  /** 最近 7 天完成任务趋势（date → count） */
  doneTrend: { date: string; count: number }[];
  /** 最近 7 天未完成任务趋势（date → count） */
  pendingTrend: { date: string; count: number }[];
  /** 里程碑摘要 */
  milestones: {
    total: number;
    done: number;
    atRisk: number;
    overdue: number;
  };
  /** 每个里程碑的派生信息（含风险） */
  milestoneDetails: MilestoneDerived[];
}

function dateKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lastNDays(n: number, today: string): string[] {
  const base = new Date(`${today}T00:00:00`);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base.getTime() - i * 86_400_000);
    const p = (x: number) => String(x).padStart(2, '0');
    out.push(`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`);
  }
  return out;
}

export interface HealthInput {
  tasks: TaskItem[];
  milestones: Milestone[];
  activities: ProjectActivity[];
  focusSessions: FocusSession[];
  today: string;
}

/** 健康统计（纯函数） */
export function buildHealthStats(input: HealthInput): HealthStats {
  const { tasks, milestones, activities, focusSessions, today } = input;
  const nonCancelled = tasks.filter((t) => t.status !== 'cancelled');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const completionRate =
    nonCancelled.length === 0 ? 0 : Math.round((doneTasks.length / nonCancelled.length) * 100);
  const overdueCount = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate < today,
  ).length;

  const taskIds = new Set(tasks.map((t) => t.id));
  const focusMinutes = focusSessions
    .filter((s) => taskIds.has(s.taskId))
    .reduce((sum, s) => sum + s.minutes, 0);

  const days = lastNDays(7, today);
  const activityByDay = new Map<string, number>();
  for (const a of activities) {
    const k = dateKey(a.createdAt);
    if (k && k >= days[0]!) activityByDay.set(k, (activityByDay.get(k) ?? 0) + 1);
  }
  const activity7d = days.reduce((sum, d) => sum + (activityByDay.get(d) ?? 0), 0);
  const activity30d = activities.filter((a) => {
    const k = dateKey(a.createdAt);
    return k && k >= days[0]!;
  }).length;

  const doneTrend = days.map((d) => ({
    date: d,
    count: tasks.filter((t) => t.status === 'done' && dateKey(t.updatedAt) === d).length,
  }));
  const pendingTrend = days.map((d) => ({
    date: d,
    count: tasks.filter(
      (t) => t.status !== 'done' && t.status !== 'cancelled' && dateKey(t.updatedAt) === d,
    ).length,
  }));

  const milestoneDetails: MilestoneDerived[] = milestones.map((m) => {
    const p = milestoneProgress(
      m,
      (id) => taskIds.has(id) && tasks.find((t) => t.id === id)?.status === 'done',
    );
    const risk = milestoneRisk(m.status, m.dueDate, today);
    return { ...m, ...p, risk, overdue: risk === 'overdue' };
  });
  const ms = milestoneDetails;
  return {
    completionRate,
    overdueCount,
    focusMinutes,
    activity7d,
    activity30d,
    doneTrend,
    pendingTrend,
    milestones: {
      total: ms.length,
      done: ms.filter((m) => m.risk === 'done').length,
      atRisk: ms.filter((m) => m.risk === 'at-risk').length,
      overdue: ms.filter((m) => m.risk === 'overdue').length,
    },
    milestoneDetails: ms,
  };
}

/** 复盘笔记模板（纯函数）：基于健康统计预填四段文本 */
export function buildRetroTemplate(
  health: HealthStats,
): Omit<Retrospective, 'projectId' | 'updatedAt'> {
  const ms = health.milestones;
  const msLine =
    ms.total === 0
      ? '（暂无里程碑）'
      : `共 ${ms.total} 个里程碑，已完成 ${ms.done} 个，${ms.atRisk} 个有延期风险，${ms.overdue} 个已逾期。`;
  return {
    done: `本期完成率 ${health.completionRate}%，完成 ${health.doneTrend.reduce((s, d) => s + d.count, 0)} 个任务。\n`,
    blockers: health.overdueCount > 0 ? `仍有 ${health.overdueCount} 个任务逾期未完成。\n` : '',
    next: '',
    lessons: msLine,
  };
}

/** 归档快照构建（纯函数） */
export function buildSnapshot(input: {
  project: ProjectDetail;
  tasks: TaskItem[];
  milestones: Milestone[];
  activities: ProjectActivity[];
  retrospective: Retrospective | null;
  now: string;
}): ProjectSnapshot {
  return {
    id: `snap-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    projectId: input.project.id,
    createdAt: input.now,
    data: {
      project: {
        ...input.project,
        tags: [...input.project.tags],
        techStack: [...input.project.techStack],
      },
      tasks: input.tasks.map((t) => ({
        ...t,
        tags: [...t.tags],
        subtasks: t.subtasks.map((s) => ({ ...s })),
        dependsOn: [...(t.dependsOn ?? [])],
      })),
      milestones: input.milestones.map((m) => ({ ...m, taskIds: [...m.taskIds] })),
      activities: input.activities.map((a) => ({ ...a })),
      retrospective: input.retrospective ? { ...input.retrospective } : null,
    },
  };
}
