/**
 * 任务功能域统一出口
 */
export { default as TaskCard } from './task-card.vue';
export { default as TaskForm } from './task-form.vue';
export { default as TaskKanban } from './task-kanban.vue';

export { useTaskStore } from './store';
export { KANBAN_STATUSES, TASK_STATUS_META, TASK_PRIORITY_META, TASK_SORT_OPTIONS } from './types';
export type { TaskItem, KanbanStatus, TaskSortKey, TaskStats, TaskSummary } from './types';
