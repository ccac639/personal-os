<script setup lang="ts">
import { BookOpen, FolderPlus, GitBranch, Workflow } from '@lucide/vue';
import type { QuickAction } from './types';

const actions: QuickAction[] = [
  {
    id: 'new-project',
    label: '新建项目',
    icon: FolderPlus,
    href: '/projects/new',
    shortcut: 'Ctrl N',
    color: 'text-blue-500 hover:from-blue-500/30 hover:to-blue-500/5',
  },
  {
    id: 'new-workflow',
    label: '创建工作流',
    icon: Workflow,
    href: '/workflows/new',
    shortcut: 'Ctrl W',
    color: 'text-purple-500 hover:from-purple-500/30 hover:to-purple-500/5',
  },
  {
    id: 'new-blog',
    label: '写博客',
    icon: BookOpen,
    href: '/blog/new',
    shortcut: 'Ctrl B',
    color: 'text-green-500 hover:from-green-500/30 hover:to-green-500/5',
  },
  {
    id: 'git-ops',
    label: 'Git 操作',
    icon: GitBranch,
    href: '/git',
    shortcut: 'Ctrl G',
    color: 'text-orange-500 hover:from-orange-500/30 hover:to-orange-500/5',
  },
];
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-5">
    <h2 class="text-surface-900 mb-4 text-lg font-semibold">快速操作</h2>
    <!-- 2 行 2 列按钮网格 -->
    <div class="grid grid-cols-2 gap-3">
      <router-link
        v-for="action in actions"
        :key="action.id"
        :to="action.href"
        class="group relative flex flex-col items-start justify-between overflow-hidden rounded-lg bg-slate-900/85 p-4 text-white shadow-sm transition duration-200 hover:bg-gradient-to-br hover:shadow-md"
        :class="action.color"
      >
        <component :is="action.icon" class="size-5 transition duration-200 group-hover:scale-110" />
        <span class="mt-3 text-sm font-medium">{{ action.label }}</span>
        <!-- 右下角快捷键提示 -->
        <kbd
          v-if="action.shortcut"
          class="absolute right-2 bottom-2 rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[10px] font-normal text-white/60"
        >
          {{ action.shortcut }}
        </kbd>
      </router-link>
    </div>
  </section>
</template>
