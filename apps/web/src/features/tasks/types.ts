/**
 * 任务功能域类型定义
 *
 * 复用 @personal-os/types 的 Task / TaskStatus / TaskPriority 基础类型；
 * 仅在此补充前端展示所需的扩展字段（标签、列内排序权重、子任务、活动历史）。
 */
import type { Task, TaskPriority, TaskStatus } from '@personal-os/types';

/** 子任务（checklist 项） */
export interface SubTask {
  id: string;
  title: string;
  done: boolean;
}

/** 前端扩展：任务（基础类型缺标签 / 排序权重 / 子任务） */
export interface TaskItem extends Task {
  /** 标签列表 */
  tags: string[];
  /** 列内排序权重（越小越靠前），用于手动排序 */
  order: number;
  /** 子任务 checklist（完成状态计入任务进度，不改变父任务所属列） */
  subtasks: SubTask[];
}

/** 任务表单输入（创建 / 编辑共用） */
export interface TaskForm {
  projectId?: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** YYYY-MM-DD */
  dueDate?: string;
  tags: string[];
}

/** 看板列状态（cancelled 不进看板） */
export type KanbanStatus = 'todo' | 'in-progress' | 'done';

/** 排序键 */
export type TaskSortKey = 'order' | 'priority' | 'dueDate' | 'createdAt' | 'updatedAt';

/** 截止日期筛选 */
export type TaskDateFilter = 'all' | 'today' | 'upcoming' | 'overdue' | 'none';

/** 截止日期分组（列表 / 日期视图） */
export type DueGroup = 'overdue' | 'today' | 'upcoming' | 'later' | 'none';

/** 任务事件类型（详情抽屉活动历史） */
export type TaskEventType = 'created' | 'updated' | 'moved' | 'deleted' | 'subtask';

/** 任务活动历史条目 */
export interface TaskEvent {
  id: string;
  taskId: string;
  type: TaskEventType;
  title: string;
  /** ISO 时间 */
  createdAt: string;
}

/** 撤销反馈信息 */
export interface UndoInfo {
  message: string;
  at: number;
}

/** 单个项目的任务统计 */
export interface TaskStats {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  cancelled: number;
  /** 完成率 0-100（不计已取消） */
  progress: number;
  /** 已逾期且未完成数量 */
  overdue: number;
}

/** 全局任务摘要（首页等只读模块消费） */
export interface TaskSummary {
  total: number;
  todo: number;
  inProgress: number;
  done: number;
  overdue: number;
  /** 完成率 0-100（不计已取消） */
  completion: number;
}

export const KANBAN_STATUSES: KanbanStatus[] = ['todo', 'in-progress', 'done'];

export const TASK_STATUS_META: Record<TaskStatus, { label: string; badge: string; dot: string }> = {
  todo: { label: '待办', badge: 'text-sky-600 bg-sky-500/10', dot: 'bg-sky-500' },
  'in-progress': { label: '进行中', badge: 'text-amber-600 bg-amber-500/10', dot: 'bg-amber-500' },
  done: { label: '已完成', badge: 'text-green-600 bg-green-500/10', dot: 'bg-green-500' },
  cancelled: {
    label: '已取消',
    badge: 'text-surface-800/50 bg-surface-100',
    dot: 'bg-surface-800/30',
  },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; badge: string; rank: number }
> = {
  low: { label: '低', badge: 'text-surface-800/60 bg-surface-100', rank: 0 },
  medium: { label: '中', badge: 'text-sky-600 bg-sky-500/10', rank: 1 },
  high: { label: '高', badge: 'text-amber-600 bg-amber-500/10', rank: 2 },
  urgent: { label: '紧急', badge: 'text-red-600 bg-red-500/10', rank: 3 },
};

export const TASK_SORT_OPTIONS: { value: TaskSortKey; label: string }[] = [
  { value: 'order', label: '手动排序' },
  { value: 'priority', label: '优先级' },
  { value: 'dueDate', label: '截止日期' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'updatedAt', label: '更新时间' },
];

export const TASK_DATE_FILTERS: { value: TaskDateFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'today', label: '今天' },
  { value: 'upcoming', label: '即将到期' },
  { value: 'overdue', label: '逾期' },
  { value: 'none', label: '无截止日期' },
];

export const DUE_GROUPS: { value: DueGroup; label: string }[] = [
  { value: 'overdue', label: '已逾期' },
  { value: 'today', label: '今天' },
  { value: 'upcoming', label: '7 天内' },
  { value: 'later', label: '更晚' },
  { value: 'none', label: '无截止日期' },
];
