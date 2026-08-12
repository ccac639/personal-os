/**
 * 项目功能域 —— Pinia store
 *
 * 职责：项目 CRUD、收藏 / 排序、归档 / 恢复、删除、进度模式（自动 / 手动）、
 * 计划字段、里程碑（CRUD / 关联任务 / 排序）、复盘笔记、归档快照、
 * 活动记录、总览页搜索与状态 / 快捷视图筛选。
 *
 * 持久化统一走 ./persistence（版本信封 + 严格校验 + 迁移 + 失败降级），
 * 组件不得直接访问 localStorage。
 *
 * 摘要数据（summary）只读暴露给首页等模块消费，API 形状保持向后兼容。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';
import type { ProjectStatus } from '@personal-os/types';

import {
  loadActivitiesData,
  loadProjectsData,
  loadProjectsUi,
  loadRetrospectives,
  loadSnapshots,
  milestoneFromForm,
  saveActivitiesData,
  saveProjectsData,
  saveProjectsUi,
  saveRetrospectives,
  saveSnapshots,
} from './persistence';
import { withProgressMode } from './progress';
import { sortMilestones } from './milestones';
import type {
  Milestone,
  MilestoneForm,
  ProjectActivity,
  ProjectActivityType,
  ProjectDetail,
  ProjectForm,
  ProjectProgressMode,
  ProjectSnapshot,
  ProjectSortKey,
  ProjectStatusFilter,
  ProjectSummary,
  ProjectViewFilter,
  Retrospective,
} from './types';

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const useProjectStore = defineStore('projects', () => {
  const initial = loadProjectsData();
  const projects = ref<ProjectDetail[]>(initial.data.projects);
  const milestones = ref<Milestone[]>(initial.data.milestones);
  const storageWarning = ref<string | null>(initial.notice);

  const actInitial = loadActivitiesData();
  const activities = ref<ProjectActivity[]>(actInitial.data);
  if (actInitial.notice && !storageWarning.value) storageWarning.value = actInitial.notice;

  const retroInitial = loadRetrospectives();
  const retrospectives = ref<Retrospective[]>(retroInitial.data);

  const snapInitial = loadSnapshots();
  const snapshots = ref<ProjectSnapshot[]>(snapInitial.data);

  const uiInitial = loadProjectsUi();
  /** 总览页搜索词（匹配名称 / 描述 / 标签 / 技术栈） */
  const searchQuery = ref(uiInitial.searchQuery);
  /** 总览页状态筛选 */
  const statusFilter = ref<ProjectStatusFilter>(uiInitial.statusFilter);
  /** 快捷视图：全部 / 收藏 / 归档（与状态筛选互斥，见页面切换逻辑） */
  const viewFilter = ref<ProjectViewFilter>(uiInitial.viewFilter);
  /** 排序键与方向 */
  const sortBy = ref<ProjectSortKey>(uiInitial.sortBy);
  const sortDir = ref<'asc' | 'desc'>(uiInitial.sortDir);

  /** 迁移 / 引用清理报告（页面横幅展示） */
  const migrationNotice = ref<string | null>(null);

  function handleSave(result: { ok: boolean; reason?: string }): void {
    if (!result.ok) storageWarning.value = result.reason ?? '本地存储写入失败';
  }

  watch(
    [projects, milestones],
    (value) =>
      handleSave(
        saveProjectsData({
          projects: value[0] as ProjectDetail[],
          milestones: value[1] as Milestone[],
        }),
      ),
    { deep: true, flush: 'sync' },
  );

  watch(activities, (value) => handleSave(saveActivitiesData(value)), {
    deep: true,
    flush: 'sync',
  });

  watch(retrospectives, (value) => handleSave(saveRetrospectives(value)), {
    deep: true,
    flush: 'sync',
  });

  watch(snapshots, (value) => handleSave(saveSnapshots(value)), { deep: true, flush: 'sync' });

  watch(
    [searchQuery, statusFilter, viewFilter, sortBy, sortDir],
    () => {
      handleSave(
        saveProjectsUi({
          searchQuery: searchQuery.value,
          statusFilter: statusFilter.value,
          viewFilter: viewFilter.value,
          sortBy: sortBy.value,
          sortDir: sortDir.value,
        }),
      );
    },
    { flush: 'sync' },
  );

  /** 搜索 + 状态筛选 + 快捷视图过滤后的项目列表 */
  const filteredProjects = computed<ProjectDetail[]>(() => {
    const q = searchQuery.value.trim().toLowerCase();
    return projects.value.filter((p) => {
      if (viewFilter.value === 'favorites' && !p.favorite) return false;
      if (viewFilter.value === 'archived' && p.status !== 'archived') return false;
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

  /** 只读摘要（首页 / 其他模块可读，形状向后兼容） */
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

  /** 某项目最近一条活动（详情页上下文栏用） */
  function latestActivity(id: string): ProjectActivity | null {
    return projectActivities(id)[0] ?? null;
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
      favorite: false,
      progressMode: 'auto',
      goal: input.goal?.trim() || undefined,
      startDate: input.startDate || undefined,
      targetDate: input.targetDate || undefined,
      estimatedHours: input.estimatedHours,
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
    p.goal = input.goal?.trim() || undefined;
    p.startDate = input.startDate || undefined;
    p.targetDate = input.targetDate || undefined;
    p.estimatedHours = input.estimatedHours;
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

  /** 永久删除项目：级联清理活动、里程碑、复盘笔记、归档快照
   * （关联任务 / 今日聚焦 / 专注记录由调用方先执行 taskStore.removeByProject 与 clearFocusByProject） */
  function deleteProject(id: string): void {
    const p = projectById(id);
    if (!p) return;
    projects.value = projects.value.filter((x) => x.id !== id);
    activities.value = activities.value.filter((a) => a.projectId !== id);
    milestones.value = milestones.value.filter((m) => m.projectId !== id);
    retrospectives.value = retrospectives.value.filter((r) => r.projectId !== id);
    snapshots.value = snapshots.value.filter((s) => s.projectId !== id);
  }

  // ── 收藏 / 进度 ──

  function toggleFavorite(id: string): void {
    const p = projectById(id);
    if (!p) return;
    p.favorite = !p.favorite;
  }

  /** 切换进度模式；切到手动时以当前有效进度初始化（见 progress.ts） */
  function setProgressMode(id: string, mode: ProjectProgressMode, taskProgress: number): void {
    const p = projectById(id);
    if (!p || p.progressMode === mode) return;
    const next = withProgressMode(p, mode, taskProgress);
    p.progressMode = next.progressMode;
    p.manualProgress = next.manualProgress;
    p.updatedAt = new Date().toISOString();
    addActivity(
      id,
      'updated',
      mode === 'manual' ? '项目进度切换为手动' : '项目进度切换为自动',
      p.name,
    );
  }

  function setManualProgress(id: string, value: number): void {
    const p = projectById(id);
    if (!p || p.progressMode !== 'manual') return;
    const next = Math.min(100, Math.max(0, Math.round(value)));
    if (p.manualProgress === next) return;
    p.manualProgress = next;
    p.updatedAt = new Date().toISOString();
  }

  // ── 里程碑 ──

  /** 某项目的里程碑（已完成排最后，其余按 order / dueDate） */
  function milestonesOf(projectId: string): Milestone[] {
    return sortMilestones(milestones.value.filter((m) => m.projectId === projectId));
  }

  function milestoneById(id: string): Milestone | null {
    return milestones.value.find((m) => m.id === id) ?? null;
  }

  function createMilestone(projectId: string, input: MilestoneForm): Milestone {
    const now = new Date().toISOString();
    const siblings = milestones.value.filter((m) => m.projectId === projectId);
    const milestone: Milestone = {
      id: uid('ms-'),
      projectId,
      title: input.title.trim(),
      description: input.description?.trim() || undefined,
      startDate: input.startDate || undefined,
      dueDate: input.dueDate || undefined,
      status: input.status,
      order: siblings.length ? Math.max(...siblings.map((m) => m.order)) + 1 : 0,
      taskIds: [...input.taskIds],
      createdAt: now,
      updatedAt: now,
    };
    milestones.value.push(milestone);
    addActivity(projectId, 'milestone', '创建里程碑', milestone.title);
    return milestone;
  }

  function updateMilestone(id: string, input: MilestoneForm): void {
    const m = milestoneById(id);
    if (!m) return;
    const patch = milestoneFromForm(input, m);
    m.title = patch.title;
    m.description = patch.description;
    m.startDate = patch.startDate;
    m.dueDate = patch.dueDate;
    m.status = patch.status;
    m.taskIds = patch.taskIds;
    m.updatedAt = new Date().toISOString();
    addActivity(m.projectId, 'milestone', '更新里程碑', m.title);
  }

  /** 完成 / 重开里程碑（重开回到进行中） */
  function setMilestoneDone(id: string, done: boolean): void {
    const m = milestoneById(id);
    if (!m) return;
    if (m.status === 'done' && done) return;
    m.status = done ? 'done' : 'in-progress';
    m.updatedAt = new Date().toISOString();
    addActivity(m.projectId, 'milestone', done ? '完成里程碑' : '重新打开里程碑', m.title);
  }

  function deleteMilestone(id: string): void {
    const m = milestoneById(id);
    if (!m) return;
    milestones.value = milestones.value.filter((x) => x.id !== id);
    addActivity(m.projectId, 'milestone', '删除里程碑', m.title);
  }

  /** 里程碑上下移动（order 交换） */
  function moveMilestone(id: string, dir: -1 | 1): void {
    const list = milestonesOf(milestoneById(id)?.projectId ?? '');
    const index = list.findIndex((m) => m.id === id);
    const target = index + dir;
    if (index < 0 || target < 0 || target >= list.length) return;
    const a = list[index]!;
    const b = list[target]!;
    const tmp = a.order;
    a.order = b.order;
    b.order = tmp;
  }

  /** 清理里程碑中指向不存在任务的引用（迁移 / 任务删除后调用） */
  function cleanupMilestoneRefs(validTaskIds: Set<string>): number {
    let cleaned = 0;
    for (const m of milestones.value) {
      const before = m.taskIds.length;
      m.taskIds = m.taskIds.filter((id) => validTaskIds.has(id));
      if (m.taskIds.length !== before) cleaned += 1;
    }
    return cleaned;
  }

  // ── 复盘笔记 ──

  function retrospectiveOf(projectId: string): Retrospective | null {
    return retrospectives.value.find((r) => r.projectId === projectId) ?? null;
  }

  function saveRetrospective(
    projectId: string,
    content: Omit<Retrospective, 'projectId' | 'updatedAt'>,
  ): void {
    const existing = retrospectiveOf(projectId);
    if (existing) {
      existing.done = content.done;
      existing.blockers = content.blockers;
      existing.next = content.next;
      existing.lessons = content.lessons;
      existing.updatedAt = new Date().toISOString();
    } else {
      retrospectives.value.push({ projectId, ...content, updatedAt: new Date().toISOString() });
    }
    addActivity(projectId, 'updated', '更新复盘笔记');
  }

  // ── 归档快照 ──

  function snapshotsOf(projectId: string): ProjectSnapshot[] {
    return snapshots.value
      .filter((s) => s.projectId === projectId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  function snapshotById(id: string): ProjectSnapshot | null {
    return snapshots.value.find((s) => s.id === id) ?? null;
  }

  function addSnapshot(snapshot: ProjectSnapshot): void {
    snapshots.value.unshift(snapshot);
    addActivity(snapshot.projectId, 'snapshot', '生成归档快照', formatSnapshotLabel(snapshot));
  }

  function deleteSnapshot(id: string): void {
    snapshots.value = snapshots.value.filter((s) => s.id !== id);
  }

  function formatSnapshotLabel(snapshot: ProjectSnapshot): string {
    const d = new Date(snapshot.createdAt);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /** 清空持久化失败提示（非阻塞横幅关闭） */
  function dismissStorageWarning(): void {
    storageWarning.value = null;
  }

  function dismissMigrationNotice(): void {
    migrationNotice.value = null;
  }

  return {
    projects,
    milestones,
    activities,
    retrospectives,
    snapshots,
    searchQuery,
    statusFilter,
    viewFilter,
    sortBy,
    sortDir,
    storageWarning,
    migrationNotice,
    filteredProjects,
    summary,
    projectById,
    projectActivities,
    latestActivity,
    addActivity,
    createProject,
    updateProject,
    archiveProject,
    restoreProject,
    deleteProject,
    toggleFavorite,
    setProgressMode,
    setManualProgress,
    milestonesOf,
    milestoneById,
    createMilestone,
    updateMilestone,
    setMilestoneDone,
    deleteMilestone,
    moveMilestone,
    cleanupMilestoneRefs,
    retrospectiveOf,
    saveRetrospective,
    snapshotsOf,
    snapshotById,
    addSnapshot,
    deleteSnapshot,
    dismissStorageWarning,
    dismissMigrationNotice,
  };
});
