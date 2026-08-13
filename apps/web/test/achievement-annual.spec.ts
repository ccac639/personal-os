import { describe, expect, it } from 'vitest';
import {
  annualReview,
  annualSummary,
  bestMonthStreak,
  currentMonthStreak,
} from '@/features/achievements/annual';
import {
  DEFAULT_CHART_PALETTE,
  buildAnnualOption,
  resolveChartPalette,
} from '@/features/achievements/chart';
import type { Achievement } from '@/features/achievements/types';

function make(partial: Partial<Achievement> & { id: string; completedAt: string }): Achievement {
  return {
    type: 'project',
    title: '成果',
    summary: '',
    description: '',
    tags: [],
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('achievement annual（连续产出周期纯函数）', () => {
  it('bestMonthStreak：无数据返回空；连续段正确识别', () => {
    expect(bestMonthStreak([], 2026)).toEqual({ length: 0, start: '', end: '' });
    expect(bestMonthStreak([3], 2026)).toEqual({ length: 1, start: '2026-03', end: '2026-03' });
    // 2-4 连续 3 个月 + 7-8 连续 2 个月 → 最长 3
    expect(bestMonthStreak([2, 3, 4, 7, 8], 2026)).toEqual({
      length: 3,
      start: '2026-02',
      end: '2026-04',
    });
    // 乱序输入按连续语义处理（调用方保证升序，这里验证升序输入）
    expect(bestMonthStreak([1, 2, 3, 5, 6], 2026)).toEqual({
      length: 3,
      start: '2026-01',
      end: '2026-03',
    });
  });

  it('currentMonthStreak：截至年末的连续段', () => {
    expect(currentMonthStreak([], 2026)).toEqual({ length: 0, start: '', end: '' });
    expect(currentMonthStreak([4, 5, 6], 2026)).toEqual({
      length: 3,
      start: '2026-04',
      end: '2026-06',
    });
    // 末尾断开：5,6,9 → 截至年末连续段为 1（9 月）
    expect(currentMonthStreak([5, 6, 9], 2026)).toEqual({
      length: 1,
      start: '2026-09',
      end: '2026-09',
    });
  });
});

describe('achievement annual（年度回顾聚合）', () => {
  const ITEMS: Achievement[] = [
    make({ id: 'y1', completedAt: '2026-01-10', type: 'article' }),
    make({ id: 'y2', completedAt: '2026-01-25', type: 'project' }),
    make({ id: 'y3', completedAt: '2026-02-05', type: 'project' }),
    make({ id: 'y4', completedAt: '2026-03-12', type: 'milestone', pinned: true }),
    make({ id: 'y5', completedAt: '2026-05-20', type: 'code' }),
    make({ id: 'y6', completedAt: '2025-12-30', type: 'project' }), // 上一年
  ];

  it('年度口径：只统计当年；逐月补零；总数正确', () => {
    const review = annualReview(ITEMS, 2026);
    expect(review.year).toBe(2026);
    expect(review.total).toBe(5);
    expect(review.monthly).toHaveLength(12);
    expect(review.monthly.map((m) => m.count)).toEqual([2, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    expect(review.monthly[0]!.month).toBe(1);
  });

  it('类型构成：当年口径 + 占比', () => {
    const review = annualReview(ITEMS, 2026);
    const project = review.types.find((t) => t.type === 'project')!;
    expect(project.count).toBe(2);
    expect(project.ratio).toBe(40);
    const article = review.types.find((t) => t.type === 'article')!;
    expect(article.count).toBe(1);
    expect(article.ratio).toBe(20);
  });

  it('重点成果：置顶优先，其次最近完成，最多 5 条', () => {
    const review = annualReview(ITEMS, 2026);
    expect(review.highlights[0]!.id).toBe('y4'); // 置顶
    expect(review.highlights).toHaveLength(5);
    expect(review.highlights.map((h) => h.id)).not.toContain('y6'); // 不含上一年
  });

  it('连续产出：2026-01/02/03 连续 3 个月为最长；年末段为 5 月', () => {
    const review = annualReview(ITEMS, 2026);
    expect(review.bestStreak).toEqual({ length: 3, start: '2026-01', end: '2026-03' });
    expect(review.currentStreak).toEqual({ length: 1, start: '2026-05', end: '2026-05' });
  });

  it('收藏与归档：当年完成且置顶/归档的计数与占比', () => {
    const review = annualReview(ITEMS, 2026);
    // y4 置顶（milestone）；无归档
    expect(review.pinnedCount).toBe(1);
    expect(review.pinnedRatio).toBe(20); // 1/5
    expect(review.archivedCount).toBe(0);
    expect(review.archivedRatio).toBe(0);
  });

  it('收藏与归档变化：与上一年同口径对比（跨年增量）', () => {
    const withArchive = [
      ...ITEMS,
      make({ id: 'y7', completedAt: '2026-04-02', type: 'code', archived: true }),
    ];
    const review = annualReview(withArchive, 2026);
    // 2025 年仅 y6（无置顶无归档）→ 置顶 +1、归档 +1
    expect(review.vsPreviousYear).toEqual({ pinned: 1, archived: 1 });

    // 上一年有数据时计算差值：2025 有 1 个置顶 → 2026 置顶 1 - 1 = 0
    const withPrevPinned = [
      ...withArchive,
      make({ id: 'y0', completedAt: '2025-06-01', type: 'project', pinned: true }),
    ];
    expect(annualReview(withPrevPinned, 2026).vsPreviousYear.pinned).toBe(0);
  });

  it('空年份：收藏与归档统计为零，对比无数据为 0', () => {
    const review = annualReview(ITEMS, 2024);
    expect(review.pinnedCount).toBe(0);
    expect(review.pinnedRatio).toBe(0);
    expect(review.archivedCount).toBe(0);
    expect(review.archivedRatio).toBe(0);
    expect(review.vsPreviousYear).toEqual({ pinned: 0, archived: 0 });
  });

  it('空年份：全零统计与空摘要安全', () => {
    const review = annualReview(ITEMS, 2024);
    expect(review.total).toBe(0);
    expect(review.monthly.every((m) => m.count === 0)).toBe(true);
    expect(review.highlights).toEqual([]);
    expect(review.bestStreak.length).toBe(0);
    expect(annualSummary(review)).toContain('2024 年共完成 0 项');
  });

  it('annualSummary：生成可访问文本摘要（趋势/构成/连续/重点）', () => {
    const text = annualSummary(annualReview(ITEMS, 2026));
    expect(text).toContain('2026 年共完成 5 项成果');
    expect(text).toContain('1 月 2 项');
    expect(text).toContain('项目发布 2 项（40%）');
    expect(text).toContain('最长连续产出 3 个月（2026-01 至 2026-03）');
    expect(text).toContain('重点成果：');
  });

  it('annualSummary：包含收藏与归档统计及跨年变化文本', () => {
    const withArchive = [
      ...ITEMS,
      make({ id: 'y7', completedAt: '2026-04-02', type: 'code', archived: true }),
    ];
    const text = annualSummary(annualReview(withArchive, 2026));
    expect(text).toContain('置顶 1 项（17%）');
    expect(text).toContain('已归档 1 项（17%）');
    expect(text).toContain('与上一年相比：置顶 +1 项、归档 +1 项');
  });
});

describe('achievement annual（年度图表与主题变化）', () => {
  it('buildAnnualOption：固定 1-12 月坐标，数据映射正确', () => {
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: i === 0 ? 2 : i === 4 ? 1 : 0,
    }));
    const option = buildAnnualOption(monthly, DEFAULT_CHART_PALETTE) as {
      xAxis: { data: string[] };
      series: { data: number[] }[];
    };
    expect(option.xAxis.data).toHaveLength(12);
    expect(option.xAxis.data[0]).toBe('1月');
    expect(option.xAxis.data[11]).toBe('12月');
    expect(option.series[0]!.data).toEqual([2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('主题切换：不同调色板产出不同柱色（暗色主题图表随之更新）', () => {
    const light = resolveChartPalette({
      '--color-brand-500': '#6366f1',
      '--color-surface-100': '#e2e8f0',
      '--color-surface-800': '#475569',
    });
    const dark = resolveChartPalette({
      '--color-brand-500': '#818cf8',
      '--color-surface-100': '#334155',
      '--color-surface-800': '#cbd5e1',
    });
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      count: i === 0 ? 1 : 0,
    }));
    const lightOption = buildAnnualOption(monthly, light) as {
      series: { itemStyle: { color: string } }[];
    };
    const darkOption = buildAnnualOption(monthly, dark) as {
      series: { itemStyle: { color: string } }[];
    };
    expect(lightOption.series[0]!.itemStyle.color).toBe('#6366f1');
    expect(darkOption.series[0]!.itemStyle.color).toBe('#818cf8');
    expect(lightOption.series[0]!.itemStyle.color).not.toBe(darkOption.series[0]!.itemStyle.color);
  });
});
