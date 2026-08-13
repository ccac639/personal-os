/**
 * 年度回顾统计（纯函数，便于测试）
 *
 * 统计口径：按完成日期（completedAt）归属年份。
 * 连续产出周期按「月」计算（连续有成果的月份），限定在年份内。
 */
import { ACHIEVEMENT_TYPES, TYPE_META } from './constants';
import type { Achievement, AchievementType } from './types';

/** 单月完成数（month: 1-12） */
export interface MonthCount {
  month: number;
  count: number;
}

/** 类型构成（当年口径） */
export interface TypeShare {
  type: AchievementType;
  label: string;
  count: number;
  ratio: number;
}

/** 连续产出周期（按月；length=0 表示无数据） */
export interface Streak {
  /** 连续产出月数 */
  length: number;
  /** 起始月 YYYY-MM（length=0 时为空串） */
  start: string;
  /** 结束月 YYYY-MM（length=0 时为空串） */
  end: string;
}

export interface AnnualReview {
  year: number;
  /** 当年完成总数 */
  total: number;
  /** 1-12 月逐月完成数（无数据月份补 0） */
  monthly: MonthCount[];
  /** 类型构成 */
  types: TypeShare[];
  /** 重点成果（置顶优先，其次最近完成，最多 5 条） */
  highlights: Achievement[];
  /** 最长连续产出月份段 */
  bestStreak: Streak;
  /** 截至年末的连续产出月份段 */
  currentStreak: Streak;
  /** 当年完成且当前置顶（收藏）的数量与占比（0-100） */
  pinnedCount: number;
  pinnedRatio: number;
  /** 当年完成且当前已归档的数量与占比（0-100） */
  archivedCount: number;
  archivedRatio: number;
  /** 与上一年对比：同口径「当年完成且置顶/归档」数量差（上一年无数据为 0） */
  vsPreviousYear: { pinned: number; archived: number };
}

function padMonth(m: number): string {
  return String(m).padStart(2, '0');
}

/** 年份内连续产出月（升序数组）的最长连续段 */
export function bestMonthStreak(months: number[], year: number): Streak {
  if (months.length === 0) return { length: 0, start: '', end: '' };
  let bestLen = 1;
  let bestStart = months[0]!;
  let bestEnd = months[0]!;
  let curLen = 1;
  let curStart = months[0]!;
  for (let i = 1; i < months.length; i += 1) {
    if (months[i]! === months[i - 1]! + 1) {
      curLen += 1;
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
        bestEnd = months[i]!;
      }
    } else {
      curLen = 1;
      curStart = months[i]!;
    }
  }
  return {
    length: bestLen,
    start: `${year}-${padMonth(bestStart)}`,
    end: `${year}-${padMonth(bestEnd)}`,
  };
}

/** 年份内连续产出月（升序数组）截至年末的连续段 */
export function currentMonthStreak(months: number[], year: number): Streak {
  if (months.length === 0) return { length: 0, start: '', end: '' };
  const end = months[months.length - 1]!;
  let len = 1;
  for (let i = months.length - 2; i >= 0; i -= 1) {
    if (months[i]! === months[i + 1]! - 1) len += 1;
    else break;
  }
  const start = months[months.length - len]!;
  return { length: len, start: `${year}-${padMonth(start)}`, end: `${year}-${padMonth(end)}` };
}

/** 某年完成且当前置顶/归档的计数（同口径，供跨年对比） */
function cohortPinnedArchived(
  list: Achievement[],
  year: number,
): { pinned: number; archived: number } {
  let pinned = 0;
  let archived = 0;
  for (const a of list) {
    if (Number(a.completedAt.slice(0, 4)) !== year) continue;
    if (a.pinned) pinned += 1;
    if (a.archived) archived += 1;
  }
  return { pinned, archived };
}

/** 年度回顾：完成趋势（逐月）/ 类型构成 / 重点成果 / 连续产出周期 / 收藏与归档变化 */
export function annualReview(list: Achievement[], year: number): AnnualReview {
  const inYear = list.filter((a) => Number(a.completedAt.slice(0, 4)) === year);
  const monthly: MonthCount[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    count: 0,
  }));
  for (const a of inYear) {
    const m = Number(a.completedAt.slice(5, 7));
    if (m >= 1 && m <= 12) monthly[m - 1]!.count += 1;
  }
  const total = inYear.length;
  const types: TypeShare[] = ACHIEVEMENT_TYPES.map((type) => {
    const count = inYear.filter((a) => a.type === type).length;
    return {
      type,
      label: TYPE_META[type].label,
      count,
      ratio: total > 0 ? Math.round((count / total) * 100) : 0,
    };
  });
  const highlights = [...inYear]
    .sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        b.completedAt.localeCompare(a.completedAt) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, 5);
  const monthsWith = monthly.filter((m) => m.count > 0).map((m) => m.month);
  const cohort = cohortPinnedArchived(list, year);
  const prev = cohortPinnedArchived(list, year - 1);
  return {
    year,
    total,
    monthly,
    types,
    highlights,
    bestStreak: bestMonthStreak(monthsWith, year),
    currentStreak: currentMonthStreak(monthsWith, year),
    pinnedCount: cohort.pinned,
    pinnedRatio: total > 0 ? Math.round((cohort.pinned / total) * 100) : 0,
    archivedCount: cohort.archived,
    archivedRatio: total > 0 ? Math.round((cohort.archived / total) * 100) : 0,
    vsPreviousYear: {
      pinned: cohort.pinned - prev.pinned,
      archived: cohort.archived - prev.archived,
    },
  };
}

/** 年度回顾的可访问文本摘要（不依赖图形表达数据） */
export function annualSummary(review: AnnualReview): string {
  const parts: string[] = [];
  parts.push(`${review.year} 年共完成 ${review.total} 项成果。`);
  const months = review.monthly.filter((m) => m.count > 0);
  if (months.length > 0) {
    parts.push(`各月完成数：${months.map((m) => `${m.month} 月 ${m.count} 项`).join('，')}。`);
  } else {
    parts.push('当年暂无月度数据。');
  }
  const types = review.types.filter((t) => t.count > 0);
  if (types.length > 0) {
    parts.push(
      `类型构成：${types.map((t) => `${t.label} ${t.count} 项（${t.ratio}%）`).join('，')}。`,
    );
  }
  if (review.bestStreak.length > 0) {
    parts.push(
      `最长连续产出 ${review.bestStreak.length} 个月（${review.bestStreak.start} 至 ${review.bestStreak.end}）。`,
    );
  }
  if (review.total > 0) {
    parts.push(
      `收藏与归档：当年完成成果中置顶 ${review.pinnedCount} 项（${review.pinnedRatio}%）、已归档 ${review.archivedCount} 项（${review.archivedRatio}%）。`,
    );
    const vp = review.vsPreviousYear;
    if (vp.pinned !== 0 || vp.archived !== 0) {
      const delta = (n: number) => (n > 0 ? `+${n}` : `${n}`);
      parts.push(`与上一年相比：置顶 ${delta(vp.pinned)} 项、归档 ${delta(vp.archived)} 项。`);
    }
  }
  if (review.highlights.length > 0) {
    parts.push(`重点成果：${review.highlights.map((h) => h.title).join('、')}。`);
  }
  return parts.join('');
}
