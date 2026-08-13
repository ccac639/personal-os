<script setup lang="ts">
import {
  ArrowDownUp,
  CalendarDays,
  Check,
  Circle,
  Columns3,
  ListFilter,
  Plus,
  Rows3,
  Square,
  Undo2,
  X,
} from '@lucide/vue';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import ConfirmDialog from '@/features/projects/confirm-dialog.vue';
import { classifyKanbanKey, isEditableTarget } from './keyboard';
import BatchToolbar from './batch-toolbar.vue';
import FocusPanel from './focus-panel.vue';
import { useTaskStore } from './store';
import TaskCard from './task-card.vue';
import TaskDrawer from './task-drawer.vue';
import TaskForm from './task-form.vue';
import { groupTasksByDue } from './filter';
import {
  DUE_GROUPS,
  KANBAN_STATUSES,
  TASK_DATE_FILTERS,
  TASK_PRIORITY_META,
  TASK_QUICK_FILTERS,
  TASK_SORT_OPTIONS,
  TASK_STATUS_META,
} from './types';
import type { KanbanStatus, TaskForm as TaskFormData, TaskItem } from './types';

const props = defineProps<{
  projectId: string;
  /** 只读模式（归档项目）：禁止新建 / 编辑 / 拖拽 / 批量操作 */
  readonly?: boolean;
}>();

const store = useTaskStore();

const formOpen = ref(false);
const editing = ref<TaskItem | null>(null);
const deleting = ref<TaskItem | null>(null);
const batchDeleting = ref<string[] | null>(null);

/** 拖拽中的任务 id */
const draggedId = ref<string | null>(null);
/** 当前悬停落点：目标列 + 插入位置（beforeId 为空 = 列尾） */
const dropHint = ref<{ status: KanbanStatus; beforeId: string | null } | null>(null);

/** 当前选中任务（抽屉打开 / 键盘操作目标） */
const activeTaskId = ref<string | null>(null);
/** 抽屉开关 */
const drawerOpen = ref(false);
/** 移动端筛选底部抽屉 */
const mobileFiltersOpen = ref(false);

const today = (() => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
})();

const todoTasks = computed(() => store.visibleColumnTasks(props.projectId, 'todo'));
const doingTasks = computed(() => store.visibleColumnTasks(props.projectId, 'in-progress'));
const doneTasks = computed(() => store.visibleColumnTasks(props.projectId, 'done'));

/** 日期视图：全部未取消任务按截止分组 */
const dateGroups = computed(() => {
  const list = store.tasksByProject(props.projectId).filter((t) => t.status !== 'cancelled');
  return groupTasksByDue(list, today);
});

const totalCount = computed(() => store.tasksByProject(props.projectId).length);

function tasksFor(status: KanbanStatus) {
  if (status === 'todo') return todoTasks.value;
  if (status === 'in-progress') return doingTasks.value;
  return doneTasks.value;
}

function openCreate() {
  if (props.readonly) return;
  editing.value = null;
  formOpen.value = true;
}

function openEdit(task: TaskItem) {
  if (props.readonly) return;
  editing.value = task;
  activeTaskId.value = task.id;
  formOpen.value = true;
  drawerOpen.value = false;
}

function openDrawer(task: TaskItem) {
  activeTaskId.value = task.id;
  drawerOpen.value = true;
}

function onFormSubmit(form: TaskFormData) {
  if (editing.value) store.updateTask(editing.value.id, form);
  else store.createTask(form, form.subtasks);
  formOpen.value = false;
}

function confirmDelete() {
  if (deleting.value) {
    store.deleteTask(deleting.value.id);
    if (activeTaskId.value === deleting.value.id) activeTaskId.value = null;
    deleting.value = null;
  }
}

function confirmBatchDelete() {
  if (batchDeleting.value) store.batchDelete(batchDeleting.value);
  batchDeleting.value = null;
  store.clearSelection();
}

/** 移动端「完成任务」快捷切换（有撤销） */
function toggleDone(task: TaskItem) {
  store.moveTask(task.id, task.status === 'done' ? 'todo' : 'done');
}

// ── 键盘快捷键（N 新建 / E 编辑 / Delete 删除 / Escape 退出） ──

function onKeydown(e: KeyboardEvent) {
  const action = classifyKanbanKey({
    key: e.key,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    editable: isEditableTarget(e.target),
  });
  if (action === 'none') return;
  e.preventDefault();
  if (action === 'escape') {
    if (drawerOpen.value) drawerOpen.value = false;
    else if (formOpen.value) formOpen.value = false;
    else if (deleting.value) deleting.value = null;
    else if (batchDeleting.value) batchDeleting.value = null;
    else {
      activeTaskId.value = null;
      store.clearSelection();
    }
    return;
  }
  if (action === 'create') {
    if (props.readonly) return;
    openCreate();
    return;
  }
  const target = activeTaskId.value ? store.taskById(activeTaskId.value) : null;
  if (props.readonly) return;
  if (action === 'edit' && target) openEdit(target);
  if (action === 'delete' && target) deleting.value = target;
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));

// ── 撤销提示（拖拽 / 批量操作反馈） ──

let undoHideTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => store.undoInfo,
  (info) => {
    if (!info) return;
    if (undoHideTimer) clearTimeout(undoHideTimer);
    undoHideTimer = setTimeout(() => store.clearUndo(), 5000);
  },
);

// ── 原生 HTML Drag and Drop ──

function onDragStart(e: DragEvent, taskId: string) {
  if (props.readonly) {
    e.preventDefault();
    return;
  }
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
  if (props.readonly) return;
  performDrop(status, null);
}

function onCardDrop(e: DragEvent, status: KanbanStatus, cardId: string) {
  e.preventDefault();
  e.stopPropagation();
  if (props.readonly) return;
  performDrop(status, cardId);
}

/** 是否允许列内精确定位（手动排序且未启用日期筛选） */
const canReorderInColumn = computed(() => store.sortBy === 'order' && store.dateFilter === 'all');

function performDrop(status: KanbanStatus, beforeId: string | null) {
  const id = draggedId.value;
  draggedId.value = null;
  dropHint.value = null;
  if (!id) return;
  const task = store.taskById(id);
  if (!task || beforeId === id) return;

  const sameColumn = task.status === status;
  // 非手动排序或日期筛选激活时，同列重排无效（仅允许跨列追加到列尾）
  if (sameColumn && !canReorderInColumn.value) return;

  const ids = store
    .tasksInColumn(props.projectId, status)
    .filter((t) => t.id !== id)
    .map((t) => t.id);
  if (canReorderInColumn.value) {
    const idx = beforeId ? ids.indexOf(beforeId) : -1;
    if (idx >= 0) ids.splice(idx, 0, id);
    else ids.push(id);
  } else {
    ids.push(id);
  }

  if (!sameColumn) store.moveTask(id, status);
  if (canReorderInColumn.value) store.reorderColumn(props.projectId, status, ids);
}
</script>

<template>
  <section class="space-y-4">
    <!-- 统一筛选工具栏（桌面端内联；移动端收纳为底部抽屉） -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <h3 class="text-surface-900 text-sm font-semibold">任务</h3>
        <span class="bg-surface-50 text-surface-800/60 rounded-full px-2 py-0.5 text-xs">
          {{ totalCount }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- 移动端：筛选入口（打开底部抽屉） -->
        <button
          type="button"
          class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors md:hidden"
          aria-label="打开筛选"
          @click="mobileFiltersOpen = true"
        >
          <ListFilter class="size-3.5" />
          筛选
        </button>
        <button
          v-if="!props.readonly"
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
          title="新建任务（N）"
          aria-label="新建任务"
          @click="openCreate"
        >
          <Plus class="size-3.5" />
          新建任务
        </button>
      </div>
    </div>

    <!-- 桌面端统一工具栏：视图 + 排序 + 截止日期 + 快捷筛选 + 密度 -->
    <div
      class="border-surface-100 bg-surface-0 hidden flex-wrap items-center gap-1.5 rounded-xl border p-2 md:flex"
      role="toolbar"
      aria-label="任务筛选工具栏"
    >
      <div
        class="border-surface-100 flex items-center gap-0.5 rounded-lg border p-0.5"
        role="group"
        aria-label="视图切换"
      >
        <button
          type="button"
          class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          :class="
            store.viewMode === 'kanban'
              ? 'bg-brand-600 text-surface-0'
              : 'text-surface-800/60 hover:text-surface-900'
          "
          title="看板视图"
          aria-label="看板视图"
          @click="store.viewMode = 'kanban'"
        >
          <Columns3 class="size-3.5" />
          看板
        </button>
        <button
          type="button"
          class="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          :class="
            store.viewMode === 'date'
              ? 'bg-brand-600 text-surface-0'
              : 'text-surface-800/60 hover:text-surface-900'
          "
          title="按截止日期分组"
          aria-label="按截止日期分组"
          @click="store.viewMode = 'date'"
        >
          <CalendarDays class="size-3.5" />
          日期
        </button>
      </div>

      <select
        v-model="store.sortBy"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
        aria-label="任务排序方式"
      >
        <option v-for="opt in TASK_SORT_OPTIONS" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <button
        v-if="store.sortBy !== 'order'"
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors"
        :title="store.sortDir === 'asc' ? '升序，点击切换' : '降序，点击切换'"
        aria-label="切换排序方向"
        @click="store.setSort(store.sortBy)"
      >
        <ArrowDownUp class="size-3" />
        {{ store.sortDir === 'asc' ? '升序' : '降序' }}
      </button>

      <select
        v-model="store.dateFilter"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
        aria-label="截止日期筛选"
      >
        <option v-for="opt in TASK_DATE_FILTERS" :key="opt.value" :value="opt.value">
          截止：{{ opt.label }}
        </option>
      </select>

      <select
        v-model="store.quickFilter"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
        aria-label="快捷筛选"
      >
        <option v-for="opt in TASK_QUICK_FILTERS" :key="opt.value" :value="opt.value">
          快捷：{{ opt.label }}
        </option>
      </select>

      <button
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors"
        :title="store.density === 'dense' ? '切换为常规密度' : '切换为高密度'"
        :aria-label="store.density === 'dense' ? '切换为常规密度' : '切换为高密度'"
        @click="store.density = store.density === 'dense' ? 'comfortable' : 'dense'"
      >
        <Rows3 class="size-3" />
        {{ store.density === 'dense' ? '紧凑' : '常规' }}
      </button>
    </div>

    <!-- 移动端筛选底部抽屉 -->
    <div
      v-if="mobileFiltersOpen"
      class="fixed inset-0 z-40 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="任务筛选"
    >
      <div class="bg-surface-900/30 absolute inset-0" @click="mobileFiltersOpen = false" />
      <div
        class="border-surface-100 bg-surface-0 shadow-float absolute inset-x-0 bottom-0 rounded-t-2xl border p-4"
      >
        <div class="mb-3 flex items-center justify-between">
          <h3 class="text-surface-900 text-sm font-semibold">筛选</h3>
          <button
            type="button"
            class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 flex items-center gap-1 rounded-lg px-2 py-1 text-xs transition-colors"
            aria-label="关闭筛选"
            @click="mobileFiltersOpen = false"
          >
            <X class="size-3.5" />
            完成
          </button>
        </div>
        <div class="space-y-3">
          <div class="flex items-center gap-1.5">
            <span class="text-surface-800/50 w-14 shrink-0 text-xs">视图</span>
            <div
              class="border-surface-100 flex items-center gap-0.5 rounded-lg border p-0.5"
              role="group"
              aria-label="视图切换"
            >
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                :class="
                  store.viewMode === 'kanban'
                    ? 'bg-brand-600 text-surface-0'
                    : 'text-surface-800/60 hover:text-surface-900'
                "
                aria-label="看板视图"
                @click="store.viewMode = 'kanban'"
              >
                看板
              </button>
              <button
                type="button"
                class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
                :class="
                  store.viewMode === 'date'
                    ? 'bg-brand-600 text-surface-0'
                    : 'text-surface-800/60 hover:text-surface-900'
                "
                aria-label="按截止日期分组"
                @click="store.viewMode = 'date'"
              >
                日期
              </button>
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-surface-800/50 w-14 shrink-0 text-xs">排序</span>
            <select
              v-model="store.sortBy"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
              aria-label="任务排序方式"
            >
              <option v-for="opt in TASK_SORT_OPTIONS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
            <button
              v-if="store.sortBy !== 'order'"
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs transition-colors"
              aria-label="切换排序方向"
              @click="store.setSort(store.sortBy)"
            >
              <ArrowDownUp class="size-3" />
            </button>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-surface-800/50 w-14 shrink-0 text-xs">截止</span>
            <select
              v-model="store.dateFilter"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
              aria-label="截止日期筛选"
            >
              <option v-for="opt in TASK_DATE_FILTERS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-surface-800/50 w-14 shrink-0 text-xs">快捷</span>
            <select
              v-model="store.quickFilter"
              class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
              aria-label="快捷筛选"
            >
              <option v-for="opt in TASK_QUICK_FILTERS" :key="opt.value" :value="opt.value">
                {{ opt.label }}
              </option>
            </select>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-surface-800/50 w-14 shrink-0 text-xs">密度</span>
            <button
              type="button"
              class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
              :aria-label="store.density === 'dense' ? '切换为常规密度' : '切换为高密度'"
              @click="store.density = store.density === 'dense' ? 'comfortable' : 'dense'"
            >
              <Rows3 class="size-3" />
              {{ store.density === 'dense' ? '紧凑' : '常规' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 今日聚焦面板（跨项目，最多 5 个） -->
    <FocusPanel :project-id="projectId" />

    <!-- 日期分组视图 -->
    <div v-if="store.viewMode === 'date'" class="space-y-4">
      <div
        v-for="g in dateGroups"
        :key="g.group"
        class="border-surface-100 bg-surface-0 rounded-card border p-3"
      >
        <header class="mb-2 flex items-center gap-2">
          <span
            class="size-2 rounded-full"
            :class="g.group === 'overdue' ? 'bg-red-500' : 'bg-brand-500'"
          />
          <span class="text-surface-900 text-sm font-medium">
            {{ DUE_GROUPS.find((x) => x.value === g.group)?.label }}
          </span>
          <span class="bg-surface-50 text-surface-800/60 ml-auto rounded-full px-2 py-0.5 text-xs">
            {{ g.tasks.length }}
          </span>
        </header>
        <div class="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <TaskCard
            v-for="task in g.tasks"
            :key="task.id"
            :task="task"
            :dense="store.density === 'dense'"
            :selected="store.selectedIds.has(task.id)"
            :selectable="true"
            @open="openDrawer"
            @select="(t) => store.toggleSelect(t.id)"
            @edit="openEdit"
            @delete="(t) => (deleting = t)"
          />
        </div>
        <p v-if="!g.tasks.length" class="text-surface-800/40 py-2 text-center text-xs">暂无任务</p>
      </div>
    </div>

    <!-- 移动端降级：分组任务列表（核心操作保留） -->
    <template v-else>
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
            <span
              class="bg-surface-50 text-surface-800/60 ml-auto rounded-full px-2 py-0.5 text-xs"
            >
              {{ tasksFor(status).length }}
            </span>
          </header>
          <div v-if="tasksFor(status).length" class="space-y-2">
            <div
              v-for="task in tasksFor(status)"
              :key="task.id"
              class="border-surface-100 bg-surface-50 hover:border-brand-500/40 flex w-full items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors"
              :class="store.selectedIds.has(task.id) ? 'border-brand-500/60' : ''"
            >
              <button
                type="button"
                class="text-surface-800/40 hover:text-brand-600 shrink-0 transition-colors"
                :aria-label="
                  store.selectedIds.has(task.id) ? `取消选择：${task.title}` : `选择：${task.title}`
                "
                @click="store.toggleSelect(task.id)"
              >
                <Check v-if="store.selectedIds.has(task.id)" class="text-brand-600 size-4" />
                <Square class="size-4" />
              </button>
              <button
                type="button"
                class="min-w-0 flex-1 truncate text-left text-sm"
                :class="
                  task.status === 'done' ? 'text-surface-800/40 line-through' : 'text-surface-900'
                "
                @click="openDrawer(task)"
              >
                {{ task.title }}
              </button>
              <span
                class="shrink-0 rounded px-1.5 py-0.5 text-xs font-medium"
                :class="TASK_PRIORITY_META[task.priority].badge"
              >
                {{ TASK_PRIORITY_META[task.priority].label }}
              </span>
              <button
                type="button"
                class="text-surface-800/40 shrink-0 transition-colors hover:text-green-600"
                :aria-label="
                  task.status === 'done' ? `移回待办：${task.title}` : `标记完成：${task.title}`
                "
                :title="task.status === 'done' ? '移回待办' : '标记完成'"
                @click="toggleDone(task)"
              >
                <Check v-if="task.status === 'done'" class="size-4" />
                <Circle v-else class="size-4" />
              </button>
            </div>
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
                :dense="store.density === 'dense'"
                :selected="store.selectedIds.has(task.id)"
                :selectable="true"
                @dragstart="onDragStart($event, task.id)"
                @dragend="onDragEnd"
                @open="openDrawer"
                @select="(t) => store.toggleSelect(t.id)"
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
    </template>

    <p class="text-surface-800/40 text-xs">
      快捷键：N 新建 · E 编辑 · Delete 删除 · Esc 退出；拖拽可跨列移动，操作后可撤销。
    </p>

    <!-- 批量操作工具栏 -->
    <BatchToolbar
      v-if="store.selectedTasks.length > 0 && !props.readonly"
      @delete="(ids) => (batchDeleting = ids)"
    />

    <!-- 撤销提示 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-2 opacity-0"
    >
      <div
        v-if="store.undoInfo"
        class="shadow-float border-brand-100 bg-surface-0 fixed right-4 bottom-4 z-30 flex items-center gap-2 rounded-xl border px-4 py-2.5"
        role="status"
        aria-live="polite"
      >
        <Undo2 class="text-brand-600 size-4" />
        <span class="text-surface-900 text-sm">{{ store.undoInfo.message }}</span>
        <button
          type="button"
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors"
          title="撤销上一步操作"
          aria-label="撤销上一步操作"
          @click="store.undo()"
        >
          撤销
        </button>
        <button
          type="button"
          class="text-surface-800/40 hover:text-surface-900 rounded p-1 transition-colors"
          aria-label="关闭提示"
          title="关闭"
          @click="store.clearUndo()"
        >
          <X class="size-3.5" />
        </button>
      </div>
    </Transition>

    <!-- 新建 / 编辑任务 -->
    <TaskForm
      :open="formOpen"
      :task="editing"
      :project-id="projectId"
      @submit="onFormSubmit"
      @close="formOpen = false"
    />

    <!-- 任务详情抽屉 -->
    <TaskDrawer
      :task-id="activeTaskId"
      :open="drawerOpen"
      @close="drawerOpen = false"
      @edit="
        (id) => {
          const t = store.taskById(id);
          if (t) openEdit(t);
        }
      "
      @delete="
        (id) => {
          const t = store.taskById(id);
          if (t) deleting = t;
        }
      "
      @jump="(id) => (activeTaskId = id)"
    />

    <!-- 删除确认 -->
    <ConfirmDialog
      :open="!!deleting"
      title="删除任务"
      :message="`确定删除任务「${deleting?.title ?? ''}」吗？此操作可撤销。`"
      confirm-text="删除"
      danger
      @confirm="confirmDelete"
      @cancel="deleting = null"
    />

    <!-- 批量删除确认 -->
    <ConfirmDialog
      :open="!!batchDeleting"
      title="批量删除任务"
      :message="`确定删除选中的 ${batchDeleting?.length ?? 0} 个任务吗？此操作可撤销。`"
      confirm-text="删除"
      danger
      @confirm="confirmBatchDelete"
      @cancel="batchDeleting = null"
    />
  </section>
</template>
