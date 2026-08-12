<script setup lang="ts">
import { CheckCircle2, Info, TriangleAlert } from '@lucide/vue';

import { toastState } from '../toast';

const ICONS = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert,
} as const;

const COLORS = {
  success: 'text-emerald-500',
  info: 'text-brand-500',
  warning: 'text-amber-500',
} as const;
</script>

<template>
  <div class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-72 flex-col gap-2">
    <transition-group
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 translate-y-3"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 translate-y-3"
    >
      <div
        v-for="t in toastState.items"
        :key="t.id"
        class="bg-surface-0 shadow-float border-surface-100 pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2.5"
        role="status"
      >
        <component
          :is="ICONS[t.kind]"
          class="mt-0.5 size-4 shrink-0"
          :class="COLORS[t.kind]"
        />
        <span class="text-surface-900 min-w-0 flex-1 text-xs leading-relaxed">
          {{ t.text }}
        </span>
      </div>
    </transition-group>
  </div>
</template>
