/**
 * 项目功能域 —— 后端 API 客户端（ofetch）
 *
 * 只做 HTTP 传输与类型声明，不含业务逻辑；模型映射见 ./sync。
 * 端点与后端 apps/api/src/modules/projects、releases 一致。
 */
import { apiFetch } from '@/services';

// ── 通用分页响应（同步契约单一事实来源在 sync-core） ──

import type { Paginated } from './sync-core';
export type { Paginated } from './sync-core';

// ── 项目（后端 ProjectJson） ──

export interface ProjectApi {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'paused' | 'completed';
  favorite: boolean;
  archived: boolean;
  progressMode: 'auto' | 'manual';
  progress: number;
  targetDate?: string | null;
  techStack: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectApi {
  name: string;
  description?: string;
  status?: ProjectApi['status'];
  favorite?: boolean;
  progressMode?: ProjectApi['progressMode'];
  progress?: number;
  targetDate?: string;
  techStack?: string[];
  tags?: string[];
}

export type UpdateProjectApi = Partial<CreateProjectApi>;

export interface ListProjectsParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  favorite?: boolean;
  includeArchived?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ── 里程碑（后端 MilestoneJson，挂 releases/milestones 下） ──

export interface MilestoneApi {
  id: string;
  name: string;
  projectId?: string | null;
  description: string;
  targetDate?: string | null;
  status: 'planned' | 'in-progress' | 'completed' | 'cancelled';
  taskIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMilestoneApi {
  name: string;
  projectId?: string;
  description?: string;
  targetDate?: string;
  status?: MilestoneApi['status'];
  taskIds?: string[];
  sortOrder?: number;
}

export type UpdateMilestoneApi = Partial<CreateMilestoneApi>;

// ── 发布记录（后端 ReleaseJson；本地检查单草稿无对应后端模型，保持本地） ──

export interface ReleaseApi {
  id: string;
  version: string;
  summary: string;
  status: 'planned' | 'in-progress' | 'ready' | 'published' | 'cancelled';
  projectId?: string | null;
  checklist: { title: string; done: boolean; notes?: string }[];
  taskIds: string[];
  milestoneIds: string[];
  releaseDate?: string | null;
  publishedAt?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateReleaseApi {
  version: string;
  summary: string;
  status?: ReleaseApi['status'];
  projectId?: string;
  checklist?: { title: string; done: boolean; notes?: string }[];
  taskIds?: string[];
  milestoneIds?: string[];
  releaseDate?: string;
  publishedAt?: string;
  notes?: string;
}

export type UpdateReleaseApi = Partial<CreateReleaseApi>;

// ── 客户端 ──

export const projectsApi = {
  async list(params: ListProjectsParams = {}): Promise<Paginated<ProjectApi>> {
    return apiFetch<Paginated<ProjectApi>>('/projects', {
      method: 'GET',
      query: { page: 1, pageSize: 100, includeArchived: true, ...params },
    });
  },
  async get(id: string): Promise<ProjectApi> {
    return apiFetch<ProjectApi>(`/projects/${encodeURIComponent(id)}`);
  },
  async create(dto: CreateProjectApi): Promise<ProjectApi> {
    return apiFetch<ProjectApi>('/projects', { method: 'POST', body: dto });
  },
  async update(id: string, dto: UpdateProjectApi): Promise<ProjectApi> {
    return apiFetch<ProjectApi>(`/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: dto,
    });
  },
  async archive(id: string): Promise<ProjectApi> {
    return apiFetch<ProjectApi>(`/projects/${encodeURIComponent(id)}/archive`, { method: 'POST' });
  },
  async restore(id: string): Promise<ProjectApi> {
    return apiFetch<ProjectApi>(`/projects/${encodeURIComponent(id)}/restore`, { method: 'POST' });
  },
  async remove(
    id: string,
    opts: { permanent?: boolean; taskStrategy?: 'cascade' | 'inbox' } = {},
  ): Promise<void> {
    await apiFetch(`/projects/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      query: {
        permanent: opts.permanent ? 'true' : 'false',
        ...(opts.permanent ? { taskStrategy: opts.taskStrategy ?? 'cascade' } : {}),
      },
    });
  },
};

export const milestonesApi = {
  async list(
    params: { projectId?: string; pageSize?: number } = {},
  ): Promise<Paginated<MilestoneApi>> {
    return apiFetch<Paginated<MilestoneApi>>('/releases/milestones', {
      method: 'GET',
      query: { page: 1, pageSize: 500, ...params },
    });
  },
  async create(dto: CreateMilestoneApi): Promise<MilestoneApi> {
    return apiFetch<MilestoneApi>('/releases/milestones', { method: 'POST', body: dto });
  },
  async update(id: string, dto: UpdateMilestoneApi): Promise<MilestoneApi> {
    return apiFetch<MilestoneApi>(`/releases/milestones/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: dto,
    });
  },
  async remove(id: string): Promise<void> {
    await apiFetch(`/releases/milestones/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};

export const releasesApi = {
  async list(
    params: { projectId?: string; pageSize?: number } = {},
  ): Promise<Paginated<ReleaseApi>> {
    return apiFetch<Paginated<ReleaseApi>>('/releases', {
      method: 'GET',
      query: { page: 1, pageSize: 500, ...params },
    });
  },
  async create(dto: CreateReleaseApi): Promise<ReleaseApi> {
    return apiFetch<ReleaseApi>('/releases', { method: 'POST', body: dto });
  },
  async update(id: string, dto: UpdateReleaseApi): Promise<ReleaseApi> {
    return apiFetch<ReleaseApi>(`/releases/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: dto,
    });
  },
  async remove(id: string): Promise<void> {
    await apiFetch(`/releases/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
