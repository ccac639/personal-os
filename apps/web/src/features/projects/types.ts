/**
 * 项目功能域类型定义
 *
 * 复用 @personal-os/types 的 Project / ProjectStatus 基础类型；
 * 仅在此补充前端展示所需的扩展字段（技术栈、收藏、进度模式、活动记录等）。
 */
import type { Project, ProjectStatus } from '@personal-os/types';

/** 项目进度模式 */
export type ProjectProgressMode = 'auto' | 'manual';

/** 项目排序键 */
export type ProjectSortKey = 'updatedAt' | 'createdAt' | 'progress' | 'tasks' | 'name';

/** 总览页快捷视图（与状态筛选互斥） */
export type ProjectViewFilter = 'all' | 'favorites' | 'archived';

/** 前端扩展：项目（基础类型缺技术栈 / 收藏 / 进度模式字段） */
export interface ProjectDetail extends Project {
  /** 技术栈名称列表（项目卡片 / 详情展示用） */
  techStack: string[];
  /** 是否收藏（置顶展示） */
  favorite: boolean;
  /** 进度计算模式：auto=任务完成比例；manual=手动设置 */
  progressMode: ProjectProgressMode;
  /** 手动进度 0-100（仅 progressMode=manual 时有意义） */
  manualProgress?: number;
}

/** 项目表单输入（创建 / 编辑共用） */
export interface ProjectForm {
  name: string;
  description?: string;
  status: ProjectStatus;
  tags: string[];
  techStack: string[];
}

/** 活动记录类型 */
export type ProjectActivityType =
  'created' | 'updated' | 'archived' | 'restored' | 'deleted' | 'task';

/** 项目活动记录（详情页「活动记录」视图数据源） */
export interface ProjectActivity {
  id: string;
  projectId: string;
  type: ProjectActivityType;
  title: string;
  description?: string;
  /** ISO 时间 */
  createdAt: string;
}

/** 项目摘要（首页等只读模块可读取，禁止写入 dashboard 模块） */
export interface ProjectSummary {
  total: number;
  planning: number;
  active: number;
  paused: number;
  completed: number;
  archived: number;
  /** 最近更新的项目（按 updatedAt 降序，最多 5 个） */
  recent: ProjectDetail[];
}

/** 总览页状态筛选 */
export type ProjectStatusFilter = ProjectStatus | 'all';

/** 状态展示元数据 */
export const PROJECT_STATUS_META: Record<
  ProjectStatus,
  { label: string; dot: string; badge: string }
> = {
  planning: { label: '规划中', dot: 'bg-sky-500', badge: 'text-sky-600 bg-sky-500/10' },
  active: { label: '进行中', dot: 'bg-green-500', badge: 'text-green-600 bg-green-500/10' },
  paused: { label: '暂停', dot: 'bg-amber-500', badge: 'text-amber-600 bg-amber-500/10' },
  completed: { label: '已完成', dot: 'bg-indigo-500', badge: 'text-indigo-600 bg-indigo-500/10' },
  archived: {
    label: '已归档',
    dot: 'bg-surface-800/40',
    badge: 'text-surface-800/60 bg-surface-100',
  },
};

/** 总览页筛选选项（顺序即展示顺序） */
export const PROJECT_FILTERS: { value: ProjectStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '进行中' },
  { value: 'planning', label: '规划中' },
  { value: 'paused', label: '暂停' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
];

/** 快捷视图选项（全部 / 收藏 / 归档） */
export const PROJECT_VIEWS: { value: ProjectViewFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'favorites', label: '收藏' },
  { value: 'archived', label: '归档' },
];

/** 排序选项 */
export const PROJECT_SORT_OPTIONS: { value: ProjectSortKey; label: string }[] = [
  { value: 'updatedAt', label: '最近更新' },
  { value: 'createdAt', label: '创建时间' },
  { value: 'progress', label: '完成进度' },
  { value: 'tasks', label: '未完成任务数' },
  { value: 'name', label: '名称' },
];
