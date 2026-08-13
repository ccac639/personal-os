import { ACHIEVEMENT_TYPES, TYPE_META } from './constants';
import type { Achievement, AchievementType } from './types';

/** 概览统计 */
export interface OverviewStats {
  total: number;
  active: number;
  archived: number;
  pinned: number;
  /** 今年完成数 */
  thisYear: number;
  /** 独立标签数 */
  tagCount: number;
}

/** 类型分布统计 */
export interface TypeCount {
  type: AchievementType;
  label: string;
  count: number;
  ratio: number;
}

/** 月度统计点（key: YYYY-MM） */
export interface MonthPoint {
  key: string;
  label: string;
  count: number;
}

function monthKey(a: Achievement): string {
  return a.completedAt.slice(0, 7);
}

function monthLabel(key: string): string {
  const [, m] = key.split('-');
  return `${Number(m)}月`;
}

/** 概览统计（基于全部成果，不含归档过滤） */
export function overviewStats(list: Achievement[]): OverviewStats {
  const now = new Date();
  const thisYear = now.getFullYear();
  return {
    total: list.length,
    active: list.filter((a) => !a.archived).length,
    archived: list.filter((a) => a.archived).length,
    pinned: list.filter((a) => a.pinned).length,
    thisYear: list.filter((a) => Number(a.completedAt.slice(0, 4)) === thisYear).length,
    tagCount: new Set(list.flatMap((a) => a.tags)).size,
  };
}

/** 类型分布（按类型分组计数，带占比） */
export function typeDistribution(list: Achievement[]): TypeCount[] {
  const total = list.length || 1;
  return ACHIEVEMENT_TYPES.map((type) => {
    const count = list.filter((a) => a.type === type).length;
    return {
      type,
      label: TYPE_META[type].label,
      count,
      ratio: Math.round((count / total) * 100),
    };
  });
}

/**
 * 月度完成数序列：按月聚合（升序），取最近 maxMonths 个月。
 * 纯函数，便于测试。
 */
export function monthlySeries(list: Achievement[], maxMonths = 24): MonthPoint[] {
  const counts = new Map<string, number>();
  for (const a of list) {
    const key = monthKey(a);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...counts.keys()].sort();
  const window = keys.slice(-maxMonths);
  return window.map((key) => ({
    key,
    label: monthLabel(key),
    count: counts.get(key) ?? 0,
  }));
}
