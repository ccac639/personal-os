/**
 * 项目功能域 —— Pinia store
 *
 * 职责：项目 CRUD、归档 / 恢复、删除、活动记录、总览页搜索与状态筛选、
 * localStorage 本地持久化（纯前端 mock，不调用后端）。
 *
 * 摘要数据（summary）只读暴露给首页等模块消费，禁止写入 dashboard 模块。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ProjectStatus } from '@personal-os/types';

import { SEED_ACTIVITIES, SEED_PROJECTS } from './mock';
import type {
  ProjectActivity,
  ProjectActivityType,
  ProjectDetail,
  ProjectForm,
  ProjectStatusFilter,
  ProjectSummary,
} from './types';

const STORAGE_KEY = 'personal-os.projects.v1';
const ACTIVITY_KEY = 'personal-os.projects.activities.v1';

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function cloneProjects(list: ProjectDetail[]): ProjectDetail[] {
  return list.map((p) => ({ ...p, tags: [...p.tags], techStack: [...p.techStack] }));
}

function loadProjects(): ProjectDetail[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ProjectDetail[];
    }
  } catch {
    /* 数据损坏时回退到种子 */
  }
  // 克隆种子，避免跨 store 实例共享可变引用
  return cloneProjects(SEED_PROJECTS);
}

function cloneActivities(list: ProjectActivity[]): ProjectActivity[] {
  return list.map((a) => ({ ...a }));
}

function loadActivities(): ProjectActivity[] {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as ProjectActivity[];
    }
  } catch {
    /* 数据损坏时回退到种子 */
  }
  return cloneActivities(SEED_ACTIVITIES);
}

export const useProjectStore = defineStore('projects', () => {
  const projects = ref<ProjectDetail[]>(loadProjects());
  const activities = ref<ProjectActivity[]>(loadActivities());

  /** 总览页搜索词（匹配名称 / 描述 / 标签 / 技术栈） */
  const searchQuery = ref('');
  /** 总览页状态筛选 */
  const statusFilter = ref<ProjectStatusFilter>('all');

  watch(
    projects,
    (value) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        /* 存储失败（配额 / 隐私模式）不阻塞操作 */
      }
    },
    { deep: true, flush: 'sync' },
  );

  watch(
    activities,
    (value) => {
      try {
        localStorage.setItem(ACTIVITY_KEY, JSON.stringify(value));
      } catch {
        /* 同上 */
      }
    },
    { deep: true, flush: 'sync' },
  );

  /** 搜索 + 状态筛选后的项目列表（总览页数据源） */
  const filteredProjects = computed<ProjectDetail[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return projects.value.filter((p) => {
      if (statusFilter.value !== 'all' && p.status !== statusFilter.value) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q)) ||
        p.techStack.some((t) => t.toLowerCase().includes(q))
      );
    });
  });

  /** 只读摘要（首页 / 其他模块可读） */
  const summary = computed<ProjectSummary>(() => {
    const count = (s: ProjectStatus) => projects.value.filter((p) => p.status === s).length;
    const recent = [...projects.value]
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .slice(0, 5);
    return {
      total: projects.value.length,
      planning: count('planning'),
      active: count('active'),
      paused: count('paused'),
      completed: count('completed'),
      archived: count('archived'),
      recent,
    };
  });

  function projectById(id: string): ProjectDetail | null {
    return projects.value.find((p) => p.id === id) ?? null;
  }

  function addActivity(
    projectId: string,
    type: ProjectActivityType,
    title: string,
    description?: string,
  ): void {
    activities.value.push({
      id: uid('a-'),
      projectId,
      type,
      title,
      description,
      createdAt: new Date().toISOString(),
    });
  }

  /** 某项目的活动记录（新的在前） */
  function projectActivities(id: string): ProjectActivity[] {
    return activities.value
      .filter((a) => a.projectId === id)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function createProject(input: ProjectForm): ProjectDetail {
    const now = new Date().toISOString();
    const project: ProjectDetail = {
      id: uid('p-'),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      status: input.status,
      ownerId: 'me',
      tags: input.tags,
      techStack: input.techStack,
      createdAt: now,
      updatedAt: now,
    };
    projects.value.unshift(project);
    addActivity(project.id, 'created', '创建项目', project.name);
    return project;
  }

  function updateProject(id: string, input: ProjectForm): void {
    const p = projectById(id);
    if (!p) return;
    p.name = input.name.trim();
    p.description = input.description?.trim() || undefined;
    p.status = input.status;
    p.tags = input.tags;
    p.techStack = input.techStack;
    p.updatedAt = new Date().toISOString();
    addActivity(id, 'updated', '更新项目信息', p.name);
  }

  function archiveProject(id: string): void {
    const p = projectById(id);
    if (!p || p.status === 'archived') return;
    p.status = 'archived';
    p.updatedAt = new Date().toISOString();
    addActivity(id, 'archived', '归档项目', p.name);
  }

  function restoreProject(id: string): void {
    const p = projectById(id);
    if (!p || p.status !== 'archived') return;
    p.status = 'active';
    p.updatedAt = new Date().toISOString();
    addActivity(id, 'restored', '恢复项目', p.name);
  }

  /** 删除项目：同时清理其活动记录（任务由 task store 的 removeByProject 级联） */
  function deleteProject(id: string): void {
    const p = projectById(id);
    if (!p) return;
    projects.value = projects.value.filter((x) => x.id !== id);
    activities.value = activities.value.filter((a) => a.projectId !== id);
  }

  return {
    projects,
    activities,
    searchQuery,
    statusFilter,
    filteredProjects,
    summary,
    projectById,
    projectActivities,
    addActivity,
    createProject,
    updateProject,
    archiveProject,
    restoreProject,
    deleteProject,
  };
});
