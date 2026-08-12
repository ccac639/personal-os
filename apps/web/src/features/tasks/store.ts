/**
 * 任务功能域 —— Pinia store
 *
 * 职责：任务 CRUD、子任务 checklist、活动历史、看板跨列移动与列内重排、
 * 排序策略、截止日期筛选与分组、批量操作（移动 / 优先级 / 标签 / 删除）、
 * 拖拽撤销、逾期统计、本地持久化（纯前端 mock，不调用后端）。
 *
 * 持久化统一走 ./persistence（版本信封 + 严格校验 + 迁移 + 失败降级），
 * 组件不得直接访问 localStorage。
 *
 * 任务事件（创建 / 移动 / 删除 / 子任务）会同步写入所属项目的活动记录，
 * 供项目详情「活动记录」视图展示；任务自身的活动历史写入 events。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { TaskPriority, TaskStatus } from '@personal-os/types';

import { useProjectStore } from '@/features/projects/store';
import { filterTasksByDate } from './filter';
import {
  loadTaskState,
  loadTasksUi,
  saveTaskState,
  saveTasksUi,
  TASKS_VERSION,
} from './persistence';
import { addSubtaskTo, subtaskStats } from './subtasks';
import { TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type {
  TaskDateFilter,
  TaskEvent,
  TaskEventType,
  TaskForm,
  TaskItem,
  TaskSortKey,
  TaskStats,
  TaskSummary,
  UndoInfo,
} from './types';

function uid(prefix = 't-'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function cloneTasks(list: TaskItem[]): TaskItem[] {
  return list.map((t) => ({
    ...t,
    tags: [...t.tags],
    subtasks: t.subtasks.map((s) => ({ ...s })),
  }));
}

export const useTaskStore = defineStore('tasks', () => {
  const loaded = loadTaskState();
  const tasks = ref<TaskItem[]>(loaded.data.tasks);
  const events = ref<TaskEvent[]>(loaded.data.events);
  const storageWarning = ref<string | null>(loaded.notice);

  /** 看板列内排序策略（order = 手动） */
  const sortBy = ref<TaskSortKey>(loaded.data.sortBy);
  const sortDir = ref<'asc' | 'desc'>(loaded.data.sortDir);

  const uiInitial = loadTasksUi();
  /** 截止日期筛选 */
  const dateFilter = ref<TaskDateFilter>(uiInitial.dateFilter);
  /** 视图模式：看板（默认） / 截止日期分组 */
  const viewMode = ref<'kanban' | 'date'>(uiInitial.viewMode);

  function handleSave(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) storageWarning.value = result.reason ?? '本地存储写入失败';
  }

  watch(
    [tasks, events, sortBy, sortDir],
    () => {
      handleSave(
        saveTaskState({
          tasks: tasks.value,
          events: events.value,
          sortBy: sortBy.value,
          sortDir: sortDir.value,
        }),
      );
    },
    { deep: true, flush: 'sync' },
  );

  watch(
    [dateFilter, viewMode],
    () => {
      handleSave(saveTasksUi({ dateFilter: dateFilter.value, viewMode: viewMode.value }));
    },
    { flush: 'sync' },
  );

  const projectStore = useProjectStore();

  // ── 批量选择（瞬态，不持久化） ──

  const selectedIds = ref<Set<string>>(new Set());

  const selectedTasks = computed<TaskItem[]>(() =>
    tasks.value.filter((t) => selectedIds.value.has(t.id)),
  );

  function toggleSelect(id: string): void {
    const next = new Set(selectedIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selectedIds.value = next;
  }

  function clearSelection(): void {
    selectedIds.value = new Set();
  }

  // ── 撤销（单层快照，恢复任务列表到操作前状态） ──

  const undoInfo = ref<UndoInfo | null>(null);
  let undoSnapshot: TaskItem[] | null = null;

  function takeUndo(message: string): void {
    undoSnapshot = cloneTasks(tasks.value);
    undoInfo.value = { message, at: Date.now() };
  }

  /** 撤销上一次移动 / 批量操作，恢复原列与原顺序 */
  function undo(): void {
    if (!undoSnapshot) return;
    tasks.value = undoSnapshot;
    undoSnapshot = null;
    undoInfo.value = null;
  }

  function clearUndo(): void {
    undoSnapshot = null;
    undoInfo.value = null;
  }

  // ── 活动历史 ──

  function recordEvent(taskId: string, type: TaskEventType, title: string): void {
    events.value.push({
      id: uid('e-'),
      taskId,
      type,
      title,
      createdAt: new Date().toISOString(),
    });
  }

  /** 某任务的活动历史（新的在前） */
  function taskEvents(taskId: string): TaskEvent[] {
    return events.value
      .filter((e) => e.taskId === taskId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ── 基础查询 ──

  function taskById(id: string): TaskItem | null {
    return tasks.value.find((t) => t.id === id) ?? null;
  }

  function tasksByProject(projectId: string): TaskItem[] {
    return tasks.value.filter((t) => t.projectId === projectId);
  }

  /** 比较函数：按当前排序策略比较两条任务（order 恒为升序兜底） */
  function compare(a: TaskItem, b: TaskItem): number {
    if (sortBy.value === 'order') return a.order - b.order;
    if (sortBy.value === 'priority') {
      const r = TASK_PRIORITY_META[b.priority].rank - TASK_PRIORITY_META[a.priority].rank;
      return r !== 0 ? r : a.order - b.order;
    }
    if (sortBy.value === 'dueDate') {
      if (!a.dueDate && !b.dueDate) return a.order - b.order;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      return a.order - b.order;
    }
    const ka = String(a[sortBy.value] ?? '');
    const kb = String(b[sortBy.value] ?? '');
    if (ka !== kb) return ka < kb ? -1 : 1;
    return a.order - b.order;
  }

  /** 某项目某状态列的任务（原始，不含日期筛选；已按排序策略排列） */
  function tasksInColumn(projectId: string, status: TaskStatus): TaskItem[] {
    const list = tasks.value.filter((t) => t.projectId === projectId && t.status === status);
    return [...list].sort((a, b) => {
      const r = compare(a, b);
      return sortBy.value === 'order' || sortDir.value === 'asc' ? r : -r;
    });
  }

  /** 看板展示用：列任务再叠加截止日期筛选 */
  function visibleColumnTasks(projectId: string, status: TaskStatus): TaskItem[] {
    return filterTasksByDate(tasksInColumn(projectId, status), dateFilter.value, todayStr());
  }

  function nextOrder(projectId: string, status: TaskStatus): number {
    const col = tasks.value.filter((t) => t.projectId === projectId && t.status === status);
    return col.length ? Math.max(...col.map((t) => t.order)) + 1 : 0;
  }

  // ── CRUD ──

  function createTask(input: TaskForm): TaskItem {
    const now = new Date().toISOString();
    const task: TaskItem = {
      id: uid(),
      projectId: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      priority: input.priority,
      dueDate: input.dueDate || undefined,
      tags: input.tags,
      order: nextOrder(input.projectId ?? '', input.status),
      createdAt: now,
      updatedAt: now,
      subtasks: [],
    };
    tasks.value.push(task);
    recordEvent(task.id, 'created', '创建任务');
    if (task.projectId) {
      projectStore.addActivity(task.projectId, 'task', '创建任务', task.title);
    }
    return task;
  }

  function updateTask(id: string, input: TaskForm): void {
    const t = taskById(id);
    if (!t) return;
    const statusChanged = t.status !== input.status;
    t.title = input.title.trim();
    t.description = input.description?.trim() || undefined;
    t.priority = input.priority;
    t.status = input.status;
    t.dueDate = input.dueDate || undefined;
    t.tags = input.tags;
    // 状态变更时移到目标列末尾
    if (statusChanged) t.order = nextOrder(t.projectId ?? '', t.status);
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'updated', statusChanged ? '更新任务并变更状态' : '更新任务');
  }

  function deleteTask(id: string): void {
    const t = taskById(id);
    if (!t) return;
    takeUndo(`删除任务「${t.title}」`);
    tasks.value = tasks.value.filter((x) => x.id !== id);
    events.value = events.value.filter((e) => e.taskId !== id);
    if (t.projectId) {
      projectStore.addActivity(t.projectId, 'task', '删除任务', t.title);
    }
  }

  /** 删除项目时级联清理其全部任务与事件（不逐条记活动） */
  function removeByProject(projectId: string): void {
    const idSet = new Set(tasks.value.filter((t) => t.projectId === projectId).map((t) => t.id));
    tasks.value = tasks.value.filter((t) => t.projectId !== projectId);
    events.value = events.value.filter((e) => !idSet.has(e.taskId));
  }

  // ── 移动 / 重排（带撤销） ──

  /** 看板跨列移动：追加到目标列末尾，并写入项目活动记录；支持撤销 */
  function moveTask(id: string, status: TaskStatus): void {
    const t = taskById(id);
    if (!t || t.status === status) return;
    takeUndo(`任务移至「${TASK_STATUS_META[status].label}」`);
    t.status = status;
    t.order = nextOrder(t.projectId ?? '', status);
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'moved', `任务移至「${TASK_STATUS_META[status].label}」`);
    if (t.projectId) {
      projectStore.addActivity(
        t.projectId,
        'task',
        `任务移至「${TASK_STATUS_META[status].label}」`,
        t.title,
      );
    }
  }

  /** 列内重排：按传入顺序重写 order（配合拖拽）；支持撤销 */
  function reorderColumn(projectId: string, status: TaskStatus, orderedIds: string[]): void {
    takeUndo('调整任务顺序');
    orderedIds.forEach((id, index) => {
      const t = taskById(id);
      if (t && t.projectId === projectId && t.status === status) t.order = index;
    });
  }

  /** 切换排序：同一键再点一次翻转方向；order 不参与翻转 */
  function setSort(key: TaskSortKey): void {
    if (sortBy.value === key && key !== 'order') {
      sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
      return;
    }
    sortBy.value = key;
    sortDir.value = 'asc';
  }

  // ── 子任务 checklist ──

  function addSubtask(taskId: string, title: string): void {
    const t = taskById(taskId);
    if (!t || !title.trim()) return;
    t.subtasks.push(addSubtaskTo(t, title, new Date().toISOString()));
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'subtask', `添加子任务「${title.trim()}」`);
  }

  function toggleSubtask(taskId: string, subtaskId: string): void {
    const t = taskById(taskId);
    if (!t) return;
    const s = t.subtasks.find((x) => x.id === subtaskId);
    if (!s) return;
    s.done = !s.done;
    t.updatedAt = new Date().toISOString();
    const stats = subtaskStats(t);
    recordEvent(t.id, 'subtask', s.done ? `完成子任务「${s.title}」` : `取消子任务「${s.title}」`);
    // 全部子任务完成时提示（不改变父任务列）
    if (stats.allDone) recordEvent(t.id, 'subtask', '全部子任务已完成');
  }

  function removeSubtask(taskId: string, subtaskId: string): void {
    const t = taskById(taskId);
    if (!t) return;
    const s = t.subtasks.find((x) => x.id === subtaskId);
    if (!s) return;
    t.subtasks = t.subtasks.filter((x) => x.id !== subtaskId);
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'subtask', `删除子任务「${s.title}」`);
  }

  // ── 批量操作（带撤销） ──

  function batchMove(ids: string[], status: TaskStatus): void {
    const targets = ids.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    if (!targets.length) return;
    const existing = targets.filter((t) => t.status === status);
    if (existing.length === targets.length) return;
    takeUndo(`批量移至「${TASK_STATUS_META[status].label}」`);
    const now = new Date().toISOString();
    for (const t of targets) {
      if (t.status === status) continue;
      t.status = status;
      t.order = nextOrder(t.projectId ?? '', status);
      t.updatedAt = now;
      recordEvent(t.id, 'moved', `任务移至「${TASK_STATUS_META[status].label}」`);
      if (t.projectId) {
        projectStore.addActivity(
          t.projectId,
          'task',
          `任务移至「${TASK_STATUS_META[status].label}」`,
          t.title,
        );
      }
    }
  }

  function batchSetPriority(ids: string[], priority: TaskPriority): void {
    const targets = ids.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    if (!targets.length) return;
    const unchanged = targets.every((t) => t.priority === priority);
    if (unchanged) return;
    takeUndo(`批量设置优先级为「${TASK_PRIORITY_META[priority].label}」`);
    const now = new Date().toISOString();
    for (const t of targets) {
      t.priority = priority;
      t.updatedAt = now;
      recordEvent(t.id, 'updated', `优先级设为「${TASK_PRIORITY_META[priority].label}」`);
    }
  }

  function batchAddTag(ids: string[], tag: string): void {
    const trimmed = tag.trim();
    if (!trimmed) return;
    const targets = ids.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    const changed = targets.filter((t) => !t.tags.includes(trimmed));
    if (!changed.length) return;
    takeUndo(`批量添加标签「${trimmed}」`);
    const now = new Date().toISOString();
    for (const t of changed) {
      t.tags = [...t.tags, trimmed];
      t.updatedAt = now;
      recordEvent(t.id, 'updated', `添加标签「${trimmed}」`);
    }
  }

  function batchRemoveTag(ids: string[], tag: string): void {
    const targets = ids.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    const changed = targets.filter((t) => t.tags.includes(tag));
    if (!changed.length) return;
    takeUndo(`批量移除标签「${tag}」`);
    const now = new Date().toISOString();
    for (const t of changed) {
      t.tags = t.tags.filter((x) => x !== tag);
      t.updatedAt = now;
      recordEvent(t.id, 'updated', `移除标签「${tag}」`);
    }
  }

  function batchDelete(ids: string[]): void {
    const targets = ids.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    if (!targets.length) return;
    takeUndo(`批量删除 ${targets.length} 个任务`);
    const idSet = new Set(ids);
    for (const t of targets) {
      if (t.projectId) projectStore.addActivity(t.projectId, 'task', '删除任务', t.title);
    }
    tasks.value = tasks.value.filter((x) => !idSet.has(x.id));
    events.value = events.value.filter((e) => !idSet.has(e.taskId));
  }

  // ── 统计 ──

  function projectStats(projectId: string): TaskStats {
    const list = tasksByProject(projectId);
    const count = (s: TaskStatus) => list.filter((t) => t.status === s).length;
    const done = count('done');
    const nonCancelled = list.length - count('cancelled');
    const overdue = list.filter(
      (t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr(),
    ).length;
    return {
      total: list.length,
      todo: count('todo'),
      inProgress: count('in-progress'),
      done,
      cancelled: count('cancelled'),
      progress: nonCancelled === 0 ? 0 : Math.round((done / nonCancelled) * 100),
      overdue,
    };
  }

  /** 全局任务摘要（首页等只读模块消费，形状向后兼容） */
  const summary = computed<TaskSummary>(() => {
    const count = (s: TaskStatus) => tasks.value.filter((t) => t.status === s).length;
    const done = count('done');
    const nonCancelled = tasks.value.length - count('cancelled');
    return {
      total: tasks.value.length,
      todo: count('todo'),
      inProgress: count('in-progress'),
      done,
      overdue: tasks.value.filter((t) => t.status !== 'done' && t.dueDate && t.dueDate < todayStr())
        .length,
      completion: nonCancelled === 0 ? 0 : Math.round((done / nonCancelled) * 100),
    };
  });

  function dismissStorageWarning(): void {
    storageWarning.value = null;
  }

  return {
    tasks,
    events,
    sortBy,
    sortDir,
    dateFilter,
    viewMode,
    storageWarning,
    selectedIds,
    selectedTasks,
    undoInfo,
    taskById,
    tasksByProject,
    tasksInColumn,
    visibleColumnTasks,
    createTask,
    updateTask,
    deleteTask,
    removeByProject,
    moveTask,
    reorderColumn,
    setSort,
    projectStats,
    summary,
    toggleSelect,
    clearSelection,
    takeUndo,
    undo,
    clearUndo,
    taskEvents,
    addSubtask,
    toggleSubtask,
    removeSubtask,
    batchMove,
    batchSetPriority,
    batchAddTag,
    batchRemoveTag,
    batchDelete,
    dismissStorageWarning,
  };
});

export { TASKS_VERSION };
