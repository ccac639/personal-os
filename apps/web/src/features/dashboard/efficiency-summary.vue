<script setup lang="ts">
import { computed } from 'vue';
import { Minus, TrendingDown, TrendingUp } from '@lucide/vue';
import { WORK_STATS_INPUT } from './mock';
import { computeWorkSummary } from './summary';
import type { DashboardSummary } from './types';
import type { WorkStatsInput } from './summary';

interface Props {
  /** 统计输入覆盖（测试注入；未传则用统一 mock 源） */
  input?: WorkStatsInput;
}

const props = withDefaults(defineProps<Props>(), {
  input: undefined,
});

const items = computed<DashboardSummary[]>(() => computeWorkSummary(props.input ?? WORK_STATS_INPUT));

const hasData = computed(() => items.value.some((item) => item.value !== undefined));

function trendIcon(direction: 'up' | 'down' | 'neutral') {
  return direction === 'up' ? TrendingUp : direction === 'down' ? TrendingDown : Minus;
}

function trendCls(direction: 'up' | 'down' | 'neutral') {
  if (direction === 'up') return 'text-green-600';
  if (direction === 'down') return 'text-orange-600';
  return 'text-surface-800/50';
}
</script>

<template>
  <section
    class="border-surface-100 bg-surface-0 rounded-lg border p-5"
    aria-label="工作效率摘要"
  >
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-base font-semibold">效率摘要</h2>
      <span v-if="hasData" class="text-surface-800/50 text-xs">今日</span>
    </div>

    <!-- 全空态：不伪造 0 -->
    <div
      v-if="!hasData"
      class="flex h-24 items-center justify-center text-sm text-surface-800/50"
    >
      暂无数据
    </div>

    <!-- 数据网格：窄屏 1 列，宽屏 2 列 -->
    <div v-else class="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="border-surface-100 rounded-lg border p-3"
      >
        <p class="text-surface-800/60 text-xs">{{ item.label }}</p>
        <div class="mt-1 flex items-baseline gap-1.5">
          <p
            v-if="item.value"
            class="text-surface-900 text-lg font-semibold tabular-nums"
            data-testid="summary-value"
          >
            {{ item.value }}
          </p>
          <p v-else class="text-surface-800/50 text-sm">暂无数据</p>
          <span
            v-if="item.trend && item.value"
            class="flex items-center gap-0.5 text-xs"
            :class="trendCls(item.trend.direction)"
            :title="`趋势：${item.trend.value}`"
          >
            <component :is="trendIcon(item.trend.direction)" class="size-3.5" />
            {{ item.trend.value }}
          </span>
        </div>
        <p v-if="item.description" class="text-surface-800/40 mt-0.5 truncate text-[11px]">
          {{ item.description }}
        </p>
      </div>
    </div>
  </section>
</template>
