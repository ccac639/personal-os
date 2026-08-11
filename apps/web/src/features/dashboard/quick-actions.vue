<script setup lang="ts">
import { BookOpen, FolderPlus, GitBranch, Workflow } from '@lucide/vue';
import type { QuickAction } from './types';

const actions: QuickAction[] = [
  {
    id: 'new-project',
    label: '新建项目',
    icon: FolderPlus,
    href: '/projects/new',
    color: 'bg-blue-50 text-blue-600 hover:bg-blue-100',
  },
  {
    id: 'new-workflow',
    label: '创建工作流',
    icon: Workflow,
    href: '/workflows/new',
    color: 'bg-purple-50 text-purple-600 hover:bg-purple-100',
  },
  {
    id: 'new-blog',
    label: '写博客',
    icon: BookOpen,
    href: '/blog/new',
    color: 'bg-green-50 text-green-600 hover:bg-green-100',
  },
  {
    id: 'git-ops',
    label: 'Git 操作',
    icon: GitBranch,
    href: '/git',
    color: 'bg-orange-50 text-orange-600 hover:bg-orange-100',
  },
];
</script>

<template>
  <section class="rounded-lg border border-neutral-200 bg-white p-6">
    <h2 class="mb-4 text-lg font-semibold text-neutral-900">快速操作</h2>
    <div class="grid grid-cols-2 gap-3 md:grid-cols-4">
      <router-link
        v-for="action in actions"
        :key="action.id"
        :to="action.href"
        class="flex flex-col items-center gap-2 rounded-lg p-4 transition"
        :class="action.color"
      >
        <component :is="action.icon" class="size-6" />
        <span class="text-sm font-medium">{{ action.label }}</span>
      </router-link>
    </div>
  </section>
</template>
