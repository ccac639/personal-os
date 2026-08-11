<script setup lang="ts">
import { Boxes, Code2, Layers, Server } from '@lucide/vue';
import type { StatCard } from './types';

const stats: StatCard[] = [
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
</script>

<template>
  <section class="grid grid-cols-2 gap-4 md:grid-cols-4">
    <article
      v-for="stat in stats"
      :key="stat.id"
      class="rounded-lg border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-sm"
    >
      <div class="flex items-start justify-between">
        <div>
          <p class="text-sm text-neutral-500">{{ stat.label }}</p>
          <p class="mt-1 text-3xl font-semibold text-neutral-900">{{ stat.value }}</p>
        </div>
        <component :is="stat.icon" class="size-6 text-neutral-400" />
      </div>
    </article>
  </section>
</template>
