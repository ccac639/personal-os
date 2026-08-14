<script setup lang="ts">
/** 分页条：紧凑运维风格，上一页/下一页 + 页码信息 */
import { ChevronLeft, ChevronRight } from '@lucide/vue';

import { formatNumber } from '../format';

const props = withDefaults(
  defineProps<{
    page: number;
    pageSize: number;
    total: number;
    pages: number;
    loading?: boolean;
  }>(),
  { loading: false },
);

const emit = defineEmits<{ change: [page: number] }>();

function go(target: number): void {
  if (target < 1 || target > props.pages || target === props.page) return;
  emit('change', target);
}
</script>

<template>
  <div class="border-surface-100 flex items-center justify-between gap-2 border-t px-3 py-2">
    <span class="text-surface-800/50 text-[11px]">
      共 {{ formatNumber(total) }} 条 · 第 {{ page }} / {{ pages || 1 }} 页
    </span>
    <div class="flex items-center gap-1">
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 disabled:text-surface-800/30 flex items-center gap-0.5 rounded px-2 py-1 text-[11px] disabled:cursor-not-allowed"
        :disabled="page <= 1 || loading"
        @click="go(page - 1)"
      >
        <ChevronLeft class="size-3" aria-hidden="true" />
        上一页
      </button>
      <button
        type="button"
        class="text-surface-800/70 hover:bg-surface-100 disabled:text-surface-800/30 flex items-center gap-0.5 rounded px-2 py-1 text-[11px] disabled:cursor-not-allowed"
        :disabled="page >= pages || loading"
        @click="go(page + 1)"
      >
        下一页
        <ChevronRight class="size-3" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
