<script setup lang="ts">
/** 状态徽标：紧凑单行，色块 + 文案（运维控制台风格，无阴影/渐变） */
import { computed } from 'vue';

import { statusLabel, statusTone, type StatusTone } from '../format';

const props = withDefaults(
  defineProps<{
    status: string | null | undefined;
    /** 自定义文案（默认 statusLabel） */
    label?: string;
  }>(),
  { label: undefined },
);

const tone = computed<StatusTone>(() => statusTone(props.status));
const text = computed<string>(() => props.label ?? statusLabel(props.status));

const toneClass: Record<StatusTone, string> = {
  ok: 'bg-emerald-500/10 text-emerald-700',
  warn: 'bg-amber-500/10 text-amber-700',
  error: 'bg-red-500/10 text-red-700',
  muted: 'bg-surface-100 text-surface-800/60',
};

const dotClass: Record<StatusTone, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  error: 'bg-red-500',
  muted: 'bg-surface-800/30',
};
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap"
    :class="toneClass[tone]"
  >
    <span class="size-1.5 rounded-full" :class="dotClass[tone]" aria-hidden="true" />
    {{ text }}
  </span>
</template>
