<script setup lang="ts">
import { Clock, GitBranch } from '@lucide/vue';
import type { ProjectItem } from './types';

const projects: ProjectItem[] = [
  {
    id: '1',
    name: 'Personal OS',
    description: '个人工作台 + AI Agent + Workflow 一体化系统',
    status: 'active',
    lastUpdated: '2 小时前',
    progress: 35,
  },
];

function getStatusColor(status: string) {
  const colors = {
    active: 'bg-green-500',
    paused: 'bg-yellow-500',
    completed: 'bg-blue-500',
  };
  return colors[status as keyof typeof colors] || 'bg-gray-500';
}
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">开发中项目</h2>
      <router-link to="/projects" class="text-brand-600 hover:text-brand-700 text-sm">
        查看全部
      </router-link>
    </div>
    <div class="space-y-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="border-surface-100 hover:border-surface-800/30 hover:bg-surface-50 rounded-lg border p-4 transition"
      >
        <div class="mb-2 flex items-start justify-between">
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span
                :class="getStatusColor(project.status)"
                class="inline-block size-2 rounded-full"
              />
              <h3 class="text-surface-900 font-medium">{{ project.name }}</h3>
            </div>
            <p v-if="project.description" class="text-surface-800/70 mt-1 text-sm">
              {{ project.description }}
            </p>
          </div>
        </div>
        <div class="text-surface-800/60 flex items-center gap-4 text-xs">
          <span class="flex items-center gap-1">
            <Clock class="size-3" />
            {{ project.lastUpdated }}
          </span>
          <span class="flex items-center gap-1">
            <GitBranch class="size-3" />
            main
          </span>
        </div>
      </div>
    </div>
  </section>
</template>
