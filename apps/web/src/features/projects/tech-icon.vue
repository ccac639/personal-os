<script setup lang="ts">
import type { TechItem } from './tech-stack';

defineProps<{
  item: TechItem;
  size?: number;
}>();
</script>

<template>
  <svg
    v-if="'si' in item"
    viewBox="0 0 24 24"
    :width="size ?? 20"
    :height="size ?? 20"
    role="img"
    :aria-label="item.name"
    :fill="`#${item.si.hex}`"
  >
    <path :d="item.si.path" />
  </svg>
  <component :is="item.fallback" v-else :size="size ?? 20" class="text-neutral-400" />
</template>
