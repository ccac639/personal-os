<script setup lang="ts">
/**
 * 开发态性能标记悬浮徽标（仅 DEV 构建渲染，生产零产物）。
 *
 * - 展示最近一次路由加载耗时 / 过渡耗时 / 长任务计数；
 * - 订阅（过渡耗时 watch、长任务 observer）随组件卸载清理；
 * - 纯内存态：不发送网络数据、不持久化任何内容。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

import { installLongTaskObserver, installPerfTrace, perfEnabled, perfState } from '@/app/perf';

const visible = ref(perfEnabled);
let stopTrace: (() => void) | undefined;
let stopObserver: (() => void) | undefined;

onMounted(() => {
  if (!perfEnabled) return;
  stopTrace = installPerfTrace();
  stopObserver = installLongTaskObserver();
});

onBeforeUnmount(() => {
  stopTrace?.();
  stopTrace = undefined;
  stopObserver?.();
  stopObserver = undefined;
});
</script>

<template>
  <div v-if="visible" class="app-perf-badge" role="status" aria-label="开发性能标记">
    <span class="app-perf-badge__item">路由 {{ perfState.latestRouteMs ?? '–' }}ms</span>
    <span class="app-perf-badge__item">转场 {{ perfState.latestTransitionMs ?? '–' }}ms</span>
    <span v-if="perfState.longTasks > 0" class="app-perf-badge__item app-perf-badge__item--warn">
      长任务 ×{{ perfState.longTasks }}
    </span>
  </div>
</template>

<style scoped>
.app-perf-badge {
  position: fixed;
  right: 0.75rem;
  bottom: 0.75rem;
  z-index: 40;
  display: flex;
  gap: 0.5rem;
  padding: 4px 10px;
  border: 1px solid var(--app-border, #f1f5f9);
  border-radius: 9999px;
  background: var(--app-surface, #ffffff);
  box-shadow: var(--app-shadow-card, 0 1px 3px 0 rgb(0 0 0 / 0.08));
  color: var(--app-text-secondary, #1e293b);
  font-size: 11px;
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.app-perf-badge__item--warn {
  color: var(--color-amber-600, #d97706);
  font-weight: 600;
}
</style>
