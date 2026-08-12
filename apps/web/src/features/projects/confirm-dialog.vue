<script setup lang="ts">
import { AlertTriangle } from '@lucide/vue';

import ModalShell from './modal-shell.vue';

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    message: string;
    confirmText?: string;
    /** 危险操作（删除等）使用红色确认按钮 */
    danger?: boolean;
  }>(),
  {
    confirmText: '确认',
    danger: false,
  },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <ModalShell :open="open" :title="title" width-class="max-w-sm" @close="emit('cancel')">
    <div class="flex items-start gap-3">
      <span
        :class="danger ? 'bg-red-500/10 text-red-600' : 'bg-brand-500/10 text-brand-600'"
        class="flex size-9 shrink-0 items-center justify-center rounded-lg"
      >
        <AlertTriangle class="size-4.5" />
      </span>
      <p class="text-surface-800/80 mt-1 text-sm leading-relaxed">{{ message }}</p>
    </div>
    <div class="mt-5 flex justify-end gap-2">
      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
        @click="emit('cancel')"
      >
        取消
      </button>
      <button
        type="button"
        class="text-surface-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors"
        :class="danger ? 'bg-red-600 hover:bg-red-700' : 'bg-brand-600 hover:bg-brand-700'"
        @click="emit('confirm')"
      >
        {{ confirmText }}
      </button>
    </div>
  </ModalShell>
</template>
