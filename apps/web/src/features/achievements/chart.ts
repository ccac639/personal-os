/**
 * 图表相关纯函数：主题色解析 + ECharts option 构建。
 *
 * 组件只负责「读取 CSS 变量 → 传入 palette」与渲染，
 * 便于在 jsdom 下对配色与数据映射做单元测试。
 */
import type { EChartsCoreOption } from 'echarts/core';
import type { MonthPoint } from './stats';

/** 图表调色板（从 CSS 变量解析，随主题切换变化） */
export interface ChartPalette {
  /** 柱体 / 强调色（--color-brand-500） */
  brand: string;
  /** 坐标轴线（--color-surface-100） */
  axis: string;
  /** 坐标轴文字（--color-surface-800） */
  text: string;
}

export const DEFAULT_CHART_PALETTE: ChartPalette = {
  brand: '#6366f1',
  axis: '#e2e8f0',
  text: '#475569',
};

/** 从 CSS 变量映射解析调色板（缺失时回退默认值，暗/亮主题均可工作） */
export function resolveChartPalette(vars: Record<string, string>): ChartPalette {
  return {
    brand: vars['--color-brand-500']?.trim() || DEFAULT_CHART_PALETTE.brand,
    axis: vars['--color-surface-100']?.trim() || DEFAULT_CHART_PALETTE.axis,
    text: vars['--color-surface-800']?.trim() || DEFAULT_CHART_PALETTE.text,
  };
}

/** 月度趋势柱状图 option */
export function buildMonthlyOption(points: MonthPoint[], palette: ChartPalette): EChartsCoreOption {
  return {
    grid: { left: 34, right: 12, top: 18, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: points.map((p) => p.label),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.text, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: palette.axis, type: 'dashed' } },
      axisLabel: { color: palette.text, fontSize: 11 },
    },
    series: [
      {
        name: '成果数',
        type: 'bar',
        data: points.map((p) => p.count),
        barMaxWidth: 22,
        itemStyle: { color: palette.brand, borderRadius: [4, 4, 0, 0] },
      },
    ],
  };
}

/** 年度回顾逐月柱状图 option（固定 1-12 月，无数据月份补 0） */
export function buildAnnualOption(
  monthly: { month: number; count: number }[],
  palette: ChartPalette,
): EChartsCoreOption {
  return {
    grid: { left: 34, right: 12, top: 18, bottom: 26 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      borderWidth: 0,
      textStyle: { color: '#fff', fontSize: 12 },
    },
    xAxis: {
      type: 'category',
      data: monthly.map((m) => `${m.month}月`),
      axisTick: { show: false },
      axisLine: { lineStyle: { color: palette.axis } },
      axisLabel: { color: palette.text, fontSize: 11 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: palette.axis, type: 'dashed' } },
      axisLabel: { color: palette.text, fontSize: 11 },
    },
    series: [
      {
        name: '完成数',
        type: 'bar',
        data: monthly.map((m) => m.count),
        barMaxWidth: 16,
        itemStyle: { color: palette.brand, borderRadius: [3, 3, 0, 0] },
      },
    ],
  };
}
