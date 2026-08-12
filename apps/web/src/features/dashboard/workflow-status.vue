<script setup lang="ts">
import { computed } from 'vue';
import { CheckCircle2, ChevronRight, Loader2, XCircle, Zap } from '@lucide/vue';
import { WORKFLOW_RUNS } from './mock';
import type { WorkflowRun } from './types';

interface Props {
  /** 外部数据覆盖（测试 / 后续接 API） */
  runs?: WorkflowRun[];
}

const props = withDefaults(defineProps<Props>(), {
  runs: undefined,
});

const runs = computed(() => props.runs ?? WORKFLOW_RUNS);

const STATUS_CONFIG: Record<
  WorkflowRun['status'],
  { label: string; icon: typeof Loader2; cls: string; spin?: boolean }
> = {
  success: { label: '成功', icon: CheckCircle2, cls: 'text-green-600 bg-green-500/10' },
  running: { label: '运行中', icon: Loader2, cls: 'text-brand-600 bg-brand-500/10', spin: true },
  failed: { label: '失败', icon: XCircle, cls: 'text-red-600 bg-red-500/10' },
};

const successRate = computed(() => {
  const total = runs.value.length;
  if (total === 0) return 0;
  return Math.round((runs.value.filter((r) => r.status === 'success').length / total) * 100);
});
</script>

<template>
  <section class="border-surface-100 bg-surface-0 flex flex-col rounded-lg border p-5">
    <div class="mb-3 flex items-center justify-between">
      <h2 class="text-surface-900 text-base font-semibold">工作流</h2>
      <span class="text-surface-800/50 text-xs tabular-nums">成功率 {{ successRate }}%</span>
    </div>

    <!-- 空态 -->
    <div
      v-if="runs.length === 0"
      class="flex flex-1 flex-col items-center justify-center gap-2 py-8"
    >
      <Zap class="text-surface-800/30 size-6" />
      <p class="text-surface-800/50 text-xs">暂无工作流运行</p>
    </div>

    <!-- 运行列表（高度受控，不撑破首页） -->
    <ul v-else class="max-h-[240px] flex-1 space-y-2 overflow-y-auto pr-0.5">
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
          <p class="text-surface-900 truncate text-sm font-medium">
            {{ run.name }}
            <span class="ml-1 text-[10px] font-normal" :class="STATUS_CONFIG[run.status].cls.split(' ')[0]">
              {{ STATUS_CONFIG[run.status].label }}
            </span>
          </p>
          <!-- 失败原因摘要（红色，截断不换行） -->
          <p v-if="run.status === 'failed' && run.failureReason" class="text-red-600/80 truncate text-[11px]">
            {{ run.failureReason }}
          </p>
          <p v-else class="text-surface-800/50 text-xs">{{ run.duration }} · {{ run.startedAt }}</p>
        </div>
        <ChevronRight
          class="text-surface-800/30 size-4 opacity-0 transition group-hover:opacity-100"
        />
      </li>
    </ul>

    <!-- 查看全部：只走已有路由 /workflows -->
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
