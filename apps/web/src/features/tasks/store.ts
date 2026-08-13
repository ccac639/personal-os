/**
 * 任务功能域 —— Pinia store
 *
 * 职责：任务 CRUD、子任务 checklist、前置依赖、活动历史、今日聚焦（上限 5）、
 * 专注计时器（开始 / 暂停 / 完成 / 放弃，记录挂活动历史但不自动完成任务）、
 * 看板跨列移动与列内重排、排序策略、截止日期筛选与分组、批量操作、
 * 拖拽撤销、逾期统计、本地持久化（纯前端 mock，不调用后端）。
 *
 * 持久化统一走 ./persistence（版本信封 + 严格校验 + v1/v2→v3 迁移 +
 * 无效引用清理 + 失败降级），组件不得直接访问 localStorage。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { TaskPriority, TaskStatus } from '@personal-os/types';

import { useProjectStore } from '@/features/projects/store';
import { canAddDependency } from './dependencies';
import { filterTasksByDate } from './filter';
import {
  buildFocusSession,
  dailyFocusMinutes,
  focusEligibleTask,
  focusEventTitle,
  pausedFocus,
  resumedFocus,
} from './focus';
import { archivePlanDay, focusStreak, mergePlanItems, migrateUndone } from './focus';
import {
  BUILTIN_TEMPLATES,
  createCustomTemplate,
  deleteCustomTemplate as removeCustomTemplate,
  loadCustomTemplates,
  saveCustomTemplates,
} from './templates';
import type { TaskTemplate } from './types';
import {
  loadTaskState,
  loadTasksUi,
  saveTaskState,
  saveTasksUi,
  TASKS_VERSION,
} from './persistence';
import { addSubtaskTo, subtaskStats } from './subtasks';
import { FOCUS_MAX, TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type {
  FocusItem,
  FocusPlanDay,
  FocusSession,
  KanbanStatus,
  RunningFocus,
  TaskDateFilter,
  TaskEvent,
  TaskEventType,
  TaskForm,
  TaskItem,
  TaskQuickFilter,
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
    dependsOn: [...t.dependsOn],
  }));
}

export const useTaskStore = defineStore('tasks', () => {
  const projectStore = useProjectStore();
  const validProjectIds = new Set(projectStore.projects.map((p) => p.id));

  const loaded = loadTaskState(validProjectIds);
  const tasks = ref<TaskItem[]>(loaded.data.tasks);
  const events = ref<TaskEvent[]>(loaded.data.events);
  const focus = ref<FocusItem[]>(loaded.data.focus);
  const focusSessions = ref<FocusSession[]>(loaded.data.focusSessions);
  const runningFocus = ref<RunningFocus | null>(loaded.data.runningFocus);
  /** 今日计划已勾选完成的任务 id（独立于看板状态） */
  const focusDone = ref<string[]>(loaded.data.focusDone);
  /** 已归档的日计划（每日计划历史） */
  const focusHistory = ref<FocusPlanDay[]>(loaded.data.focusHistory);
  /** 个人自定义任务模板 */
  const customTemplates = ref<TaskTemplate[]>(loadCustomTemplates());
  const storageWarning = ref<string | null>(loaded.notice);
  const migrationNotice = ref<string | null>(null);

  // 迁移时清理了任务，联动清理里程碑中指向这些任务的引用
  const cleanedMilestoneRefs = projectStore.cleanupMilestoneRefs(
    new Set(tasks.value.map((t) => t.id)),
  );
  const report = loaded.report;
  if (report.cleanedProjectRefs || report.cleanedDependencyRefs || cleanedMilestoneRefs > 0) {
    const parts: string[] = [];
    if (report.cleanedProjectRefs > 0) parts.push(`清理 ${report.cleanedProjectRefs} 条无效任务`);
    if (report.cleanedDependencyRefs > 0)
      parts.push(`清理 ${report.cleanedDependencyRefs} 条无效依赖`);
    if (cleanedMilestoneRefs > 0) parts.push(`清理 ${cleanedMilestoneRefs} 条无效里程碑关联`);
    if (parts.length) migrationNotice.value = `数据迁移已完成：${parts.join('，')}。`;
  }

  /** 看板列内排序策略（order = 手动） */
  const sortBy = ref<TaskSortKey>(loaded.data.sortBy);
  const sortDir = ref<'asc' | 'desc'>(loaded.data.sortDir);

  const uiInitial = loadTasksUi();
  /** 截止日期筛选 */
  const dateFilter = ref<TaskDateFilter>(uiInitial.dateFilter);
  /** 视图模式：看板（默认） / 截止日期分组 */
  const viewMode = ref<'kanban' | 'date'>(uiInitial.viewMode);
  /** 快捷筛选：全部 / 今日聚焦 / 本周到期 / 阻塞 */
  const quickFilter = ref<TaskQuickFilter>(uiInitial.quickFilter);

  function handleSave(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) storageWarning.value = result.reason ?? '本地存储写入失败';
  }

  watch(
    [tasks, events, focus, focusSessions, runningFocus, focusDone, focusHistory, sortBy, sortDir],
    () => {
      handleSave(
        saveTaskState({
          tasks: tasks.value,
          events: events.value,
          sortBy: sortBy.value,
          sortDir: sortDir.value,
          focus: focus.value,
          focusSessions: focusSessions.value,
          runningFocus: runningFocus.value,
          focusDone: focusDone.value,
          focusHistory: focusHistory.value,
        }),
      );
    },
    { deep: true, flush: 'sync' },
  );

  watch(
    [dateFilter, viewMode, quickFilter],
    () => {
      handleSave(
        saveTasksUi({
          dateFilter: dateFilter.value,
          viewMode: viewMode.value,
          quickFilter: quickFilter.value,
        }),
      );
    },
    { flush: 'sync' },
  );

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

  /** 依赖图（任务 id → 任务） */
  const taskMap = computed(() => new Map(tasks.value.map((t) => [t.id, t])));

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

  /** 快捷筛选后的列任务 */
  function applyQuickFilter(list: TaskItem[]): TaskItem[] {
    if (quickFilter.value === 'all') return list;
    if (quickFilter.value === 'focus') {
      const focusIds = new Set(focus.value.map((f) => f.taskId));
      return list.filter((t) => focusIds.has(t.id));
    }
    if (quickFilter.value === 'thisWeek') {
      const today = todayStr();
      const weekEnd = addDays(today, 7);
      return list.filter((t) => t.dueDate && t.dueDate >= today && t.dueDate <= weekEnd);
    }
    if (quickFilter.value === 'blocked') {
      return list.filter((t) => t.status !== 'done' && isBlockedTask(t.id));
    }
    return list;
  }

  function addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00`);
    d.setDate(d.getDate() + days);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function isBlockedTask(id: string): boolean {
    const t = taskById(id);
    if (!t || t.status === 'done') return false;
    return t.dependsOn.some((depId) => {
      const dep = taskById(depId);
      return !dep || dep.status !== 'done';
    });
  }

  /** 看板展示用：列任务再叠加日期筛选与快捷筛选 */
  function visibleColumnTasks(projectId: string, status: TaskStatus): TaskItem[] {
    const byDate = filterTasksByDate(
      tasksInColumn(projectId, status),
      dateFilter.value,
      todayStr(),
    );
    return applyQuickFilter(byDate);
  }

  function nextOrder(projectId: string, status: TaskStatus): number {
    const col = tasks.value.filter((t) => t.projectId === projectId && t.status === status);
    return col.length ? Math.max(...col.map((t) => t.order)) + 1 : 0;
  }

  // ── CRUD ──

  function createTask(input: TaskForm, templateSubtasks?: string[]): TaskItem {
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
      subtasks: templateSubtasks?.length
        ? templateSubtasks
            .map((s) => s.trim())
            .filter(Boolean)
            .map((title) => ({
              id: uid('st-'),
              title,
              done: false,
            }))
        : [],
      dependsOn: [],
      estimatedMinutes:
        input.estimatedMinutes != null &&
        Number.isFinite(input.estimatedMinutes) &&
        input.estimatedMinutes >= 0
          ? Math.round(input.estimatedMinutes)
          : undefined,
      actualMinutes: undefined,
      dod: input.dod?.trim() || undefined,
      blockedReason: input.blockedReason?.trim() || undefined,
    };
    tasks.value.push(task);
    recordEvent(task.id, 'created', '创建任务');
    if (templateSubtasks?.length) {
      recordEvent(task.id, 'subtask', `按模板创建 ${task.subtasks.length} 个子任务`);
    }
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
    t.estimatedMinutes =
      input.estimatedMinutes != null &&
      Number.isFinite(input.estimatedMinutes) &&
      input.estimatedMinutes >= 0
        ? Math.round(input.estimatedMinutes)
        : undefined;
    t.dod = input.dod?.trim() || undefined;
    t.blockedReason = input.blockedReason?.trim() || undefined;
    // 状态变更时移到目标列末尾
    if (statusChanged) t.order = nextOrder(t.projectId ?? '', t.status);
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'updated', statusChanged ? '更新任务并变更状态' : '更新任务');
  }

  /** 删除任务后清理其相关引用（依赖、今日聚焦、专注记录、运行中计时器、里程碑关联） */
  function cleanupTaskRefs(removedIds: Set<string>): void {
    for (const t of tasks.value) {
      if (t.dependsOn.some((d) => removedIds.has(d))) {
        t.dependsOn = t.dependsOn.filter((d) => !removedIds.has(d));
      }
    }
    focus.value = focus.value.filter((f) => !removedIds.has(f.taskId));
    focusSessions.value = focusSessions.value.filter((s) => !removedIds.has(s.taskId));
    focusDone.value = focusDone.value.filter((id) => !removedIds.has(id));
    focusHistory.value = focusHistory.value
      .map((day) => ({
        ...day,
        items: day.items.filter((i) => !removedIds.has(i.taskId)),
        doneIds: day.doneIds.filter((id) => !removedIds.has(id)),
      }))
      .filter((day) => day.items.length > 0 || day.doneIds.length > 0);
    if (runningFocus.value && removedIds.has(runningFocus.value.taskId)) {
      runningFocus.value = null;
    }
    // 里程碑中指向已删除任务的引用一并清理（不产生悬空引用）
    projectStore.cleanupMilestoneRefs(new Set(tasks.value.map((t) => t.id)));
  }

  function deleteTask(id: string): void {
    const t = taskById(id);
    if (!t) return;
    takeUndo(`删除任务「${t.title}」`);
    tasks.value = tasks.value.filter((x) => x.id !== id);
    events.value = events.value.filter((e) => e.taskId !== id);
    cleanupTaskRefs(new Set([id]));
    if (t.projectId) {
      projectStore.addActivity(t.projectId, 'task', '删除任务', t.title);
    }
  }

  /** 删除项目：cascade=级联删除全部任务；to-inbox=任务转入收件箱（保留数据）
   * 删除是永久操作，不设撤销；归档流程的「转入收件箱」见 moveProjectTasksToInbox。 */
  function removeByProject(projectId: string, mode: 'cascade' | 'to-inbox' = 'cascade'): void {
    const idSet = new Set(tasks.value.filter((t) => t.projectId === projectId).map((t) => t.id));
    if (mode === 'to-inbox') {
      const now = new Date().toISOString();
      for (const t of tasks.value) {
        if (t.projectId !== projectId) continue;
        t.projectId = undefined;
        t.order = nextOrder('', t.status);
        t.updatedAt = now;
        recordEvent(t.id, 'updated', '项目删除，任务转入收件箱');
      }
      return;
    }
    tasks.value = tasks.value.filter((t) => t.projectId !== projectId);
    events.value = events.value.filter((e) => !idSet.has(e.taskId));
    cleanupTaskRefs(idSet);
  }

  /** 归档流程：项目全部任务转入收件箱（可撤销一次；任务实体与专注记录保留） */
  function moveProjectTasksToInbox(projectId: string): number {
    const list = tasks.value.filter((t) => t.projectId === projectId);
    if (!list.length) return 0;
    takeUndo(`归档「转入收件箱」${list.length} 个任务`);
    const now = new Date().toISOString();
    for (const t of list) {
      t.projectId = undefined;
      t.order = nextOrder('', t.status);
      t.updatedAt = now;
      recordEvent(t.id, 'updated', '归档：任务转入收件箱');
    }
    return list.length;
  }

  // ── 收件箱（未归属项目任务） ──

  /** 收件箱任务：projectId 为空（未归属任何项目） */
  const inboxTasks = computed<TaskItem[]>(() =>
    tasks.value.filter((t) => !t.projectId).sort((a, b) => compare(a, b)),
  );

  /** 收件箱按状态分组（todo / in-progress / done；cancelled 不显示） */
  const inboxGrouped = computed<Record<KanbanStatus, TaskItem[]>>(() => {
    const out: Record<KanbanStatus, TaskItem[]> = { todo: [], 'in-progress': [], done: [] };
    for (const t of inboxTasks.value) {
      if (t.status === 'cancelled') continue;
      out[t.status as KanbanStatus].push(t);
    }
    return out;
  });

  /** 批量分配到项目（带撤销；分配后进入目标项目对应列末尾） */
  function assignToProject(taskIds: string[], projectId: string): number {
    const targets = taskIds.map((id) => taskById(id)).filter((t): t is TaskItem => t !== null);
    const changed = targets.filter((t) => t.projectId !== projectId);
    if (!changed.length) return 0;
    takeUndo(`分配 ${changed.length} 个任务到项目`);
    const now = new Date().toISOString();
    const p = projectStore.projectById(projectId);
    for (const t of changed) {
      t.projectId = projectId;
      t.order = nextOrder(projectId, t.status);
      t.updatedAt = now;
      recordEvent(t.id, 'updated', `分配到项目「${p?.name ?? projectId}」`);
      projectStore.addActivity(projectId, 'task', '任务分配入项目', t.title);
    }
    return changed.length;
  }

  /** 收件箱任务转入今日计划（未在计划中才加入；focus 变化不做任务级撤销） */
  function addInboxToFocus(taskIds: string[]): number {
    const inFocus = new Set(focus.value.map((f) => f.taskId));
    const changed = taskIds.filter(
      (id) => !inFocus.has(id) && tasks.value.some((t) => t.id === id),
    );
    if (!changed.length) return 0;
    focus.value = [...focus.value, ...changed.map((taskId) => ({ taskId, plannedMinutes: 25 }))];
    const now = new Date().toISOString();
    for (const id of changed) {
      const t = taskById(id);
      if (t) {
        t.updatedAt = now;
        recordEvent(id, 'focus', '加入今日计划');
      }
    }
    return changed.length;
  }

  /** 批量导入任务（id 已由 parseTasksJson 重新生成，无冲突；追加到各自状态列末尾） */
  function importTasks(list: TaskItem[]): number {
    const now = new Date().toISOString();
    for (const t of list) {
      const order = nextOrder(t.projectId ?? '', t.status);
      tasks.value.push({ ...t, order, updatedAt: now });
      recordEvent(t.id, 'created', '导入任务');
      if (t.projectId) {
        projectStore.addActivity(t.projectId, 'task', '导入任务', t.title);
      }
    }
    return list.length;
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

  // ── 前置依赖 ──

  /** 添加前置依赖；违反自依赖 / 重复 / 循环 / 不存在时拒绝并返回原因 */
  function addDependency(taskId: string, depId: string): { ok: boolean; reason?: string } {
    const t = taskById(taskId);
    if (!t) return { ok: false, reason: '任务不存在' };
    const result = canAddDependency(t, depId, taskMap.value);
    if (!result.ok) return result;
    t.dependsOn = [...t.dependsOn, depId];
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'updated', `添加前置依赖「${taskById(depId)?.title ?? depId}」`);
    return { ok: true };
  }

  function removeDependency(taskId: string, depId: string): void {
    const t = taskById(taskId);
    if (!t) return;
    if (!t.dependsOn.includes(depId)) return;
    t.dependsOn = t.dependsOn.filter((d) => d !== depId);
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'updated', `移除前置依赖「${taskById(depId)?.title ?? depId}」`);
  }

  // ── 今日聚焦（上限 5，跨项目） ──

  const focusTasks = computed<TaskItem[]>(() => {
    const byId = taskMap.value;
    return focus.value.map((f) => byId.get(f.taskId)).filter((t): t is TaskItem => t !== null);
  });

  /** 加入今日聚焦；任务不存在 / 已完成 / 已取消 / 所在项目已归档时拒绝 */
  function addToFocus(taskId: string, plannedMinutes: number): boolean {
    const t = taskById(taskId);
    if (!t) return false;
    if (!focusEligibleTask(t)) return false;
    const project = t.projectId ? projectStore.projectById(t.projectId) : null;
    if (project && project.status === 'archived') return false;
    const existing = focus.value.find((f) => f.taskId === taskId);
    const minutes = Math.max(0, Math.round(plannedMinutes)) || 25;
    if (existing) {
      existing.plannedMinutes = minutes;
      return true;
    }
    if (focus.value.length >= FOCUS_MAX) return false;
    focus.value.push({ taskId, plannedMinutes: minutes });
    return true;
  }

  function removeFromFocus(taskId: string): void {
    focus.value = focus.value.filter((f) => f.taskId !== taskId);
  }

  /** 手动调整今日聚焦顺序（from/to 为当前列表下标） */
  function reorderFocus(from: number, to: number): void {
    const list = focus.value;
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    const [item] = list.splice(from, 1);
    if (!item) return;
    list.splice(to, 0, item);
  }

  /** 今日累计专注分钟数（按 endedAt 归属当天） */
  const todayFocusMinutes = computed(() => dailyFocusMinutes(focusSessions.value, todayStr()));

  /** 计时器异常恢复：清空运行中计时器（任务缺失 / 已完成时使用） */
  function resetRunningFocus(): void {
    runningFocus.value = null;
  }

  /** 任务累计专注分钟数 */
  function taskFocusMinutes(taskId: string): number {
    return focusSessions.value
      .filter((s) => s.taskId === taskId)
      .reduce((sum, s) => sum + s.minutes, 0);
  }

  /** 任务最后专注时间（ISO 或 null） */
  function lastFocusAt(taskId: string): string | null {
    let last: string | null = null;
    for (const s of focusSessions.value) {
      if (s.taskId === taskId && (!last || s.endedAt > last)) last = s.endedAt;
    }
    return last;
  }

  // ── 专注计时器 ──

  function startFocus(taskId: string): boolean {
    const t = taskById(taskId);
    if (!t) return false;
    if (runningFocus.value) {
      // 同一任务视为继续；不同任务拒绝并提示
      return runningFocus.value.taskId === taskId;
    }
    const now = new Date().toISOString();
    runningFocus.value = {
      taskId,
      startedAt: now,
      accumulatedMs: 0,
      status: 'running',
      lastResumeAt: now,
    };
    return true;
  }

  function pauseFocus(): void {
    if (!runningFocus.value || runningFocus.value.status !== 'running') return;
    runningFocus.value = pausedFocus(runningFocus.value, Date.now());
  }

  function resumeFocus(): void {
    if (!runningFocus.value || runningFocus.value.status !== 'paused') return;
    runningFocus.value = resumedFocus(runningFocus.value, Date.now());
  }

  /** 完成专注：记录到 sessions 与活动历史，实际投入自动累加，但不改变任务状态 */
  function completeFocus(): FocusSession | null {
    if (!runningFocus.value) return null;
    const session = buildFocusSession(runningFocus.value, 'completed', Date.now());
    focusSessions.value.push(session);
    recordEvent(session.taskId, 'focus', focusEventTitle(session));
    runningFocus.value = null;
    accumulateActual(session.taskId, session.minutes);
    return session;
  }

  /** 放弃专注：同样记录（status=abandoned），实际投入同样累加，不改变任务状态 */
  function abandonFocus(): FocusSession | null {
    if (!runningFocus.value) return null;
    const session = buildFocusSession(runningFocus.value, 'abandoned', Date.now());
    focusSessions.value.push(session);
    recordEvent(session.taskId, 'focus', focusEventTitle(session));
    runningFocus.value = null;
    accumulateActual(session.taskId, session.minutes);
    return session;
  }

  /** 专注结算后把分钟数累加到任务实际投入（手动覆盖过的值同样累加，偏差可在抽屉修正） */
  function accumulateActual(taskId: string, minutes: number): void {
    const t = taskById(taskId);
    if (!t) return;
    t.actualMinutes = (t.actualMinutes ?? 0) + minutes;
  }

  /** 手动覆盖任务实际投入（分钟；0 清空） */
  function setActualMinutes(taskId: string, minutes: number): void {
    const t = taskById(taskId);
    if (!t) return;
    const value = Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes) : 0;
    t.actualMinutes = value > 0 ? value : undefined;
    t.updatedAt = new Date().toISOString();
    recordEvent(t.id, 'updated', value > 0 ? `调整实际投入为 ${value} 分钟` : '清空实际投入');
  }

  // ── 每日计划（今日聚焦升级） ──

  function isPlanDone(taskId: string): boolean {
    return focusDone.value.includes(taskId);
  }

  /** 勾选 / 取消今日计划完成（独立于看板状态） */
  function togglePlanDone(taskId: string): void {
    focusDone.value = isPlanDone(taskId)
      ? focusDone.value.filter((id) => id !== taskId)
      : [...focusDone.value, taskId];
  }

  /** 今日计划完成列表（含任务信息） */
  const planDoneTasks = computed<TaskItem[]>(() => {
    const byId = taskMap.value;
    return focusDone.value.map((id) => byId.get(id)).filter((t): t is TaskItem => t !== null);
  });

  /** 最近一个历史日（无记录时为 null） */
  const latestHistoryDay = computed<FocusPlanDay | null>(() => focusHistory.value[0] ?? null);

  /** 最近历史日的未完成项（供「迁移未完成到今天」提示与操作） */
  const pendingRollover = computed<FocusItem[]>(() =>
    latestHistoryDay.value ? migrateUndone(latestHistoryDay.value) : [],
  );

  /** 连续专注天数（按完成专注记录逐日回溯） */
  const focusStreakDays = computed(() => focusStreak(focusSessions.value, todayStr()));

  /** 归档今天：把今日计划（含完成状态）写入历史，清空今日 */
  function archiveToday(): void {
    const day = archivePlanDay(todayStr(), focus.value, focusDone.value);
    focusHistory.value = [day, ...focusHistory.value.filter((h) => h.date !== day.date)];
    focus.value = [];
    focusDone.value = [];
  }

  /** 把最近历史日的未完成项迁移到今天（去重合并；不修改历史记录） */
  function rolloverPending(): number {
    const source = latestHistoryDay.value;
    if (!source) return 0;
    const undone = migrateUndone(source);
    const merged = mergePlanItems(focus.value, undone);
    if (merged.length === focus.value.length) return 0;
    const added = merged.length - focus.value.length;
    focus.value = merged;
    return added;
  }

  /** 从模板创建（应用模板值；subtasks 由组件直接调用 addSubtask 填充） */
  function templateFor(templateId: string): TaskTemplate | null {
    return (
      [...customTemplates.value, ...BUILTIN_TEMPLATES].find((t) => t.id === templateId) ?? null
    );
  }

  /** 保存个人自定义模板（从当前任务表单内容提取） */
  function saveCustomTemplate(input: Omit<TaskTemplate, 'id' | 'builtin'>): {
    ok: boolean;
    reason?: string;
  } {
    const result = createCustomTemplate(customTemplates.value, input);
    customTemplates.value = result.list;
    const saved = saveCustomTemplates(customTemplates.value);
    if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    return saved;
  }

  /** 删除自定义模板（内置不可删） */
  function removeCustomTemplateById(id: string): boolean {
    const result = removeCustomTemplate(customTemplates.value, id);
    if (!result.removed) return false;
    customTemplates.value = result.list;
    const saved = saveCustomTemplates(customTemplates.value);
    if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    return true;
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
    cleanupTaskRefs(idSet);
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

  function dismissMigrationNotice(): void {
    migrationNotice.value = null;
  }

  return {
    tasks,
    events,
    focus,
    focusSessions,
    runningFocus,
    focusDone,
    focusHistory,
    customTemplates,
    inboxTasks,
    inboxGrouped,
    assignToProject,
    moveProjectTasksToInbox,
    addInboxToFocus,
    sortBy,
    sortDir,
    dateFilter,
    viewMode,
    quickFilter,
    storageWarning,
    migrationNotice,
    selectedIds,
    selectedTasks,
    undoInfo,
    focusTasks,
    todayFocusMinutes,
    focusStreakDays,
    planDoneTasks,
    latestHistoryDay,
    pendingRollover,
    taskById,
    tasksByProject,
    tasksInColumn,
    visibleColumnTasks,
    isBlockedTask,
    taskFocusMinutes,
    lastFocusAt,
    createTask,
    updateTask,
    deleteTask,
    removeByProject,
    importTasks,
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
    addDependency,
    removeDependency,
    addToFocus,
    removeFromFocus,
    reorderFocus,
    resetRunningFocus,
    isPlanDone,
    togglePlanDone,
    archiveToday,
    rolloverPending,
    setActualMinutes,
    templateFor,
    saveCustomTemplate,
    removeCustomTemplateById,
    startFocus,
    pauseFocus,
    resumeFocus,
    completeFocus,
    abandonFocus,
    batchMove,
    batchSetPriority,
    batchAddTag,
    batchRemoveTag,
    batchDelete,
    dismissStorageWarning,
    dismissMigrationNotice,
  };
});

export { TASKS_VERSION };
