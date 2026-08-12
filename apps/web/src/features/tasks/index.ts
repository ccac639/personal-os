/**
 * 任务功能域统一出口
 */
export { default as TaskCard } from './task-card.vue';
export { default as TaskForm } from './task-form.vue';
export { default as TaskKanban } from './task-kanban.vue';
export { default as TaskDrawer } from './task-drawer.vue';
export { default as BatchToolbar } from './batch-toolbar.vue';

export { useTaskStore } from './store';
export {
  KANBAN_STATUSES,
  TASK_STATUS_META,
  TASK_PRIORITY_META,
  TASK_SORT_OPTIONS,
  TASK_DATE_FILTERS,
  DUE_GROUPS,
} from './types';
export { filterTasksByDate, dueGroupOf, groupTasksByDue } from './filter';
export { subtaskStats } from './subtasks';
export { classifyKanbanKey, isEditableTarget } from './keyboard';
export type {
  TaskItem,
  KanbanStatus,
  TaskSortKey,
  TaskStats,
  TaskSummary,
  TaskDateFilter,
  DueGroup,
  SubTask,
  TaskEvent,
  UndoInfo,
} from './types';
