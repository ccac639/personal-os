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
export { default as ExecutionPanel } from './execution-panel.vue';
export { default as ExecutionTab } from './execution-tab.vue';
export { default as WeeklyGoalForm } from './weekly-goal-form.vue';
export { default as ArchiveDialog } from './archive-dialog.vue';
export { default as ReleasePanel } from './release-panel.vue';
export { default as KnowledgePanel } from './knowledge-panel.vue';

export { useProjectStore } from './store';
export { useReleaseStore } from './release-store';
export { useKnowledgeStore } from './knowledge-store';
export { useWeeklyGoalStore } from './weekly-goals-store';
export {
  PROJECT_STATUS_META,
  PROJECT_FILTERS,
  PROJECT_VIEWS,
  PROJECT_SORT_OPTIONS,
  MILESTONE_STATUS_META,
} from './types';
export { effectiveProgress } from './progress';
export { sortProjects } from './sort';
export {
  milestoneProgress,
  milestoneRisk,
  milestoneState,
  sortMilestones,
  sanitizeMilestoneTaskIds,
  unfinishedLinkedCount,
  MILESTONE_STATE_META,
} from './milestones';
export type { MilestoneDisplayState } from './milestones';
export {
  timelineWindow,
  buildTimelineCells,
  timelinePosition,
  milestoneBar,
  planMissingInfo,
  estimateInfo,
  collectPlanDates,
  addDays,
  dayDiff,
  isValidDateStr,
  toDateStr,
} from './plan';
export type {
  TimelineScale,
  TimelineCell,
  TimelineWindow,
  TimelinePosition,
  EstimateInfo,
} from './plan';
export {
  buildHealthStats,
  buildRiskRules,
  buildRetroTemplate,
  buildRetroMarkdown,
  buildSnapshot,
} from './health';
export type { HealthRange, RiskRule, RiskLevel, RiskRuleInput } from './health';
export {
  buildThroughput,
  buildPriorities,
  todayPlanRows,
  weekStartOf,
  weekLabel,
  weekProgress,
  streakDays,
  milestoneRiskSummary,
  trimWeeklyGoalHistory,
  WEEKLY_GOAL_HISTORY_LIMIT,
} from './execution';
export type {
  ThroughputStats,
  PriorityRow,
  PriorityKind,
  PriorityInput,
  WeeklyGoal,
  WeeklyGoalProgress,
} from './execution';
export {
  BUILTIN_RELEASE_ITEMS,
  BUILTIN_RELEASE_TEMPLATES,
  isValidVersion,
  buildChecklistDraft,
  recordFromChecklist,
  buildReleaseMarkdown,
  createReleaseTemplate,
  deleteReleaseTemplate,
  normalizeChecklist,
  normalizeRecord,
} from './releases';
export type {
  ReleaseChecklist,
  ReleaseChecklistItem,
  ReleaseRecord,
  ReleaseStatus,
  ReleaseTemplate,
} from './releases';
export {
  KNOWLEDGE_TYPE_META,
  DECISION_STATUS_META,
  ISSUE_STATUS_META,
  filterKnowledge,
  knowledgeTags,
  buildKnowledgeMarkdown,
  normalizeKnowledgeEntry,
} from './knowledge';
export type {
  KnowledgeEntry,
  KnowledgeType,
  DecisionStatus,
  IssueStatus,
  KnowledgeFilter,
} from './knowledge';
export {
  archivePreview,
  archiveProjectWithTasks,
  undoArchiveWithTasks,
  restoreProjectWithTasks,
  deleteProjectWithTasks,
  releaseSummaryForRetro,
} from './archive';
export type { ArchivePreview, ArchiveOptions } from './archive';
export { parseSnapshotJson, serializeSnapshot } from './persistence';
export { serializeProjectBundle, parseProjectBundle } from './transfer';
export type { ProjectBundle, ProjectImportResult, ProjectImportReport } from './transfer';
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
