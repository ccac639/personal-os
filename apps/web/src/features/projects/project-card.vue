<script setup lang="ts">
import { Archive, CalendarClock, ListTodo, Pencil, RotateCcw, Trash2 } from '@lucide/vue';
import { computed } from 'vue';
import { useRouter } from 'vue-router';

import { useTaskStore } from '@/features/tasks/store';
import { PROJECT_STATUS_META } from './types';
import type { ProjectDetail } from './types';
import { relativeTime } from './utils';

const props = defineProps<{ project: ProjectDetail }>();

const emit = defineEmits<{
  edit: [project: ProjectDetail];
  archive: [project: ProjectDetail];
  restore: [project: ProjectDetail];
  delete: [project: ProjectDetail];
}>();

const router = useRouter();
const taskStore = useTaskStore();

const meta = computed(() => PROJECT_STATUS_META[props.project.status]);
const stats = computed(() => taskStore.projectStats(props.project.id));
const shownTech = computed(() => props.project.techStack.slice(0, 3));
const extraTech = computed(() => Math.max(0, props.project.techStack.length - 3));

function openDetail() {
  router.push(`/projects/${props.project.id}`);
}
</script>

<template>
  <article
    class="border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/40 hover:shadow-float group rounded-card relative flex cursor-pointer flex-col border p-5 transition"
    @click="openDetail"
  >
    <!-- 头部：状态 + 名称 + 悬停操作 -->
    <div class="mb-2 flex items-start justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2">
        <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="meta.dot" />
        <h3 class="text-surface-900 min-w-0 truncate text-sm font-semibold">
          {{ project.name }}
        </h3>
      </div>
      <div
        class="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <button
          v-if="project.status !== 'archived'"
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
          :title="'编辑'"
          aria-label="编辑项目"
          @click.stop="emit('edit', project)"
        >
          <Pencil class="size-3.5" />
        </button>
        <button
          v-if="project.status === 'archived'"
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
          title="恢复项目"
          aria-label="恢复项目"
          @click.stop="emit('restore', project)"
        >
          <RotateCcw class="size-3.5" />
        </button>
        <button
          v-else
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-7 items-center justify-center rounded-lg transition-colors"
          title="归档项目"
          aria-label="归档项目"
          @click.stop="emit('archive', project)"
        >
          <Archive class="size-3.5" />
        </button>
        <button
          type="button"
          class="text-surface-800/50 flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-red-50 hover:text-red-600"
          title="删除项目"
          aria-label="删除项目"
          @click.stop="emit('delete', project)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </div>

    <div class="mb-1 flex items-center gap-2">
      <span
        class="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
        :class="meta.badge"
      >
        {{ meta.label }}
      </span>
    </div>

    <p
      v-if="project.description"
      class="text-surface-800/60 mb-3 line-clamp-2 min-h-10 text-sm leading-5"
    >
      {{ project.description }}
    </p>

    <!-- 进度 -->
    <div class="mb-3">
      <div class="mb-1 flex items-center justify-between text-xs">
        <span class="text-surface-800/50">进度</span>
        <span class="text-surface-900 font-medium">{{ stats.progress }}%</span>
      </div>
      <div class="bg-surface-100 h-1.5 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-all"
          :class="stats.progress >= 100 ? 'bg-green-500' : 'bg-brand-500'"
          :style="{ width: `${stats.progress}%` }"
        />
      </div>
    </div>

    <!-- 技术栈 -->
    <div v-if="project.techStack.length" class="mb-3 flex flex-wrap gap-1.5">
      <span
        v-for="tech in shownTech"
        :key="tech"
        class="border-surface-100 bg-surface-50 text-surface-800/70 rounded-md border px-2 py-0.5 text-xs"
      >
        {{ tech }}
      </span>
      <span
        v-if="extraTech > 0"
        class="border-surface-100 bg-surface-50 text-surface-800/50 rounded-md border px-2 py-0.5 text-xs"
      >
        +{{ extraTech }}
      </span>
    </div>

    <!-- 底部信息 -->
    <div
      class="text-surface-800/50 border-surface-100 mt-auto flex items-center gap-4 border-t pt-3 text-xs"
    >
      <span class="flex items-center gap-1">
        <CalendarClock class="size-3.5" />
        {{ relativeTime(project.updatedAt) }}
      </span>
      <span class="flex items-center gap-1">
        <ListTodo class="size-3.5" />
        {{ stats.done }}/{{ stats.total }} 任务
      </span>
    </div>
  </article>
</template>
