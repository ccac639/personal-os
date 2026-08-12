<script setup lang="ts">
import { GitBranch, GitCommit, GitPullRequest } from '@lucide/vue';

/** 最近提交（取自仓库真实 git log，后续可接 API 动态化） */
const commits = [
  {
    hash: 'a0c3cc4',
    message: '首页深度优化：待办/工作流组件 + 趋势图',
    time: '10 分钟前',
    branch: 'main',
  },
  {
    hash: '9508b6c',
    message: '外观面板改左右两栏布局',
    time: '35 分钟前',
    branch: 'main',
  },
  {
    hash: '0318fcd',
    message: '外观面板改紧凑滚动模式',
    time: '42 分钟前',
    branch: 'main',
  },
  {
    hash: '5e0a7d3',
    message: '每个背景预设独立配色',
    time: '1 小时前',
    branch: 'main',
  },
];

const repoInfo = {
  name: 'personal-os',
  branch: 'main',
  remote: 'github.com/ccac639/personal-os',
  clean: true,
  behind: 0,
};
</script>

<template>
  <section class="border-surface-100 bg-surface-0 rounded-lg border p-6">
    <div class="mb-4 flex items-center justify-between">
      <h2 class="text-surface-900 text-lg font-semibold">Git 仓库</h2>
      <router-link to="/git" class="text-brand-600 hover:text-brand-700 text-sm">
        查看全部
      </router-link>
    </div>

    <!-- 仓库概览 -->
    <div
      class="border-surface-100 bg-surface-50 mb-3 flex items-center gap-3 rounded-lg border p-3"
    >
      <div
        class="bg-brand-500/10 text-brand-600 flex size-9 shrink-0 items-center justify-center rounded-lg"
      >
        <GitBranch class="size-4" />
      </div>
      <div class="min-w-0 flex-1">
        <p class="text-surface-900 truncate text-sm font-medium">{{ repoInfo.name }}</p>
        <p class="text-surface-800/60 truncate text-xs">{{ repoInfo.remote }}</p>
      </div>
      <span
        class="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600"
      >
        {{ repoInfo.branch }}
      </span>
    </div>

    <!-- 最近提交列表 -->
    <div class="space-y-2">
      <div
        v-for="commit in commits"
        :key="commit.hash"
        class="group hover:bg-surface-50 flex items-center gap-3 rounded-lg px-2 py-1.5 transition"
      >
        <div class="text-brand-600/70 shrink-0">
          <GitCommit class="size-4" />
        </div>
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm">{{ commit.message }}</p>
          <p class="text-surface-800/50 text-xs">
            <span class="font-mono">{{ commit.hash }}</span> · {{ commit.time }}
          </p>
        </div>
      </div>
    </div>

    <!-- 同步状态 -->
    <div
      class="text-surface-800/50 border-surface-100 mt-3 flex items-center gap-1.5 border-t pt-3 text-xs"
    >
      <GitPullRequest class="size-3.5" />
      <span v-if="repoInfo.clean">与远程同步 · 工作区干净</span>
      <span v-else class="text-amber-600">有未提交变更</span>
    </div>
  </section>
</template>
