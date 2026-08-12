/**
 * 项目功能域统一出口
 */
export { default as ModalShell } from './modal-shell.vue';
export { default as ConfirmDialog } from './confirm-dialog.vue';
export { default as ProjectCard } from './project-card.vue';
export { default as ProjectForm } from './project-form.vue';
export { default as ProjectDeleteDialog } from './project-delete-dialog.vue';
export { default as ProjectContextBar } from './project-context-bar.vue';
export { default as ProgressEditor } from './progress-editor.vue';
export { default as StorageWarningBanner } from './storage-warning-banner.vue';
export { default as MilestoneForm } from './milestone-form.vue';
export { default as ProjectPlanView } from './project-plan-view.vue';
export { default as RetroView } from './retro-view.vue';
export { default as SnapshotViewer } from './snapshot-viewer.vue';
export { default as TechTree } from './tech-tree.vue';

export { useProjectStore } from './store';
export {
  PROJECT_STATUS_META,
  PROJECT_FILTERS,
  PROJECT_VIEWS,
  PROJECT_SORT_OPTIONS,
  MILESTONE_STATUS_META,
} from './types';
export { effectiveProgress } from './progress';
export { sortProjects } from './sort';
export { milestoneProgress, milestoneRisk, sortMilestones } from './milestones';
export { buildHealthStats, buildRetroTemplate, buildSnapshot } from './health';
export type {
  ProjectDetail,
  ProjectActivity,
  ProjectActivityType,
  ProjectSummary,
  ProjectStatusFilter,
  ProjectViewFilter,
  ProjectSortKey,
  ProjectProgressMode,
  Milestone,
  MilestoneForm as MilestoneFormData,
  MilestoneStatus,
  Retrospective,
  ProjectSnapshot,
} from './types';
