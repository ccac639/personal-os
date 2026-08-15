<script setup lang="ts">
/**
 * 全局错误边界 —— 捕获子树渲染错误，单点故障不白屏。
 *
 * - onErrorCaptured 捕获渲染 / 生命周期错误（不含事件处理器与异步回调，Vue 语义）；
 * - 降级 UI：错误提示 + 重试（emit retry，父级 key bump 重建子树）；
 * - 错误不向上冒泡（返回 false）：本边界兜底，避免连锁白屏；
 * - 日志：console.error 带边界名（前端无 pino，保持零依赖，见 AGENTS 测试/健壮性约定）。
 */
import { AlertTriangle, RotateCcw } from '@lucide/vue';
import { onErrorCaptured, ref } from 'vue';

const props = defineProps<{
  /** 边界标识（日志区分，如 app / route） */
  name?: string;
}>();

const emit = defineEmits<{ retry: [] }>();

const error = ref<Error | null>(null);

onErrorCaptured((err, _instance, info) => {
  const e = err instanceof Error ? err : new Error(String(err));
  error.value = e;
  // 前端无 pino：console.error 结构化前缀，04-worker 侧可对齐关联 ID 约定
  console.error(`[AppErrorBoundary:${props.name ?? 'unknown'}]`, e, info);
  return false; // 本边界兜底：不向上冒泡
});

function retry(): void {
  error.value = null;
  emit('retry');
}
</script>

<template>
  <slot v-if="!error" />
  <div
    v-else
    role="alert"
    class="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-8 text-center"
  >
    <AlertTriangle class="size-8 text-red-500" aria-hidden="true" />
    <p class="text-surface-900 text-base font-semibold">页面渲染出错</p>
    <p class="text-surface-800/70 max-w-md text-sm">{{ error.message }}</p>
    <button
      type="button"
      class="focus-visible:ring-brand-500/40 mt-1 inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white focus-visible:ring-2 focus-visible:outline-none"
      @click="retry"
    >
      <RotateCcw class="size-4" aria-hidden="true" />
      重试
    </button>
  </div>
</template>
