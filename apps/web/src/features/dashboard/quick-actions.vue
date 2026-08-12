<script setup lang="ts">
import { BookOpen, FolderPlus, GitBranch, Workflow } from '@lucide/vue';
import type { QuickAction } from './types';

const actions: QuickAction[] = [
  {
    id: 'new-project',
    label: '新建项目',
    icon: FolderPlus,
    href: '/projects/new',
    color: 'bg-brand-500/10 text-brand-600 hover:bg-brand-500/20',
  },
  {
    id: 'new-workflow',
    label: '创建工作流',
    icon: Workflow,
    href: '/workflows/new',
    color: 'bg-purple-500/10 text-purple-600 hover:bg-purple-500/20',
  },
  {
    id: 'new-blog',
    label: '写博客',
    icon: BookOpen,
    href: '/blog/new',
    color: 'bg-green-500/10 text-green-600 hover:bg-green-500/20',
  },
  {
    id: 'git-ops',
    label: 'Git 操作',
    icon: GitBranch,
    href: '/git',
    color: 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20',
  },
];
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
    <h2 class="text-surface-900 mb-4 text-lg font-semibold">快速操作</h2>
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
