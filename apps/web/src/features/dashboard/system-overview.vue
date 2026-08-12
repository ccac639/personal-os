<script setup lang="ts">
import { computed, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';

/** 视图切换：平均延迟 / 峰值延迟 */
const view = ref<'avg' | 'peak'>('avg');

/** 延迟样本（ms，模拟数据；后续接 API 实时数据） */
const latencySamples: Record<'avg' | 'peak', number[]> = {
  avg: [12, 14, 11, 15, 13, 12, 10],
  peak: [28, 35, 24, 40, 31, 27, 22],
};

const SPARK_W = 96;
const SPARK_H = 28;

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

const points = computed(() => sparkPoints(latencySamples[view.value]));
const lastPoint = computed(() => points.value.split(' ').at(-1)?.split(','));
const currentLatency = computed(() =>
  view.value === 'avg' ? latencySamples.avg.at(-1) : latencySamples.peak.at(-1),
);
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <!-- 标题行：右上角切换按钮 -->
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">系统监控</h2>
      <button
        type="button"
        class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition"
        @click="view = view === 'avg' ? 'peak' : 'avg'"
      >
        <RefreshCw class="size-3.5" :class="view === 'peak' ? 'rotate-180' : ''" />
        {{ view === 'avg' ? '平均延迟' : '峰值延迟' }}
      </button>
    </div>

    <!-- 健康状态：左侧绿点 + 文字，右侧迷你延迟趋势线 -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="relative flex size-2.5 shrink-0">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-60"
          />
          <span class="relative inline-flex size-2.5 rounded-full bg-green-500" />
        </span>
        <div class="min-w-0">
          <p class="text-surface-900 truncate text-sm font-medium">全部服务正常</p>
          <p class="text-surface-800/50 truncate text-xs">4/4 在线 · 当前 {{ currentLatency }}ms</p>
        </div>
      </div>

      <!-- 迷你延迟趋势线 -->
      <svg
        :width="SPARK_W"
        :height="SPARK_H"
        viewBox="0 0 96 28"
        class="text-brand-600 shrink-0 overflow-visible"
        fill="none"
      >
        <polyline
          :points="points"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle :cx="lastPoint?.[0]" :cy="lastPoint?.[1]" r="2.6" fill="currentColor" />
      </svg>
    </div>
  </section>
</template>
