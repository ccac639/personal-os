<script setup lang="ts">
import { CalendarClock, Pencil, Trash2 } from '@lucide/vue';
import { computed } from 'vue';

import { TASK_PRIORITY_META } from './types';
import type { TaskItem } from './types';
import { isOverdue } from '@/features/projects/utils';

const props = defineProps<{ task: TaskItem }>();

const emit = defineEmits<{
  edit: [task: TaskItem];
  delete: [task: TaskItem];
  dragstart: [e: DragEvent];
  dragend: [e: DragEvent];
}>();

const priority = computed(() => TASK_PRIORITY_META[props.task.priority]);
const overdue = computed(() => isOverdue(props.task.dueDate));
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/40 group cursor-grab rounded-lg border p-3 transition active:cursor-grabbing"
    draggable="true"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend', $event)"
  >
    <div class="flex items-start justify-between gap-2">
      <p class="text-surface-900 text-sm leading-snug font-medium">{{ task.title }}</p>
      <div class="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex size-6 items-center justify-center rounded-md transition-colors"
          title="编辑任务"
          aria-label="编辑任务"
          @click.stop="emit('edit', task)"
        >
          <Pencil class="size-3" />
        </button>
        <button
          type="button"
          class="text-surface-800/50 flex size-6 items-center justify-center rounded-md transition-colors hover:bg-red-50 hover:text-red-600"
          title="删除任务"
          aria-label="删除任务"
          @click.stop="emit('delete', task)"
        >
          <Trash2 class="size-3" />
        </button>
      </div>
    </div>

    <p v-if="task.description" class="text-surface-800/55 mt-1 line-clamp-2 text-xs leading-5">
      {{ task.description }}
    </p>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <span
        class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
        :class="priority.badge"
      >
        {{ priority.label }}
      </span>
      <span
        v-for="tag in task.tags"
        :key="tag"
        class="border-surface-100 bg-surface-50 text-surface-800/60 rounded border px-1.5 py-0.5 text-xs"
      >
        {{ tag }}
      </span>
      <span
        v-if="task.dueDate"
        class="text-surface-800/50 ml-auto flex items-center gap-1 text-xs"
        :class="overdue ? 'font-medium text-red-500' : ''"
      >
        <CalendarClock class="size-3" />
        {{ task.dueDate }}
      </span>
    </div>
  </div>
</template>
