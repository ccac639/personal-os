import type { Component } from 'vue';

/** 顶部指标卡片（统一数据模型） */
export interface HomeMetric {
  id: string;
  label: string;
  value: string;
  description?: string;
  trend?: {
    value: string;
    direction: 'up' | 'down' | 'neutral';
    label: string;
  };
  /** 小型趋势图数据点（空数组 = 无趋势数据） */
  points?: number[];
  /** 图标名（METRIC_ICONS 注册表键） */
  icon: string;
}

/** 快速操作项 */
export interface QuickAction {
  id: string;
  label: string;
  icon: Component;
  href: string;
  /** 样式：图标色 + hover 渐变起点色 + 渐变终点色（空格分隔） */
  color: string;
  /** 快捷键提示（仅在真实支持时显示） */
  shortcut?: string;
}

/** 项目条目 */
export interface ProjectItem {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'paused' | 'completed';
  lastUpdated: string;
  progress?: number;
}

/** 活动状态：进行中 / 成功 / 失败 / 项目动态 */
export type ActivityStatus = 'running' | 'success' | 'failed' | 'project';

/** 活动流条目 */
export interface ActivityItem {
  id: string;
  type: 'commit' | 'project' | 'workflow' | 'system';
  title: string;
  description: string;
  timestamp: string;
  icon: Component;
  status: ActivityStatus;
  /** 进行中进度 0-100（仅 running 使用） */
  progress?: number;
  /** 失败原因摘要（仅 failed 使用） */
  failureReason?: string;
}

/** GitHub 本周趋势条目 */
export interface GithubTrendItem {
  rank: number;
  name: string;
  description: string;
  /** 总 star（展示用字符串，如 19.9k） */
  stars: string;
  /** 本周 star 增长（展示用字符串，如 +7,017） */
  deltaStars: string;
  url: string;
}

/** 系统服务状态（四态） */
export type ServiceStatusType = 'online' | 'degraded' | 'offline' | 'unknown';

/** 系统服务状态 */
export interface ServiceStatus {
  name: string;
  /** 技术栈（名称下方小字） */
  stack?: string;
  status: ServiceStatusType;
  latency?: number;
  lastCheck: string;
}

/** 工作流运行状态 */
export type WorkflowStatus = 'success' | 'running' | 'failed';

/** 工作流运行条目 */
export interface WorkflowRun {
  id: string;
  name: string;
  status: WorkflowStatus;
  duration: string;
  startedAt: string;
  /** 失败原因摘要（仅 failed 使用） */
  failureReason?: string;
}

/** 今日工作台条目 */
export interface WorkbenchItem {
  id: string;
  /** 条目类型：任务 / 待办 / 工作流 / AI 对话 */
  kind: 'task' | 'todo' | 'workflow' | 'ai';
  title: string;
  /** 来源（如「项目 · Personal OS」「工作流」） */
  source: string;
  status: 'pending' | 'running' | 'done';
  /** 跳转目标（只允许已有路由） */
  href: string;
  meta?: string;
}

/** 今日工作台快照 */
export interface TodayWorkbench {
  focusMinutes: number;
  completedToday: number;
  items: WorkbenchItem[];
}

/** 工作效率摘要条目 */
export interface DashboardSummary {
  id: string;
  label: string;
  /** 无数据时缺省 → 显示「暂无数据」，不伪造 0 */
  value?: string;
  trend?: {
    direction: 'up' | 'down' | 'neutral';
    value: string;
  };
  description?: string;
}

/** AI 工作台入口快照 */
export interface AiWorkbenchInfo {
  model: string;
  lastConversation?: string;
  pendingTasks: string[];
  templates: string[];
}

/** 系统事件类型 */
export type SystemEventType =
  | 'service-up'
  | 'service-down'
  | 'workflow-success'
  | 'workflow-failed'
  | 'sync'
  | 'error';

/** 系统事件条目 */
export interface SystemEvent {
  id: string;
  type: SystemEventType;
  title: string;
  description: string;
  /** 展示时间（如「2 分钟前」） */
  time: string;
  /** 排序用的时间戳（越大越新） */
  timestamp: number;
}

/** 通知类型 */
export type NotificationType = 'info' | 'success' | 'warning' | 'error';

/** 首页通知 */
export interface DashboardNotification {
  id: string;
  type: NotificationType;
  title: string;
  summary: string;
  createdAt: string;
  read: boolean;
  actionLabel?: string;
  /** 操作跳转目标（只允许已有路由） */
  actionPath?: string;
}
