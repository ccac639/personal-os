export { default as DashboardStatsCards } from './stats-cards.vue';
export { default as DashboardQuickActions } from './quick-actions.vue';
export { default as DashboardRecentProjects } from './recent-projects.vue';
export { default as DashboardActivityFeed } from './activity-feed.vue';
export { default as DashboardTechOverview } from './tech-overview.vue';
export { default as DashboardSystemStatus } from './system-status.vue';
export { default as DashboardHeroCarousel } from './hero-carousel.vue';
export { default as DashboardTrendingAI } from './trending-ai.vue';
export { default as DashboardWorkflowStatus } from './workflow-status.vue';
export { default as DashboardSystemOverview } from './system-overview.vue';
export { default as DashboardTodayWorkbench } from './today-workbench.vue';
export { default as DashboardEfficiencySummary } from './efficiency-summary.vue';
export { default as DashboardAiWorkbench } from './ai-workbench.vue';
export { default as DashboardSystemEvents } from './system-events.vue';
export { default as DashboardNotificationCenter } from './notification-center.vue';

export {
  HOME_METRICS,
  RECENT_ACTIVITIES,
  RECENT_PROJECTS,
  GITHUB_TREND,
  WORKFLOW_RUNS,
  SYSTEM_SERVICES,
  SYSTEM_OVERVIEW,
  QUICK_ACTIONS,
  METRIC_ICONS,
  ACTIVITY_STATUS_CONFIG,
  TODAY_WORKBENCH,
  WORK_STATS_INPUT,
  AI_WORKBENCH,
  SYSTEM_EVENTS,
  NOTIFICATIONS,
} from './mock';

export { computeWorkSummary, directionFor, trendLabel } from './summary';
export type { WorkStatsInput, TrendDirection } from './summary';

export type {
  HomeMetric,
  QuickAction,
  ProjectItem,
  ActivityItem,
  ActivityStatus,
  GithubTrendItem,
  ServiceStatus,
  ServiceStatusType,
  WorkflowRun,
  WorkflowStatus,
  WorkbenchItem,
  TodayWorkbench,
  DashboardSummary,
  AiWorkbenchInfo,
  SystemEvent,
  SystemEventType,
  DashboardNotification,
  NotificationType,
} from './types';
