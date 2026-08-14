/**
 * 任务功能域 —— 后端 API 客户端（ofetch）
 *
 * 只做 HTTP 传输与类型声明，不含业务逻辑；模型映射见 ./sync。
 * 端点与后端 apps/api/src/modules/tasks、focus 一致。
 */
import { apiFetch } from '@/services';

import type { Paginated } from '@/features/projects/api';

// ── 任务（后端 TaskJson） ──

export interface TaskApi {
  id: string;
  projectId?: string | null;
  title: string;
  description: string;
  status: 'todo' | 'in-progress' | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags: string[];
  dueDate?: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
  dod?: string;
  blocked: boolean;
  blockedReason?: string;
  subtasks: { title: string; done: boolean }[];
  dependencies: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskApi {
  projectId?: string | null;
  title: string;
  description?: string;
  status?: TaskApi['status'];
  priority?: TaskApi['priority'];
  tags?: string[];
  dueDate?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  dod?: string;
  blocked?: boolean;
  blockedReason?: string;
  subtasks?: { title: string; done: boolean }[];
  dependencies?: string[];
  sortOrder?: number;
}

export type UpdateTaskApi = Partial<CreateTaskApi>;

export interface ListTasksParams {
  page?: number;
  pageSize?: number;
  projectId?: string;
  status?: string;
  priority?: string;
  search?: string;
  dueFrom?: string;
  dueTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── 今日计划（后端 FocusPlan） ──

export interface FocusPlanApi {
  id: string;
  date: string;
  note: string;
  items: {
    taskId?: string | null;
    title: string;
    done: boolean;
    sortOrder: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface UpsertPlanApi {
  note?: string;
  items?: { taskId?: string | null; title: string; done?: boolean; sortOrder?: number }[];
}

// ── 专注记录（后端 FocusSession） ──

export interface FocusSessionApi {
  id: string;
  date: string;
  startedAt: string;
  endedAt?: string | null;
  durationMinutes?: number;
  taskId?: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSessionApi {
  date: string;
  startedAt: string;
  endedAt?: string;
  durationMinutes?: number;
  taskId?: string;
  note?: string;
}

// ── 客户端 ──

export const tasksApi = {
  async list(params: ListTasksParams = {}): Promise<Paginated<TaskApi>> {
    return apiFetch<Paginated<TaskApi>>('/tasks', {
      method: 'GET',
      query: { page: 1, pageSize: 500, sortBy: 'sortOrder', sortOrder: 'asc', ...params },
    });
  },
  async get(id: string): Promise<TaskApi> {
    return apiFetch<TaskApi>(`/tasks/${encodeURIComponent(id)}`);
  },
  async create(dto: CreateTaskApi): Promise<TaskApi> {
    return apiFetch<TaskApi>('/tasks', { method: 'POST', body: dto });
  },
  async update(id: string, dto: UpdateTaskApi): Promise<TaskApi> {
    return apiFetch<TaskApi>(`/tasks/${encodeURIComponent(id)}`, { method: 'PATCH', body: dto });
  },
  async remove(id: string): Promise<void> {
    await apiFetch(`/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

export const focusApi = {
  async getPlan(date: string): Promise<FocusPlanApi> {
    return apiFetch<FocusPlanApi>(`/focus/plans/${date}`);
  },
  async listPlans(params: { from?: string; to?: string } = {}): Promise<FocusPlanApi[]> {
    return apiFetch<FocusPlanApi[]>('/focus/plans', { method: 'GET', query: params });
  },
  async upsertPlan(date: string, dto: UpsertPlanApi): Promise<FocusPlanApi> {
    return apiFetch<FocusPlanApi>(`/focus/plans/${date}`, { method: 'PUT', body: dto });
  },
  async listSessions(
    params: { date?: string; from?: string; to?: string; taskId?: string } = {},
  ): Promise<FocusSessionApi[]> {
    return apiFetch<FocusSessionApi[]>('/focus/sessions', { method: 'GET', query: params });
  },
  async createSession(dto: CreateSessionApi): Promise<FocusSessionApi> {
    return apiFetch<FocusSessionApi>('/focus/sessions', { method: 'POST', body: dto });
  },
  async deleteSession(id: string): Promise<void> {
    await apiFetch(`/focus/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
