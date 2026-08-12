<script setup lang="ts">
import { ArrowDownUp, Plus } from '@lucide/vue';
import { computed, ref } from 'vue';

import ConfirmDialog from '@/features/projects/confirm-dialog.vue';
import { useTaskStore } from './store';
import TaskCard from './task-card.vue';
import TaskForm from './task-form.vue';
import { KANBAN_STATUSES, TASK_PRIORITY_META, TASK_SORT_OPTIONS, TASK_STATUS_META } from './types';
import type { KanbanStatus, TaskForm as TaskFormData, TaskItem } from './types';

const props = defineProps<{ projectId: string }>();

const store = useTaskStore();

const formOpen = ref(false);
const editing = ref<TaskItem | null>(null);
const deleting = ref<TaskItem | null>(null);

/** 拖拽中的任务 id */
const draggedId = ref<string | null>(null);
/** 当前悬停落点：目标列 + 插入位置（beforeId 为空 = 列尾） */
const dropHint = ref<{ status: KanbanStatus; beforeId: string | null } | null>(null);

const todoTasks = computed(() => store.tasksInColumn(props.projectId, 'todo'));
const doingTasks = computed(() => store.tasksInColumn(props.projectId, 'in-progress'));
const doneTasks = computed(() => store.tasksInColumn(props.projectId, 'done'));

const totalCount = computed(() => store.tasksByProject(props.projectId).length);

function tasksFor(status: KanbanStatus) {
  if (status === 'todo') return todoTasks.value;
  if (status === 'in-progress') return doingTasks.value;
  return doneTasks.value;
}

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(task: TaskItem) {
  editing.value = task;
  formOpen.value = true;
}

function onFormSubmit(form: TaskFormData) {
  if (editing.value) store.updateTask(editing.value.id, form);
  else store.createTask(form);
  formOpen.value = false;
}

function confirmDelete() {
  if (deleting.value) store.deleteTask(deleting.value.id);
  deleting.value = null;
}

// ── 原生 HTML Drag and Drop ──

function onDragStart(e: DragEvent, taskId: string) {
  draggedId.value = taskId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }
}

function onDragEnd() {
  draggedId.value = null;
  dropHint.value = null;
}

function onColumnDragOver(e: DragEvent, status: KanbanStatus) {
  e.preventDefault();
  dropHint.value = { status, beforeId: null };
}

function onCardDragOver(e: DragEvent, status: KanbanStatus, cardId: string) {
  e.preventDefault();
  e.stopPropagation();
  dropHint.value = { status, beforeId: cardId };
}

function onColumnDrop(e: DragEvent, status: KanbanStatus) {
  e.preventDefault();
  performDrop(status, null);
}

function onCardDrop(e: DragEvent, status: KanbanStatus, cardId: string) {
  e.preventDefault();
  e.stopPropagation();
  performDrop(status, cardId);
}

function performDrop(status: KanbanStatus, beforeId: string | null) {
  const id = draggedId.value;
  draggedId.value = null;
  dropHint.value = null;
  if (!id) return;
  const task = store.taskById(id);
  if (!task || beforeId === id) return;

  const sameColumn = task.status === status;
  // 非手动排序时不允许列内重排，仅允许跨列移动（落到列尾）
  if (sameColumn && store.sortBy !== 'order') return;

  const ids = store
    .tasksInColumn(props.projectId, status)
    .filter((t) => t.id !== id)
    .map((t) => t.id);
  const idx = beforeId ? ids.indexOf(beforeId) : -1;
  if (idx >= 0) ids.splice(idx, 0, id);
  else ids.push(id);

  if (!sameColumn) store.moveTask(id, status);
  store.reorderColumn(props.projectId, status, ids);
}
</script>

<template>
  <section class="space-y-4">
    <!-- 工具栏：排序 + 新建 -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h3 class="text-surface-900 text-sm font-semibold">任务看板</h3>
        <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
          {{ totalCount }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex items-center gap-1.5">
          <select
            v-model="store.sortBy"
            class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2.5 py-1.5 text-xs transition outline-none focus:ring-4"
            aria-label="任务排序方式"
          >
            <option v-for="opt in TASK_SORT_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
          <button
            v-if="store.sortBy !== 'order'"
            type="button"
            class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs transition-colors"
            :title="store.sortDir === 'asc' ? '升序，点击切换' : '降序，点击切换'"
            @click="store.setSort(store.sortBy)"
          >
            <ArrowDownUp class="size-3" />
            {{ store.sortDir === 'asc' ? '升序' : '降序' }}
          </button>
        </div>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          @click="openCreate"
        >
          <Plus class="size-3.5" />
          新建任务
        </button>
      </div>
    </div>

    <!-- 移动端降级：分组任务列表（无拖拽） -->
    <div class="space-y-4 md:hidden">
      <div
        v-for="status in KANBAN_STATUSES"
        :key="status"
        class="border-surface-100 bg-surface-0 rounded-card border p-3"
      >
        <header class="mb-2 flex items-center gap-2">
          <span class="size-2 rounded-full" :class="TASK_STATUS_META[status].dot" />
          <span class="text-surface-900 text-sm font-medium">
            {{ TASK_STATUS_META[status].label }}
          </span>
          <span class="bg-surface-50 text-surface-800/60 ml-auto rounded-full px-2 py-0.5 text-xs">
            {{ tasksFor(status).length }}
          </span>
        </header>
        <div v-if="tasksFor(status).length" class="space-y-2">
          <button
            v-for="task in tasksFor(status)"
            :key="task.id"
            type="button"
            class="border-surface-100 bg-surface-50 hover:border-brand-500/40 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors"
            @click="openEdit(task)"
          >
            <span class="text-surface-900 min-w-0 flex-1 truncate text-sm">{{ task.title }}</span>
            <span
              class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
              :class="TASK_PRIORITY_META[task.priority].badge"
            >
              {{ TASK_PRIORITY_META[task.priority].label }}
            </span>
          </button>
        </div>
        <p v-else class="text-surface-800/40 py-2 text-center text-xs">暂无任务</p>
      </div>
    </div>

    <!-- 桌面看板：三列 + 原生拖拽 -->
    <div class="hidden grid-cols-3 gap-3 md:grid">
      <div
        v-for="status in KANBAN_STATUSES"
        :key="status"
        class="border-surface-100 bg-surface-50/60 rounded-card flex flex-col border"
        @dragover="onColumnDragOver($event, status)"
        @drop="onColumnDrop($event, status)"
      >
        <header class="flex items-center gap-2 px-3 py-2.5">
          <span class="size-2 rounded-full" :class="TASK_STATUS_META[status].dot" />
          <span class="text-surface-900 text-sm font-medium">
            {{ TASK_STATUS_META[status].label }}
          </span>
          <span class="bg-surface-0 text-surface-800/60 ml-auto rounded-full px-2 py-0.5 text-xs">
            {{ tasksFor(status).length }}
          </span>
        </header>
        <div
          class="rounded-b-card min-h-28 flex-1 space-y-2 px-2.5 pb-2.5 transition-colors"
          :class="dropHint?.status === status ? 'bg-brand-500/5' : ''"
        >
          <div
            v-for="task in tasksFor(status)"
            :key="task.id"
            :class="
              dropHint?.status === status && dropHint?.beforeId === task.id
                ? 'border-brand-500 rounded-lg border-t-2'
                : ''
            "
            @dragover="onCardDragOver($event, status, task.id)"
            @drop="onCardDrop($event, status, task.id)"
          >
            <TaskCard
              :task="task"
              @dragstart="onDragStart($event, task.id)"
              @dragend="onDragEnd"
              @edit="openEdit"
              @delete="(t) => (deleting = t)"
            />
          </div>
          <p v-if="!tasksFor(status).length" class="text-surface-800/40 py-6 text-center text-xs">
            拖拽任务到此处
          </p>
        </div>
      </div>
    </div>

    <!-- 新建 / 编辑任务 -->
    <TaskForm
      :open="formOpen"
      :task="editing"
      :project-id="projectId"
      @submit="onFormSubmit"
      @close="formOpen = false"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :open="!!deleting"
      title="删除任务"
      :message="`确定删除任务「${deleting?.title ?? ''}」吗？此操作不可撤销。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />
  </section>
</template>
