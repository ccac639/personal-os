<script setup lang="ts">
import { CheckCircle2, ChevronRight, Loader2, XCircle, Zap } from '@lucide/vue';

interface WorkflowRun {
  id: string;
  name: string;
  status: 'success' | 'running' | 'failed';
  duration: string;
  startedAt: string;
}

const runs: WorkflowRun[] = [
  {
    id: 'w1',
    name: '每日代码审查流水线',
    status: 'running',
    duration: '2m 14s',
    startedAt: '10 分钟前',
  },
  { id: 'w2', name: '依赖安全审计', status: 'success', duration: '48s', startedAt: '1 小时前' },
  { id: 'w3', name: '博客自动发布', status: 'success', duration: '12s', startedAt: '3 小时前' },
];

const STATUS_CONFIG: Record<
  WorkflowRun['status'],
  { label: string; icon: typeof Loader2; cls: string; spin?: boolean }
> = {
  success: { label: '成功', icon: CheckCircle2, cls: 'text-green-600 bg-green-500/10' },
  running: { label: '运行中', icon: Loader2, cls: 'text-brand-600 bg-brand-500/10', spin: true },
  failed: { label: '失败', icon: XCircle, cls: 'text-red-600 bg-red-500/10' },
};

const successRate = Math.round(
  (runs.filter((r) => r.status === 'success').length / runs.length) * 100,
);
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 text-base font-semibold">工作流</h2>
      <span class="text-surface-800/50 text-xs tabular-nums">成功率 {{ successRate }}%</span>
    </div>

    <ul class="flex-1 space-y-2">
      <li
        v-for="run in runs"
        :key="run.id"
        class="border-surface-100 hover:border-surface-800/30 group flex items-center gap-2.5 rounded-lg border p-2.5 transition"
      >
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md"
          :class="STATUS_CONFIG[run.status].cls"
        >
          <component
            :is="STATUS_CONFIG[run.status].icon"
            class="size-4"
            :class="{ 'animate-spin': STATUS_CONFIG[run.status].spin }"
          />
        </span>
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">{{ run.name }}</p>
          <p class="text-surface-800/50 text-xs">{{ run.duration }} · {{ run.startedAt }}</p>
        </div>
        <ChevronRight
          class="text-surface-800/30 size-4 opacity-0 transition group-hover:opacity-100"
        />
      </li>
    </ul>

    <router-link
      to="/workflows"
      class="text-brand-600 hover:text-brand-700 border-surface-100 mt-3 flex items-center justify-between border-t pt-2.5 text-xs transition"
    >
      <span class="flex items-center gap-1">
        <Zap class="size-3.5" />
        查看全部工作流
      </span>
      <ChevronRight class="size-3.5" />
    </router-link>
  </section>
</template>
