import type { DashboardSummary } from './types';

/**
 * 效率摘要统计输入。
 * 所有字段可选：缺省表示「无数据」，统计结果 value 保持 undefined，
 * 由组件显示「暂无数据」，绝不伪造 0。
 */
export interface WorkStatsInput {
  /** 今日完成数 */
  completedToday?: number;
  /** 本周完成数 */
  completedThisWeek?: number;
  /** 逾期事项数 */
  overdue?: number;
  /** 阻塞事项数 */
  blocked?: number;
  /** 平均完成时间（分钟） */
  avgCompletionMinutes?: number;
  /** 专注时长（分钟） */
  focusMinutes?: number;
  /* ---- 上一周期对比值（用于趋势方向） ---- */
  prevCompletedToday?: number;
  prevCompletedThisWeek?: number;
  prevOverdue?: number;
  prevBlocked?: number;
  prevAvgCompletionMinutes?: number;
  prevFocusMinutes?: number;
}

export type TrendDirection = 'up' | 'down' | 'neutral';

/** 数值对比 → 趋势方向（无历史数据时持平） */
export function directionFor(
  current: number | undefined,
  previous: number | undefined,
  /** 该指标是「越大越好」还是「越小越好」（越小越好的指标下降 = up） */
  biggerIsBetter = true,
): TrendDirection {
  if (current === undefined || previous === undefined || current === previous) {
    return 'neutral';
  }
  const improving = biggerIsBetter ? current > previous : current < previous;
  return improving ? 'up' : 'down';
}

/** 趋势展示文案 */
export function trendLabel(current: number | undefined, previous: number | undefined): string {
  if (current === undefined || previous === undefined || current === previous) {
    return '持平';
  }
  const diff = current - previous;
  const pct = previous === 0 ? 100 : Math.round((Math.abs(diff) / previous) * 100);
  return diff > 0 ? `+${pct}%` : `-${pct}%`;
}

/**
 * 由统计输入计算效率摘要条目（纯函数，无副作用）。
 * - 输入缺省 → value 缺省（组件显示「暂无数据」）
 * - 有数据 → value 为格式化字符串 + 趋势方向
 */
export function computeWorkSummary(input: WorkStatsInput): DashboardSummary[] {
  const {
    completedToday,
    completedThisWeek,
    overdue,
    blocked,
    avgCompletionMinutes,
    focusMinutes,
    prevCompletedToday,
    prevCompletedThisWeek,
    prevOverdue,
    prevBlocked,
    prevAvgCompletionMinutes,
    prevFocusMinutes,
  } = input;

  const minutesText = (m: number | undefined) =>
    m === undefined ? undefined : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

  return [
    {
      id: 'completed-today',
      label: '今日完成',
      value: completedToday === undefined ? undefined : `${completedToday} 项`,
      trend: {
        direction: directionFor(completedToday, prevCompletedToday, true),
        value: trendLabel(completedToday, prevCompletedToday),
      },
      description: '今天完成的任务与工作流',
    },
    {
      id: 'completed-week',
      label: '本周完成',
      value: completedThisWeek === undefined ? undefined : `${completedThisWeek} 项`,
      trend: {
        direction: directionFor(completedThisWeek, prevCompletedThisWeek, true),
        value: trendLabel(completedThisWeek, prevCompletedThisWeek),
      },
      description: '本周累计完成',
    },
    {
      id: 'overdue',
      label: '逾期事项',
      value: overdue === undefined ? undefined : `${overdue} 项`,
      trend: {
        direction: directionFor(overdue, prevOverdue, false),
        value: trendLabel(overdue, prevOverdue),
      },
      description: '超过截止时间的待办',
    },
    {
      id: 'blocked',
      label: '阻塞事项',
      value: blocked === undefined ? undefined : `${blocked} 项`,
      trend: {
        direction: directionFor(blocked, prevBlocked, false),
        value: trendLabel(blocked, prevBlocked),
      },
      description: '等待外部条件解除',
    },
    {
      id: 'avg-completion',
      label: '平均完成时间',
      value: avgCompletionMinutes === undefined ? undefined : minutesText(avgCompletionMinutes),
      trend: {
        direction: directionFor(avgCompletionMinutes, prevAvgCompletionMinutes, false),
        value: trendLabel(avgCompletionMinutes, prevAvgCompletionMinutes),
      },
      description: '任务平均耗时',
    },
    {
      id: 'focus',
      label: '专注时长',
      value: focusMinutes === undefined ? undefined : minutesText(focusMinutes),
      trend: {
        direction: directionFor(focusMinutes, prevFocusMinutes, true),
        value: trendLabel(focusMinutes, prevFocusMinutes),
      },
      description: '今日深度工作累计',
    },
  ];
}
