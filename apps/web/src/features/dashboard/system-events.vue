<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  RefreshCw,
  XCircle,
} from '@lucide/vue';
import { SYSTEM_EVENTS } from './mock';
import type { SystemEvent, SystemEventType } from './types';

interface Props {
  /** 外部数据覆盖（测试注入；未传则用统一 mock 源） */
  events?: SystemEvent[];
  /** 模拟加载失败（测试注入；展示错误态 + 重试） */
  simulateFailure?: boolean;
  /** 展示上限（超出后内部滚动） */
  max?: number;
}

const props = withDefaults(defineProps<Props>(), {
  events: undefined,
  simulateFailure: false,
  max: 5,
});

type LoadState = 'ready' | 'error';
const state = ref<LoadState>('ready');
let failedOnce = false;

/** 时间倒序（timestamp 越大越新）；排序是纯逻辑，可单测 */
function sortByTimeDesc(list: SystemEvent[]): SystemEvent[] {
  return [...list].sort((a, b) => b.timestamp - a.timestamp);
}

const events = computed(() => sortByTimeDesc(props.events ?? SYSTEM_EVENTS).slice(0, props.max));

function retry() {
  state.value = 'ready';
  failedOnce = false;
}

onMounted(() => {
  if (props.simulateFailure && !failedOnce) {
    failedOnce = true;
    state.value = 'error';
  }
});

onBeforeUnmount(() => {
  /* 无 timer / 监听器，无需清理 */
});

/** 事件展示配置：图标 + 文案 + 颜色（状态不只靠颜色表达） */
const TYPE_CONFIG: Record<SystemEventType, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  'service-up': { label: '服务上线', icon: ArrowUpCircle, cls: 'text-green-600 bg-green-500/10' },
  'service-down': { label: '服务下线', icon: ArrowDownCircle, cls: 'text-red-600 bg-red-500/10' },
  'workflow-success': { label: '工作流完成', icon: CheckCircle2, cls: 'text-green-600 bg-green-500/10' },
  'workflow-failed': { label: '工作流失败', icon: XCircle, cls: 'text-red-600 bg-red-500/10' },
  sync: { label: '数据同步', icon: RefreshCw, cls: 'text-brand-600 bg-brand-500/10' },
  error: { label: '错误', icon: AlertTriangle, cls: 'text-orange-600 bg-orange-500/10' },
};
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5" aria-label="系统事件">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 text-base font-semibold">系统事件</h2>
      <span class="text-surface-800/50 text-xs">{{ events.length }} 条</span>
    </div>

    <!-- 错误态：局部重试，不影响其他模块 -->
    <div v-if="state === 'error'" class="flex h-28 flex-col items-center justify-center gap-2 text-sm">
      <AlertTriangle class="size-6 text-orange-600" />
      <p class="text-surface-800/70">事件数据加载失败</p>
      <button
        type="button"
        class="border-surface-100 text-surface-800/70 hover:border-surface-800/30 hover:bg-surface-50 focus-visible:ring-brand-500/40 rounded-md border px-2.5 py-1 text-xs transition focus-visible:ring-2 focus-visible:outline-none"
        @click="retry"
      >
        重试
      </button>
    </div>

    <!-- 空态 -->
    <div v-else-if="events.length === 0" class="flex h-28 items-center justify-center text-sm text-surface-800/50">
      暂无系统事件
    </div>

    <!-- 时间线：倒序 + 内部滚动 -->
    <ul v-else class="max-h-56 space-y-2 overflow-y-auto pr-1" role="list">
      <li
        v-for="ev in events"
        :key="ev.id"
        class="border-surface-100 flex items-start gap-2.5 rounded-lg border p-2.5"
      >
        <span
          class="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md"
          :class="TYPE_CONFIG[ev.type].cls"
        >
          <component :is="TYPE_CONFIG[ev.type].icon" class="size-4" :aria-hidden="true" />
        </span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2">
            <p class="text-surface-900 truncate text-sm font-medium">
              {{ ev.title }}
              <span class="text-surface-800/50 ml-1 text-[11px] font-normal">{{ TYPE_CONFIG[ev.type].label }}</span>
            </p>
            <span class="text-surface-800/40 shrink-0 text-[11px]">{{ ev.time }}</span>
          </div>
          <p class="text-surface-800/60 line-clamp-2 text-xs">{{ ev.description }}</p>
        </div>
      </li>
    </ul>
  </section>
</template>
