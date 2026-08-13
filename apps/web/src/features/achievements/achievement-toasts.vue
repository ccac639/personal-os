<script setup lang="ts">
import { AlertTriangle, CircleCheck, Info } from '@lucide/vue';
import type { Component } from 'vue';
import { useToasts } from './toast';

const { toasts, dismiss } = useToasts();

const KIND_META: Record<string, { icon: Component; cls: string }> = {
  success: { icon: CircleCheck, cls: 'text-emerald-600' },
  error: { icon: AlertTriangle, cls: 'text-red-600' },
  info: { icon: Info, cls: 'text-brand-600' },
};
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed right-4 bottom-4 z-[70] flex w-72 max-w-[calc(100vw-2rem)] flex-col gap-2"
      role="status"
      aria-live="polite"
      aria-label="通知"
    >
      <TransitionGroup
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-1 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-for="t in toasts"
          :key="t.id"
          class="border-surface-100/70 bg-surface-0/95 shadow-float pointer-events-auto flex w-full items-start gap-2 rounded-lg border px-3 py-2.5 backdrop-blur-xl"
        >
          <component
            :is="KIND_META[t.kind]?.icon ?? Info"
            class="mt-0.5 size-4 shrink-0"
            :class="KIND_META[t.kind]?.cls"
          />
          <p class="text-surface-900 min-w-0 flex-1 text-xs leading-relaxed break-words">
            {{ t.message }}
          </p>
          <button
            type="button"
            title="关闭"
            aria-label="关闭通知"
            class="text-surface-800/40 hover:text-surface-900 shrink-0 rounded p-0.5 transition"
            @click="dismiss(t.id)"
          >
            <span class="text-sm leading-none">×</span>
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
