<script setup lang="ts">
import { computed } from 'vue';
import { Boxes, Code2, Layers, Server, TrendingDown, TrendingUp } from '@lucide/vue';
import type { StatCard } from './types';

interface Props {
  /** all: 全部 4 张 | left: 左侧 3 张（项目/技术栈/模块） | right: 右侧 1 张（服务） */
  variant?: 'all' | 'left' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'all',
});

const allStats: StatCard[] = [
  {
    id: 'projects',
    label: '开发中项目',
    value: 1,
    trend: { value: 12.5, isPositive: true },
    spark: [2, 3, 3, 4, 3, 5, 4],
    icon: Layers,
  },
  {
    id: 'tech',
    label: '技术栈',
    value: '47+',
    trend: { value: 8.3, isPositive: true },
    spark: [30, 34, 36, 39, 41, 44, 47],
    icon: Code2,
  },
  {
    id: 'modules',
    label: '模块数',
    value: 6,
    trend: { value: 20, isPositive: true },
    spark: [3, 4, 4, 5, 5, 5, 6],
    icon: Boxes,
  },
  {
    id: 'services',
    label: '活跃服务',
    value: '4/4',
    trend: { value: 0, isPositive: true },
    spark: [4, 4, 3, 4, 4, 4, 4],
    icon: Server,
  },
];

const stats = computed(() => {
  if (props.variant === 'left') return allStats.slice(0, 3);
  if (props.variant === 'right') return allStats.slice(3);
  return allStats;
});

const gridCols = computed(() => {
  if (props.variant === 'left') return 'grid-cols-1 md:grid-cols-3';
  if (props.variant === 'right') return 'grid-cols-1';
  return 'grid-cols-2 md:grid-cols-4';
});

/** 迷你趋势图：纯 SVG 折线，跟随主题色 */
const SPARK_W = 72;
const SPARK_H = 26;

function sparkPoints(data: number[]): string {
  if (data.length < 2) return '';
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
</script>

<template>
  <section :class="['grid gap-4', gridCols]">
    <article
      v-for="stat in stats"
      :key="stat.id"
      class="border-surface-100 bg-surface-0 hover:border-surface-800/30 group rounded-lg border p-5 transition hover:shadow-sm"
    >
      <div class="flex items-start justify-between">
        <div class="min-w-0">
          <p class="text-surface-800/60 text-sm">{{ stat.label }}</p>
          <p class="text-surface-900 mt-1 text-3xl font-semibold">{{ stat.value }}</p>

          <!-- 趋势 -->
          <p
            v-if="stat.trend && stat.trend.value !== 0"
            class="mt-1.5 flex items-center gap-1 text-xs"
            :class="stat.trend.isPositive ? 'text-green-600' : 'text-red-600'"
          >
            <component :is="stat.trend.isPositive ? TrendingUp : TrendingDown" class="size-3.5" />
            {{ stat.trend.value }}%
            <span class="text-surface-800/40 font-normal">较上周</span>
          </p>
        </div>
        <div class="flex flex-col items-end gap-2">
          <component
            :is="stat.icon"
            class="text-surface-800/50 size-5 transition group-hover:scale-110"
          />
          <!-- sparkline -->
          <svg
            v-if="stat.spark"
            :width="SPARK_W"
            :height="SPARK_H"
            viewBox="0 0 72 26"
            class="text-brand-600 overflow-visible"
            fill="none"
          >
            <polyline
              :points="sparkPoints(stat.spark)"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <circle
              :cx="sparkPoints(stat.spark).split(' ').at(-1)?.split(',')[0]"
              :cy="sparkPoints(stat.spark).split(' ').at(-1)?.split(',')[1]"
              r="2.2"
              fill="currentColor"
            />
          </svg>
        </div>
      </div>
    </article>
  </section>
</template>
