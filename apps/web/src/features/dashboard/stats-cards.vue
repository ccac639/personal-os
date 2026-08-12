<script setup lang="ts">
import { computed } from 'vue';
import { Boxes, Code2, Layers, Server } from '@lucide/vue';
import type { StatCard } from './types';

interface Props {
  /** all: 全部 4 张 | left: 左侧 3 张（项目/技术栈/模块） | right: 右侧 1 张（服务） */
  variant?: 'all' | 'left' | 'right';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'all',
});

const allStats: StatCard[] = [
  {
    id: 'projects',
    label: '开发中项目',
    value: 1,
    trend: { value: 0, isPositive: true },
    icon: Layers,
  },
  {
    id: 'tech',
    label: '技术栈',
    value: '47+',
    icon: Code2,
  },
  {
    id: 'modules',
    label: '模块数',
    value: 6,
    icon: Boxes,
  },
  {
    id: 'services',
    label: '活跃服务',
    value: '4/4',
    icon: Server,
  },
];

const stats = computed(() => {
  if (props.variant === 'left') return allStats.slice(0, 3);
  if (props.variant === 'right') return allStats.slice(3);
  return allStats;
});

const gridCols = computed(() => {
  if (props.variant === 'left') return 'grid-cols-1 md:grid-cols-3';
  if (props.variant === 'right') return 'grid-cols-1';
  return 'grid-cols-2 md:grid-cols-4';
});
</script>

<template>
  <section :class="['grid gap-4', gridCols]">
    <article
      v-for="stat in stats"
      :key="stat.id"
      class="border-surface-100 bg-surface-0 hover:border-surface-800/30 rounded-lg border p-6 transition hover:shadow-sm"
    >
      <div class="flex items-start justify-between">
        <div>
          <p class="text-surface-800/60 text-sm">{{ stat.label }}</p>
          <p class="text-surface-900 mt-1 text-3xl font-semibold">{{ stat.value }}</p>
        </div>
        <component :is="stat.icon" class="text-surface-800/50 size-6" />
      </div>
    </article>
  </section>
</template>
