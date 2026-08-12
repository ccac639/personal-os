<script setup lang="ts">
import { AlertCircle, X } from '@lucide/vue';

defineProps<{
  message: string | null;
}>();

const emit = defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div
    v-if="message"
    class="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800"
    role="alert"
  >
    <AlertCircle class="size-4 shrink-0" />
    <span class="min-w-0 flex-1 leading-5">{{ message }}</span>
    <button
      type="button"
      class="shrink-0 rounded p-0.5 text-amber-700/60 transition-colors hover:text-amber-900"
      aria-label="关闭提示"
      title="关闭"
      @click="emit('dismiss')"
    >
      <X class="size-3.5" />
    </button>
  </div>
</template>
