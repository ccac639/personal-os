/**
 * 项目功能域统一出口
 */
export { default as ModalShell } from './modal-shell.vue';
export { default as ConfirmDialog } from './confirm-dialog.vue';
export { default as ProjectCard } from './project-card.vue';
export { default as ProjectForm } from './project-form.vue';
export { default as TechTree } from './tech-tree.vue';

export { useProjectStore } from './store';
export { PROJECT_STATUS_META, PROJECT_FILTERS } from './types';
export type {
  ProjectDetail,
  ProjectActivity,
  ProjectActivityType,
  ProjectSummary,
  ProjectStatusFilter,
} from './types';
