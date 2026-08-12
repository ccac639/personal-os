/**
 * 任务功能域统一出口
 */
export { default as TaskCard } from './task-card.vue';
export { default as TaskForm } from './task-form.vue';
export { default as TaskKanban } from './task-kanban.vue';
export { default as TaskDrawer } from './task-drawer.vue';
export { default as BatchToolbar } from './batch-toolbar.vue';
export { default as FocusPanel } from './focus-panel.vue';

export { useTaskStore } from './store';
export {
  KANBAN_STATUSES,
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  TASK_SORT_OPTIONS,
  TASK_DATE_FILTERS,
  TASK_QUICK_FILTERS,
  DUE_GROUPS,
  FOCUS_MAX,
} from './types';
export { filterTasksByDate, dueGroupOf, groupTasksByDue } from './filter';
export { subtaskStats } from './subtasks';
export { classifyKanbanKey, isEditableTarget } from './keyboard';
export {
  validateDependencies,
  canAddDependency,
  isBlocked,
  blockingDependencies,
} from './dependencies';
export { formatTimer, settleMs, msToMinutes } from './focus';
export type {
  TaskItem,
  KanbanStatus,
  TaskSortKey,
  TaskStats,
  TaskSummary,
  TaskDateFilter,
  TaskQuickFilter,
  DueGroup,
  SubTask,
  TaskEvent,
  UndoInfo,
  FocusItem,
  FocusSession,
  RunningFocus,
} from './types';
