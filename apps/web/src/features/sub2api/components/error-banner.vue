<script setup lang="ts">
/** 错误横幅：保留 code / statusCode / requestId（排障线索），附重试按钮 */
import { AlertTriangle, RotateCw } from '@lucide/vue';

import { Sub2ApiError } from '@/services/sub2api';

const props = defineProps<{
  error: unknown;
  /** 自定义主文案（默认取错误 message） */
  message?: string;
  compact?: boolean;
}>();

defineEmits<{ retry: [] }>();

function formatError(err: unknown): {
  message: string;
  code: string;
  statusCode: string;
  requestId: string;
} {
  if (err instanceof Sub2ApiError) {
    return {
      message: err.message,
      code: err.code ?? '—',
      statusCode: err.statusCode !== undefined ? String(err.statusCode) : '—',
      requestId: err.requestId ?? '—',
    };
  }
  if (err instanceof Error) {
    return { message: err.message, code: '—', statusCode: '—', requestId: '—' };
  }
  return { message: '未知错误', code: '—', statusCode: '—', requestId: '—' };
}

const detail = formatError(props.error);
const shownMessage = props.message ?? detail.message;
</script>

<template>
  <div
    class="flex items-start gap-2 rounded border border-red-500/25 bg-red-500/5 px-3 py-2.5"
    role="alert"
  >
    <AlertTriangle class="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden="true" />
    <div class="min-w-0 flex-1">
      <p class="text-xs leading-5 text-red-700">{{ shownMessage }}</p>
      <p v-if="!compact" class="mt-0.5 font-mono text-[10px] leading-4 text-red-600/60">
        code={{ detail.code }} · status={{ detail.statusCode }} · requestId={{ detail.requestId }}
      </p>
    </div>
    <button
      type="button"
      class="flex shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[11px] text-red-700 hover:bg-red-500/10"
      @click="$emit('retry')"
    >
      <RotateCw class="size-3" aria-hidden="true" />
      重试
    </button>
  </div>
</template>
