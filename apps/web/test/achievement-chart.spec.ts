import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHART_PALETTE,
  buildMonthlyOption,
  resolveChartPalette,
} from '@/features/achievements/chart';
import type { MonthPoint } from '@/features/achievements/stats';

const POINTS: MonthPoint[] = [
  { key: '2026-06', label: '6月', count: 1 },
  { key: '2026-07', label: '7月', count: 3 },
  { key: '2026-08', label: '8月', count: 2 },
];

describe('achievement chart（主题色与 option 构建）', () => {
  it('resolveChartPalette：缺失变量回退默认值', () => {
    expect(resolveChartPalette({})).toEqual(DEFAULT_CHART_PALETTE);
    expect(resolveChartPalette({ '--color-brand-500': ' #123456 ' }).brand).toBe('#123456');
  });

  it('主题切换：不同调色板产出不同颜色，组件据此更新图表', () => {
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

    const lightOption = buildMonthlyOption(POINTS, light);
    const darkOption = buildMonthlyOption(POINTS, dark);

    const seriesLight = lightOption.series as { itemStyle: { color: string } }[];
    const seriesDark = darkOption.series as { itemStyle: { color: string } }[];
    expect(seriesLight[0]!.itemStyle.color).toBe('#6366f1');
    expect(seriesDark[0]!.itemStyle.color).toBe('#818cf8');
    expect(seriesLight[0]!.itemStyle.color).not.toBe(seriesDark[0]!.itemStyle.color);
  });

  it('buildMonthlyOption：数据与坐标映射正确，空数据仍可用', () => {
    const option = buildMonthlyOption(POINTS, DEFAULT_CHART_PALETTE) as {
      xAxis: { data: string[] };
      series: { data: number[] }[];
    };
    expect(option.xAxis.data).toEqual(['6月', '7月', '8月']);
    expect(option.series[0]!.data).toEqual([1, 3, 2]);

    const empty = buildMonthlyOption([], DEFAULT_CHART_PALETTE) as {
      xAxis: { data: string[] };
      series: { data: number[] }[];
    };
    expect(empty.xAxis.data).toEqual([]);
    expect(empty.series[0]!.data).toEqual([]);
  });
});
