<script setup lang="ts">
import { CalendarClock, CheckSquare, Link2Off, Pencil, Square, Timer, Trash2 } from '@lucide/vue';
import { computed } from 'vue';

import { isOverdue } from '@/features/projects/utils';
import { isBlocked } from './dependencies';
import { subtaskStats } from './subtasks';
import { useTaskStore } from './store';
import { TASK_PRIORITY_META } from './types';
import type { TaskItem } from './types';

const props = defineProps<{
  task: TaskItem;
  selected?: boolean;
  /** 启用多选勾选（批量模式） */
  selectable?: boolean;
  /** 高密度模式（默认）：隐藏描述 / 标签 / 专注时长 / 子任务进度等低频字段 */
  dense?: boolean;
}>();

const emit = defineEmits<{
  edit: [task: TaskItem];
  delete: [task: TaskItem];
  open: [task: TaskItem];
  select: [task: TaskItem];
  dragstart: [e: DragEvent];
  dragend: [e: DragEvent];
}>();

const store = useTaskStore();
const priority = computed(() => TASK_PRIORITY_META[props.task.priority]);
const overdue = computed(() => isOverdue(props.task.dueDate));
const sub = computed(() => subtaskStats(props.task));
const taskMap = computed(() => new Map(store.tasks.map((t) => [t.id, t])));
const blocked = computed(() => isBlocked(props.task, taskMap.value));
const isTodayFocus = computed(() => store.focus.some((f) => f.taskId === props.task.id));
const focusMinutes = computed(() => store.taskFocusMinutes(props.task.id));
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
      <p
        class="text-surface-900 min-w-0 flex-1 text-sm leading-snug font-medium"
        :class="{ 'text-surface-800/50 line-through': task.status === 'done' }"
      >
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

    <p
      v-if="!dense && task.description"
      class="text-surface-800/55 mt-1 line-clamp-2 text-xs leading-5"
    >
      {{ task.description }}
    </p>

    <!-- 子任务进度（不改变父任务所属列；高密度下隐藏） -->
    <div
      v-if="!dense && sub.total > 0"
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
    <span
      v-else-if="dense && sub.total > 0"
      class="text-surface-800/50 shrink-0 text-[10px]"
      :title="`子任务 ${sub.done}/${sub.total}`"
    >
      {{ sub.done }}/{{ sub.total }}
    </span>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <!-- 受阻标记（克制：仅图标 + 悬停提示） -->
      <span
        v-if="blocked"
        class="flex items-center rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-600"
        title="存在未完成的前置任务，可在详情中查看"
      >
        <Link2Off class="size-3" />
      </span>
      <span
        class="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
        :class="priority.badge"
      >
        {{ priority.label }}
      </span>
      <template v-if="!dense">
        <span
          v-for="tag in task.tags"
          :key="tag"
          class="border-surface-100 bg-surface-50 text-surface-800/60 rounded border px-1.5 py-0.5 text-xs"
        >
          {{ tag }}
        </span>
      </template>
      <span
        v-if="isTodayFocus"
        class="text-brand-600 bg-brand-500/10 flex items-center rounded px-1.5 py-0.5 text-xs"
        title="今日聚焦任务"
      >
        <Timer class="size-3" />
      </span>
      <span
        v-if="!dense && focusMinutes > 0"
        class="text-surface-800/50 flex items-center gap-0.5 rounded px-1 py-0.5 text-xs"
        title="累计专注时长"
      >
        <Timer class="size-3" />
        {{ focusMinutes }} 分
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
