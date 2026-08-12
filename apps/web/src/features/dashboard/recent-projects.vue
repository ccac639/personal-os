<script setup lang="ts">
import { Clock, FolderOpen, GitBranch } from '@lucide/vue';
import { RECENT_PROJECTS } from './mock';
import type { ProjectItem } from './types';

interface Props {
  /** 外部数据覆盖（测试 / 后续接 API） */
  projects?: ProjectItem[];
}

const props = withDefaults(defineProps<Props>(), {
  projects: undefined,
});

const projects = props.projects ?? RECENT_PROJECTS;

function getStatusColor(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-500',
    paused: 'bg-yellow-500',
    completed: 'bg-blue-500',
  };
  return colors[status] || 'bg-gray-500';
}

function getStatusLabel(status: string) {
  const labels: Record<string, string> = {
    active: '进行中',
    paused: '已暂停',
    completed: '已完成',
  };
  return labels[status] || '未知';
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

    <!-- 空态 -->
    <div v-if="projects.length === 0" class="flex flex-col items-center justify-center gap-2 py-10">
      <FolderOpen class="text-surface-800/30 size-8" />
      <p class="text-surface-800/50 text-xs">暂无进行中的项目</p>
      <router-link
        to="/projects"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-md px-3 py-1.5 text-xs font-medium transition"
      >
        去创建项目
      </router-link>
    </div>

    <div v-else class="space-y-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="border-surface-100 hover:border-surface-800/30 hover:bg-surface-50 rounded-lg border p-4 transition"
      >
        <div class="mb-2 flex items-start justify-between">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span
                :class="getStatusColor(project.status)"
                class="inline-block size-2 shrink-0 rounded-full"
              />
              <h3 class="text-surface-900 truncate font-medium">{{ project.name }}</h3>
              <span class="text-surface-800/40 shrink-0 text-[10px]">
                {{ getStatusLabel(project.status) }}
              </span>
            </div>
            <p v-if="project.description" class="text-surface-800/70 mt-1 line-clamp-2 text-sm">
              {{ project.description }}
            </p>
            <!-- 进度条（active 时展示） -->
            <div
              v-if="project.status === 'active' && project.progress !== undefined"
              class="mt-2"
            >
              <div class="bg-surface-100 h-1.5 overflow-hidden rounded-full">
                <div
                  class="bg-brand-600 h-full rounded-full transition-[width] duration-300"
                  :style="{
                    width: `${Math.min(100, Math.max(0, project.progress))}%`,
                  }"
                />
              </div>
            </div>
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
