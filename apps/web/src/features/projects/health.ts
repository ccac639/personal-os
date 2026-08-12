/**
 * 项目健康统计 / 风险规则 / 复盘模板与导出 / 归档快照 —— 纯函数（可单测，不依赖 store）
 */
import type {
  Milestone,
  ProjectActivity,
  ProjectDetail,
  ProjectSnapshot,
  Retrospective,
} from './types';
import type { FocusSession, TaskItem } from '@/features/tasks/types';
import { estimateSummary, formatHoursShort } from '@/features/tasks/estimates';
import { addDays, dayDiff } from './plan';
import { milestoneProgress, milestoneRisk } from './milestones';
import type { MilestoneDerived } from './milestones';

export interface HealthStats {
  /** 完成率 0-100（不计已取消） */
  completionRate: number;
  /** 已逾期且未完成的任务数 */
  overdueCount: number;
  /** 逾期率 0-100（逾期任务 / 未取消任务） */
  overdueRate: number;
  /** 受阻任务数（存在未完成前置） */
  blockedCount: number;
  /** 该项目任务累计专注分钟数 */
  focusMinutes: number;
  /** 最近 7 天活动数（兼容旧字段） */
  activity7d: number;
  /** 最近 30 天活动数（兼容旧字段） */
  activity30d: number;
  /** 当前时间范围（7d / 30d）内的活动数 */
  activityRecent: number;
  /** 当前时间范围内的完成任务趋势（date → count） */
  doneTrend: { date: string; count: number }[];
  /** 当前时间范围内的未完成任务趋势（date → count） */
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

/** 复盘时间范围 */
export type HealthRange = '7d' | '30d';

/** 风险等级 */
export type RiskLevel = 'danger' | 'warn' | 'ok';

/** 一条健康风险规则结果 */
export interface RiskRule {
  key: string;
  level: RiskLevel;
  label: string;
  detail: string;
}

export interface RiskRuleInput {
  project: ProjectDetail;
  tasks: TaskItem[];
  milestones: Milestone[];
  activities: ProjectActivity[];
  focusSessions: FocusSession[];
  today: string;
  /** 最近活动 ISO 时间（无活动时为 null） */
  latestActivityAt: string | null;
}

/**
 * 项目健康风险规则（纯函数）：进度落后 / 临近截止 / 长期无活动 / 阻塞任务 / 专注偏差。
 * 无数据时不输出虚假结论；完成 / 归档项目跳过时间相关规则。
 */
export function buildRiskRules(input: RiskRuleInput): RiskRule[] {
  const { project, tasks, milestones, activities, focusSessions, today, latestActivityAt } = input;
  const stats = buildHealthStats({ tasks, milestones, activities, focusSessions, today });
  const done =
    project.status === 'completed' || project.status === 'archived' || stats.completionRate === 100;
  const rules: RiskRule[] = [];

  // 1. 进度落后：目标日期已过且项目未完成
  if (project.targetDate && project.targetDate < today && !done) {
    rules.push({
      key: 'progress-behind',
      level: 'danger',
      label: '进度落后',
      detail: `目标日期 ${project.targetDate} 已过，项目尚未完成（完成率 ${stats.completionRate}%）`,
    });
  }

  // 2. 临近截止：目标日期或里程碑 7 天内到期
  if (!done) {
    const soonTarget =
      project.targetDate && project.targetDate >= today && project.targetDate <= addDays(today, 7);
    const soonMs = milestones.filter(
      (m) =>
        m.status !== 'done' && m.dueDate && m.dueDate >= today && m.dueDate <= addDays(today, 7),
    ).length;
    if (soonTarget && soonMs > 0) {
      rules.push({
        key: 'deadline-soon',
        level: 'warn',
        label: '临近截止',
        detail: `目标日期 ${project.targetDate} 与 ${soonMs} 个里程碑 7 天内到期`,
      });
    } else if (soonTarget) {
      rules.push({
        key: 'deadline-soon',
        level: 'warn',
        label: '临近截止',
        detail: `目标日期 ${project.targetDate} 在 7 天内`,
      });
    } else if (soonMs > 0) {
      rules.push({
        key: 'deadline-soon',
        level: 'warn',
        label: '临近截止',
        detail: `${soonMs} 个里程碑将在 7 天内到期`,
      });
    }
  }

  // 3. 长期无活动：最近活动超过 14 天（或项目有数据但从未有活动）
  if (!done) {
    if (!latestActivityAt) {
      if (tasks.length > 0 || stats.activity30d > 0 || milestones.length > 0) {
        rules.push({
          key: 'stale',
          level: 'warn',
          label: '长期无活动',
          detail: '项目有任务但无活动记录，可能已停滞',
        });
      }
    } else {
      const k = latestActivityAt.slice(0, 10);
      const days = isValidDate(k) ? dayDiff(k, today) : 0;
      if (days >= 14) {
        rules.push({
          key: 'stale',
          level: 'warn',
          label: '长期无活动',
          detail: `最近活动在 ${days} 天前`,
        });
      }
    }
  }

  // 4. 阻塞任务：存在未完成前置
  if (stats.blockedCount > 0) {
    rules.push({
      key: 'blocked',
      level: 'warn',
      label: '阻塞任务',
      detail: `${stats.blockedCount} 个任务存在未完成前置`,
    });
  }

  // 5. 专注偏差：有估时任务且实际投入明显低于估时
  const est = estimateSummary(tasks, focusSessions);
  if (
    est.estimatedCount > 0 &&
    est.varianceMinutes !== null &&
    est.varianceMinutes > 0 &&
    est.varianceMinutes > est.estimatedMinutes * 0.5
  ) {
    rules.push({
      key: 'focus-drift',
      level: 'warn',
      label: '专注偏差',
      detail: `${est.estimatedCount} 个任务有估时，实际投入低于估时 ${formatHoursShort(est.varianceMinutes)}`,
    });
  }

  return rules;
}

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00`).getTime());
}

/** 健康统计（纯函数）；range 控制趋势与活动统计的时间跨度，默认 7 天 */
export function buildHealthStats(input: HealthInput, range: HealthRange = '7d'): HealthStats {
  const { tasks, milestones, activities, focusSessions, today } = input;
  const nonCancelled = tasks.filter((t) => t.status !== 'cancelled');
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const completionRate =
    nonCancelled.length === 0 ? 0 : Math.round((doneTasks.length / nonCancelled.length) * 100);
  const overdueCount = tasks.filter(
    (t) => t.status !== 'done' && t.dueDate && t.dueDate < today,
  ).length;
  const overdueRate =
    nonCancelled.length === 0 ? 0 : Math.round((overdueCount / nonCancelled.length) * 100);

  const taskIds = new Set(tasks.map((t) => t.id));
  const doneIds = new Set(doneTasks.map((t) => t.id));
  const blockedCount = tasks.filter(
    (t) => t.status !== 'done' && (t.dependsOn ?? []).some((depId) => !doneIds.has(depId)),
  ).length;

  const focusMinutes = focusSessions
    .filter((s) => taskIds.has(s.taskId))
    .reduce((sum, s) => sum + s.minutes, 0);

  const days = range === '30d' ? lastNDays(30, today) : lastNDays(7, today);
  const activityByDay = new Map<string, number>();
  for (const a of activities) {
    const k = dateKey(a.createdAt);
    if (k && k >= days[0]!) activityByDay.set(k, (activityByDay.get(k) ?? 0) + 1);
  }
  const activityRecent = days.reduce((sum, d) => sum + (activityByDay.get(d) ?? 0), 0);
  const activity7d = lastNDays(7, today).reduce((sum, d) => sum + (activityByDay.get(d) ?? 0), 0);
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
    overdueRate,
    blockedCount,
    focusMinutes,
    activity7d,
    activity30d,
    activityRecent,
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
  const doneCount = health.doneTrend.reduce((s, d) => s + d.count, 0);
  const blockers: string[] = [];
  if (health.overdueCount > 0) blockers.push(`仍有 ${health.overdueCount} 个任务逾期未完成。`);
  if (health.blockedCount > 0)
    blockers.push(`${health.blockedCount} 个任务受阻（存在未完成前置）。`);
  if (ms.overdue > 0) blockers.push(`${ms.overdue} 个里程碑已逾期。`);
  return {
    done: `本期完成率 ${health.completionRate}%，完成 ${doneCount} 个任务；累计专注 ${formatHoursShort(health.focusMinutes)}。\n`,
    blockers: blockers.join('\n'),
    next: '',
    lessons: `${msLine}\n最近活动 ${health.activityRecent} 条。`,
  };
}

/** 复盘 Markdown 导出（纯函数）：健康摘要 + 里程碑 + 风险 + 笔记 */
export function buildRetroMarkdown(input: {
  project: ProjectDetail;
  health: HealthStats;
  rules: RiskRule[];
  retro: Omit<Retrospective, 'projectId' | 'updatedAt'> | null;
  tasks: TaskItem[];
}): string {
  const { project, health, rules, retro, tasks } = input;
  const doneTasks = tasks.filter((t) => t.status === 'done');
  const lines: string[] = [];
  lines.push(`# 复盘 · ${project.name}`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toISOString().slice(0, 16).replace('T', ' ')}（本地）`);
  lines.push('');
  lines.push('## 健康摘要');
  lines.push('');
  lines.push(
    `- 完成率：**${health.completionRate}%**（${health.milestones.done}/${health.milestones.total} 里程碑完成）`,
  );
  lines.push(`- 逾期任务：${health.overdueCount} 个（逾期率 ${health.overdueRate}%）`);
  lines.push(`- 受阻任务：${health.blockedCount} 个`);
  lines.push(`- 累计专注：${formatHoursShort(health.focusMinutes)}`);
  lines.push(`- 最近活动：${health.activityRecent} 条（7 天）`);
  lines.push('');
  lines.push('## 风险');
  lines.push('');
  if (rules.length) {
    for (const r of rules) {
      lines.push(`- **[${r.level === 'danger' ? '严重' : '提示'}] ${r.label}**：${r.detail}`);
    }
  } else {
    lines.push('- 暂无异常，项目按计划推进。');
  }
  lines.push('');
  lines.push('## 本期完成');
  lines.push('');
  if (doneTasks.length) {
    for (const t of doneTasks.slice(0, 20)) {
      lines.push(`- [x] ${t.title}${t.dod ? `（DoD：${t.dod}）` : ''}`);
    }
    if (doneTasks.length > 20) lines.push(`- …共 ${doneTasks.length} 个完成任务`);
  } else {
    lines.push('（本期暂无完成任务）');
  }
  lines.push('');
  lines.push('## 里程碑');
  lines.push('');
  for (const m of health.milestoneDetails) {
    const state =
      m.status === 'done' ? '✅' : m.risk === 'overdue' ? '⚠️' : m.risk === 'at-risk' ? '🔶' : '▫️';
    lines.push(`- ${state} ${m.title} — 进度 ${m.progress}%（${m.dueDate ?? '未定截止'}）`);
  }
  if (!health.milestoneDetails.length) lines.push('（暂无里程碑）');
  lines.push('');
  lines.push('## 复盘笔记');
  lines.push('');
  const retroSections: [keyof Omit<Retrospective, 'projectId' | 'updatedAt'>, string][] = [
    ['done', '本期完成'],
    ['blockers', '阻塞问题'],
    ['next', '下期计划'],
    ['lessons', '经验记录'],
  ];
  if (retro) {
    for (const [key, label] of retroSections) {
      lines.push(`### ${label}`);
      lines.push('');
      lines.push(retro[key] || '—');
      lines.push('');
    }
  } else {
    lines.push('（尚未撰写复盘笔记）');
  }
  return lines.join('\n');
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
