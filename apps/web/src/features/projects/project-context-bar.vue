<script setup lang="ts">
import { Archive, History, ListTodo, RotateCcw, TrendingUp } from '@lucide/vue';
import { computed } from 'vue';

import { useTaskStore } from '@/features/tasks/store';
import { effectiveProgress } from './progress';
import { PROJECT_STATUS_META } from './types';
import type { ProjectActivity, ProjectDetail } from './types';
import { relativeTime } from './utils';

const props = defineProps<{
  project: ProjectDetail;
  latestActivity: ProjectActivity | null;
}>();

const emit = defineEmits<{
  archive: [];
  restore: [];
}>();

const taskStore = useTaskStore();
const stats = computed(() => taskStore.projectStats(props.project.id));
const progress = computed(() => effectiveProgress(props.project, stats.value.progress));
const unfinished = computed(() => stats.value.total - stats.value.done);
const meta = computed(() => PROJECT_STATUS_META[props.project.status]);
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0 shadow-card rounded-card flex flex-wrap items-center gap-x-5 gap-y-2 border px-4 py-2.5 text-sm"
  >
    <!-- 状态 -->
    <span class="flex items-center gap-1.5">
      <span class="size-2 rounded-full" :class="meta.dot" />
      <span class="text-surface-800/70 text-xs">{{ meta.label }}</span>
    </span>

    <!-- 进度 -->
    <span
      class="flex items-center gap-1.5"
      :title="project.progressMode === 'manual' ? '手动进度' : '任务完成比例'"
    >
      <TrendingUp class="text-surface-800/40 size-3.5" />
      <span class="text-surface-900 text-xs font-medium">{{ progress }}%</span>
      <span
        v-if="project.progressMode === 'manual'"
        class="bg-surface-100 text-surface-800/50 rounded px-1 text-[10px]"
        >手动</span
      >
    </span>

    <!-- 未完成任务数 -->
    <span class="flex items-center gap-1.5">
      <ListTodo class="text-surface-800/40 size-3.5" />
      <span class="text-surface-800/70 text-xs"> {{ unfinished }} 个未完成 </span>
    </span>

    <!-- 最近活动 -->
    <span class="flex min-w-0 items-center gap-1.5" :title="latestActivity?.title">
      <History class="text-surface-800/40 size-3.5 shrink-0" />
      <span class="text-surface-800/50 truncate text-xs">
        {{
          latestActivity
            ? `${latestActivity.title} · ${relativeTime(latestActivity.createdAt)}`
            : '暂无活动'
        }}
      </span>
    </span>

    <!-- 归档入口 -->
    <button
      v-if="project.status !== 'archived'"
      type="button"
      class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
      title="归档项目（保留任务）"
      aria-label="归档项目"
      @click="emit('archive')"
    >
      <Archive class="size-3.5" />
      归档
    </button>
    <button
      v-else
      type="button"
      class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition-colors"
      title="恢复项目"
      aria-label="恢复项目"
      @click="emit('restore')"
    >
      <RotateCcw class="size-3.5" />
      恢复
    </button>
  </div>
</template>
