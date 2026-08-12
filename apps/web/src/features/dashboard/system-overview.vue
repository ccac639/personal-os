<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { RefreshCw } from '@lucide/vue';
import { SYSTEM_OVERVIEW } from './mock';

interface Props {
  /** 测试注入：延迟样本（空数组 = 无数据，不画折线） */
  samples?: number[];
  /** 测试注入：模拟刷新失败（true 时刷新后进入 error 态） */
  simulateFailure?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  samples: undefined,
  simulateFailure: false,
});

type LoadState = 'ready' | 'loading' | 'error';

const state = ref<LoadState>('ready');
const view = ref<'avg' | 'peak'>('avg');
let timer: ReturnType<typeof setTimeout> | null = null;
/** simulateFailure 仅对首次刷新生效（模拟瞬时故障，重试可恢复） */
let failedOnce = false;

/** 延迟样本（ms，mock 数据；后续接 API 实时数据） */
const latencySamples: Record<'avg' | 'peak', number[]> = {
  avg: props.samples ?? SYSTEM_OVERVIEW.latencySamples,
  peak: props.samples ? [...props.samples].map((v) => v * 2) : [28, 35, 24, 40, 31, 27, 22],
};

/** 刷新：模拟请求，期间 loading，完成后 ready（simulateFailure 首次进入 error，重试恢复） */
function refresh() {
  if (state.value === 'loading') return; // 不重复创建定时器
  state.value = 'loading';
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    if (props.simulateFailure && !failedOnce) {
      failedOnce = true;
      state.value = 'error';
      return;
    }
    state.value = 'ready';
  }, 400);
}

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

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
const currentLatency = computed(() => latencySamples[view.value].at(-1) ?? undefined);

/** 延迟分级：<100 正常绿 / <300 警告橙 / 其余或未知红 */
function latencyLevel(ms: number | undefined) {
  if (ms === undefined) return { text: '未知', cls: 'text-surface-800/50' };
  if (ms < 100) return { text: `${ms}ms`, cls: 'text-green-600' };
  if (ms < 300) return { text: `${ms}ms`, cls: 'text-orange-600' };
  return { text: `${ms}ms`, cls: 'text-red-600' };
}

/** 整体健康：按在线数/总数推断（有离线/降级时非全绿） */
const overallHealth = computed(() => {
  const offline = SYSTEM_OVERVIEW.offline + SYSTEM_OVERVIEW.unknown;
  if (offline === 0 && SYSTEM_OVERVIEW.degraded === 0) {
    return { text: '全部服务正常', cls: 'text-green-600', dot: 'bg-green-500' };
  }
  if (offline === 0) {
    return { text: '部分服务降级', cls: 'text-orange-600', dot: 'bg-orange-500' };
  }
  return { text: '部分服务离线', cls: 'text-red-600', dot: 'bg-red-500' };
});
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <!-- 标题行：右上角刷新按钮（loading 时旋转） -->
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">系统监控</h2>
      <div class="flex items-center gap-1.5">
        <button
          type="button"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          :disabled="state === 'loading'"
          @click="refresh"
        >
          <RefreshCw class="size-3.5" :class="{ 'animate-spin': state === 'loading' }" />
          {{ state === 'loading' ? '刷新中' : '刷新' }}
        </button>
      </div>
    </div>

    <!-- error：错误状态 + 重试 -->
    <div v-if="state === 'error'" class="flex flex-col items-center gap-2 py-6">
      <p class="text-red-600 text-sm font-medium">监控数据获取失败</p>
      <button
        type="button"
        class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md border px-2.5 py-1.5 text-xs transition focus-visible:ring-2 focus-visible:outline-none"
        @click="refresh"
      >
        重试
      </button>
    </div>

    <!-- ready / loading：健康状态 + 延迟趋势 -->
    <div v-else class="flex items-center justify-between gap-4">
      <div class="flex min-w-0 items-center gap-2.5">
        <span class="relative flex size-2.5 shrink-0">
          <span
            class="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            :class="overallHealth.dot"
          />
          <span class="relative inline-flex size-2.5 rounded-full" :class="overallHealth.dot" />
        </span>
        <div class="min-w-0">
          <p class="text-surface-900 truncate text-sm font-medium">{{ overallHealth.text }}</p>
          <p class="text-surface-800/50 truncate text-xs">
            {{ SYSTEM_OVERVIEW.online }}/{{ SYSTEM_OVERVIEW.total }} 在线 · 当前
            <span :class="latencyLevel(currentLatency).cls" class="font-medium">
              {{ latencyLevel(currentLatency).text }}
            </span>
          </p>
        </div>
      </div>

      <!-- 迷你延迟趋势线：无数据时不画假折线 -->
      <svg
        v-if="points"
        data-testid="latency-sparkline"
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
      <span v-else class="text-surface-800/30 flex h-[28px] shrink-0 items-center text-[10px]">
        暂无延迟数据
      </span>
    </div>
  </section>
</template>
