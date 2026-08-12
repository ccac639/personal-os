<script setup lang="ts">
import { computed } from 'vue';
import { TrendingDown, TrendingUp, Minus } from '@lucide/vue';
import { HOME_METRICS, METRIC_ICONS } from './mock';
import type { HomeMetric } from './types';

interface Props {
  /** all: 全部 | left: 左侧 3 张 | right: 右侧 1 张 */
  variant?: 'all' | 'left' | 'right';
  /** 外部数据覆盖（测试 / 后续接 API） */
  metrics?: HomeMetric[];
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'all',
  metrics: undefined,
});

const allStats = computed(() => props.metrics ?? HOME_METRICS);

const stats = computed(() => {
  if (props.variant === 'left') return allStats.value.slice(0, 3);
  if (props.variant === 'right') return allStats.value.slice(3);
  return allStats.value;
});

const gridCols = computed(() => {
  if (props.variant === 'left') return 'grid-cols-1 md:grid-cols-3';
  if (props.variant === 'right') return 'grid-cols-1';
  return 'grid-cols-2 md:grid-cols-4';
});

/** 迷你趋势图：纯 SVG 折线，跟随主题色；数据不足时返回空字符串 */
const SPARK_W = 72;
const SPARK_H = 26;

function sparkPoints(data: number[] | undefined): string {
  if (!data || data.length < 2) return '';
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * (SPARK_W - 4) + 2;
      const y = SPARK_H - 3 - ((v - min) / range) * (SPARK_H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function trendIcon(direction: 'up' | 'down' | 'neutral') {
  return direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
}

function trendColor(direction: string) {
  if (direction === 'up') return 'text-green-600';
  if (direction === 'down') return 'text-red-600';
  return 'text-surface-800/50';
}

function metricIcon(name: string) {
  return METRIC_ICONS[name] ?? METRIC_ICONS.Layers;
}
</script>

<template>
  <section :class="['grid gap-4', gridCols]">
    <article
      v-for="stat in stats"
      :key="stat.id"
      class="border-surface-100 bg-surface-0 hover:border-surface-800/30 group rounded-lg border p-5 transition hover:shadow-sm focus-within:ring-brand-500/30 focus-within:ring-2"
    >
      <div class="flex items-start justify-between">
        <div class="min-w-0">
          <p class="text-surface-800/60 text-sm">{{ stat.label }}</p>
          <p class="text-surface-900 mt-1 text-3xl font-semibold tabular-nums">{{ stat.value }}</p>
          <p v-if="stat.description" class="text-surface-800/40 mt-0.5 truncate text-xs">
            {{ stat.description }}
          </p>

          <!-- 趋势：有数据时显示方向 + 百分比；无数据显示占位，不伪造 0 -->
          <p
            v-if="stat.trend"
            class="mt-1.5 flex items-center gap-1 text-xs"
            :class="trendColor(stat.trend.direction)"
          >
            <component :is="trendIcon(stat.trend.direction)" class="size-3.5" />
            {{ stat.trend.value }}
            <span class="text-surface-800/40 font-normal">{{ stat.trend.label }}</span>
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <component
            :is="metricIcon(stat.icon)"
            class="text-surface-800/50 size-5 transition group-hover:scale-110"
          />
          <!-- sparkline：数据不足时显示"暂无趋势数据"，不画假折线 -->
          <svg
            v-if="sparkPoints(stat.points)"
            data-testid="sparkline"
            :width="SPARK_W"
            :height="SPARK_H"
            viewBox="0 0 72 26"
            class="text-brand-600 overflow-visible"
            fill="none"
          >
            <polyline
              :points="sparkPoints(stat.points)"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle
              :cx="sparkPoints(stat.points).split(' ').at(-1)?.split(',')[0]"
              :cy="sparkPoints(stat.points).split(' ').at(-1)?.split(',')[1]"
              r="2.2"
              fill="currentColor"
            />
          </svg>
          <span
            v-else
            class="text-surface-800/30 flex h-[26px] items-center text-[10px]"
            role="status"
          >
            暂无趋势数据
          </span>
        </div>
      </div>
    </article>
  </section>
</template>
