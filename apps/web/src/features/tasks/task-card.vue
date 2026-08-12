<script setup lang="ts">
import { CalendarClock, CheckSquare, Pencil, Square, Trash2 } from '@lucide/vue';
import { computed } from 'vue';

import { isOverdue } from '@/features/projects/utils';
import { subtaskStats } from './subtasks';
import { TASK_PRIORITY_META } from './types';
import type { TaskItem } from './types';

const props = defineProps<{
  task: TaskItem;
  selected?: boolean;
  /** 启用多选勾选（批量模式） */
  selectable?: boolean;
}>();

const emit = defineEmits<{
  edit: [task: TaskItem];
  delete: [task: TaskItem];
  open: [task: TaskItem];
  select: [task: TaskItem];
  dragstart: [e: DragEvent];
  dragend: [e: DragEvent];
}>();

const priority = computed(() => TASK_PRIORITY_META[props.task.priority]);
const overdue = computed(() => isOverdue(props.task.dueDate));
const sub = computed(() => subtaskStats(props.task));
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0 shadow-card hover:border-brand-500/40 group cursor-grab rounded-lg border p-3 transition active:cursor-grabbing"
    :class="{ 'border-brand-500/60': selected }"
    draggable="true"
    @dragstart="emit('dragstart', $event)"
    @dragend="emit('dragend', $event)"
    @click="emit('open', task)"
  >
    <div class="flex items-start gap-2">
      <button
        v-if="selectable"
        type="button"
        class="text-surface-800/40 hover:text-brand-600 mt-0.5 shrink-0 transition-colors"
        :aria-label="selected ? `取消选择：${task.title}` : `选择：${task.title}`"
        :title="selected ? '取消选择' : '选择任务'"
        @click.stop="emit('select', task)"
      >
        <CheckSquare v-if="selected" class="text-brand-600 size-4" />
        <Square v-else class="size-4" />
      </button>
      <p class="text-surface-900 min-w-0 flex-1 text-sm leading-snug font-medium">
        {{ task.title }}
      </p>
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

    <!-- 子任务进度（不改变父任务所属列） -->
    <div
      v-if="sub.total > 0"
      class="mt-2 flex items-center gap-1.5"
      :title="`子任务 ${sub.done}/${sub.total}`"
    >
      <div class="bg-surface-100 h-1 min-w-10 flex-1 overflow-hidden rounded-full">
        <div
          class="h-full rounded-full transition-all"
          :class="sub.allDone ? 'bg-green-500' : 'bg-brand-500'"
          :style="{ width: `${sub.progress}%` }"
        />
      </div>
      <span class="text-surface-800/50 shrink-0 text-[10px]"> {{ sub.done }}/{{ sub.total }} </span>
    </div>

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
