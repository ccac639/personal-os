<script setup lang="ts">
/**
 * Admin 应用内通知/toast 面板（自包含，不调用浏览器 Notification 权限）
 */
import { CircleCheck, Info, TriangleAlert, X } from '@lucide/vue';
import { useAdminToasts } from '../toast';
import type { AdminToastKind } from '../toast';

const { toasts, dismiss } = useAdminToasts();

const KIND_STYLE: Record<AdminToastKind, { icon: unknown; ring: string; label: string }> = {
  info: { icon: Info, ring: 'border-brand-500/30', label: '信息' },
  success: { icon: CircleCheck, ring: 'border-emerald-500/30', label: '成功' },
  warning: { icon: TriangleAlert, ring: 'border-amber-500/30', label: '警告' },
  error: { icon: TriangleAlert, ring: 'border-rose-500/30', label: '错误' },
};
</script>

<template>
  <div
    class="pointer-events-none fixed top-16 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2"
    role="status"
    aria-live="polite"
    aria-label="通知"
  >
    <TransitionGroup name="admin-toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="bg-surface-0 border-surface-100 shadow-surface-900/10 pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5 shadow-md"
        :class="KIND_STYLE[t.kind]?.ring"
      >
        <component
          :is="KIND_STYLE[t.kind]?.icon"
          class="text-surface-800/80 mt-0.5 size-4 shrink-0"
          aria-hidden="true"
        />
        <p class="text-surface-900 min-w-0 flex-1 text-sm leading-relaxed">{{ t.text }}</p>
        <button
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:ring-2 focus-visible:outline-none"
          :aria-label="`关闭通知：${t.text}`"
          title="关闭通知"
          @click="dismiss(t.id)"
        >
          <X class="size-3.5" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.admin-toast-enter-active,
.admin-toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.admin-toast-enter-from {
  opacity: 0;
  transform: translateY(-6px);
}
.admin-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
