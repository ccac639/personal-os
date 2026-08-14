/**
 * 项目功能域 —— 服务端同步装配（Projects / Milestones / Releases 记录）
 *
 * 职责：
 * - 本地模型 ↔ 后端模型的映射（字段名 / 状态枚举 / id 翻译）；
 * - 本地 id ↔ 服务端 id 映射（持久化，跨会话稳定，引用不随同步改写）；
 * - 装配 sync-core 引擎：hydrate / 乐观更新 / 失败回滚 / 离线队列；
 * - 里程碑关联任务、发布记录关联任务的引用翻译与完整性保障。
 *
 * 职责边界（服务端 vs localStorage）：
 * - 服务端：项目 / 里程碑 / 发布记录（检查单草稿除外）、任务、今日计划、专注记录；
 * - localStorage：UI 偏好、活动流（activities / events）、复盘笔记、归档快照、
 *   发布检查单草稿与模板、周目标、自定义任务模板、专注计时器运行态（runningFocus），
 *   以及离线缓存 + 待同步队列 + id 映射。
 */
import { watch, type Ref } from 'vue';

import { milestonesApi, projectsApi, releasesApi } from './api';
import type {
  CreateMilestoneApi,
  CreateProjectApi,
  CreateReleaseApi,
  MilestoneApi,
  ProjectApi,
  ReleaseApi,
  UpdateMilestoneApi,
  UpdateProjectApi,
} from './api';
import {
  createLocalIdMap,
  createSyncEngine,
  createSyncState,
  deepEqual,
  mergeSyncStates,
  type SyncEngine,
  type SyncState,
} from './sync-core';
import type { Milestone, MilestoneStatus, ProjectDetail, ProjectStatus } from './types';
import type { ReleaseRecord } from './releases';

// ── 同步开关（测试模式默认关闭；测试内显式开启） ──

let enabled = import.meta.env.MODE !== 'test';

export function isSyncEnabled(): boolean {
  return enabled;
}

export function setSyncEnabled(value: boolean): void {
  enabled = value;
}

// ── 本地 id ↔ 服务端 id 映射（单例，跨引擎共享；任务引擎也复用 projectIdMap / taskIdMap） ──

export const projectIdMap = createLocalIdMap('projects');
export const milestoneIdMap = createLocalIdMap('milestones');
export const releaseIdMap = createLocalIdMap('releases');
/** 任务 id 映射（定义在本模块，tasks/sync 复用；避免跨 feature 循环依赖） */
export const taskIdMap = createLocalIdMap('tasks');

// ── 项目模型映射 ──

export function projectToLocal(raw: ProjectApi): ProjectDetail {
  const id = projectIdMap.localIdOf(raw.id, 'p');
  return {
    id,
    name: raw.name,
    description: raw.description || undefined,
    status: raw.archived ? 'archived' : (raw.status as ProjectStatus),
    ownerId: 'me',
    tags: raw.tags ?? [],
    techStack: raw.techStack ?? [],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    favorite: raw.favorite ?? false,
    progressMode: raw.progressMode === 'manual' ? 'manual' : 'auto',
    manualProgress: raw.progressMode === 'manual' ? raw.progress : undefined,
    targetDate: raw.targetDate ?? undefined,
    // 以下为本地专属字段，服务端无对应概念：hydrate 后由 mergeLocalExtras 从缓存恢复
    goal: undefined,
    startDate: undefined,
    estimatedHours: undefined,
  };
}

export function projectToApi(local: ProjectDetail): CreateProjectApi {
  return {
    name: local.name,
    description: local.description,
    status: local.status === 'archived' ? 'planning' : local.status,
    favorite: local.favorite,
    progressMode: local.progressMode,
    progress: local.manualProgress ?? 0,
    targetDate: local.targetDate,
    techStack: local.techStack,
    tags: local.tags,
  };
}

/** 更新仅发送变化字段（PATCH 语义）；progress 仅手动模式发送（auto 由服务端按任务计算） */
export function projectPatch(local: ProjectDetail, prev: ProjectDetail): UpdateProjectApi {
  const patch: UpdateProjectApi = {};
  if (local.name !== prev.name) patch.name = local.name;
  if ((local.description ?? '') !== (prev.description ?? '')) patch.description = local.description;
  const status = local.status === 'archived' ? 'planning' : local.status;
  const prevStatus = prev.status === 'archived' ? 'planning' : prev.status;
  if (status !== prevStatus) patch.status = status;
  if (local.favorite !== prev.favorite) patch.favorite = local.favorite;
  if (local.progressMode !== prev.progressMode) patch.progressMode = local.progressMode;
  if (local.progressMode === 'manual') {
    const value = local.manualProgress ?? prev.manualProgress ?? 0;
    if (value !== (prev.progressMode === 'manual' ? (prev.manualProgress ?? 0) : 0)) {
      patch.progress = value;
    }
  }
  if (local.targetDate !== prev.targetDate) patch.targetDate = local.targetDate;
  if (!deepEqual(local.techStack, prev.techStack)) patch.techStack = local.techStack;
  if (!deepEqual(local.tags, prev.tags)) patch.tags = local.tags;
  return patch;
}

/** 项目本地专属字段（服务端无）：hydrate 时从缓存合并回来 */
export function mergeProjectExtras(
  cached: ProjectDetail | undefined,
  hydrated: ProjectDetail,
): ProjectDetail {
  if (!cached) return hydrated;
  return {
    ...hydrated,
    goal: cached.goal,
    startDate: cached.startDate,
    estimatedHours: cached.estimatedHours,
  };
}

// ── 里程碑模型映射 ──

const MILESTONE_STATUS_TO_API: Record<MilestoneStatus, MilestoneApi['status']> = {
  planned: 'planned',
  'in-progress': 'in-progress',
  done: 'completed',
};

const MILESTONE_STATUS_TO_LOCAL: Record<MilestoneApi['status'], MilestoneStatus> = {
  planned: 'planned',
  'in-progress': 'in-progress',
  completed: 'done',
  // 后端 cancelled 在本地无对应状态：映射为 planned（文档化限制）
  cancelled: 'planned',
};

export function milestoneToLocal(raw: MilestoneApi): Milestone {
  const id = milestoneIdMap.localIdOf(raw.id, 'ms');
  return {
    id,
    projectId: raw.projectId ? projectIdMap.localIdOf(raw.projectId, 'p') : '',
    title: raw.name,
    description: raw.description || undefined,
    startDate: undefined,
    dueDate: raw.targetDate ?? undefined,
    status: MILESTONE_STATUS_TO_LOCAL[raw.status] ?? 'planned',
    order: raw.sortOrder ?? 0,
    taskIds: (raw.taskIds ?? []).map((sid) => taskIdMap.localIdOf(sid, 't')),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export function milestoneToApi(local: Milestone): CreateMilestoneApi {
  return {
    name: local.title,
    projectId: local.projectId || undefined,
    description: local.description ?? '',
    targetDate: local.dueDate,
    status: MILESTONE_STATUS_TO_API[local.status] ?? 'planned',
    taskIds: local.taskIds,
    sortOrder: local.order,
  };
}

export function milestonePatch(local: Milestone, prev: Milestone): UpdateMilestoneApi {
  const patch: UpdateMilestoneApi = {};
  if (local.title !== prev.title) patch.name = local.title;
  if (local.projectId !== prev.projectId) patch.projectId = local.projectId || undefined;
  if ((local.description ?? '') !== (prev.description ?? ''))
    patch.description = local.description ?? '';
  if (local.dueDate !== prev.dueDate) patch.targetDate = local.dueDate;
  if (local.status !== prev.status)
    patch.status = MILESTONE_STATUS_TO_API[local.status] ?? 'planned';
  if (local.order !== prev.order) patch.sortOrder = local.order;
  if (!deepEqual(local.taskIds, prev.taskIds)) patch.taskIds = local.taskIds;
  return patch;
}

/** 里程碑引用翻译：项目与关联任务都必须已同步到服务端，否则延迟重试 */
export function resolveMilestoneRefs(
  payload: CreateMilestoneApi,
): { ok: true; payload: CreateMilestoneApi } | { ok: false; reason: string } {
  const out: CreateMilestoneApi = { ...payload };
  if (payload.projectId) {
    const sid = projectIdMap.serverIdOf(payload.projectId);
    if (!sid) return { ok: false, reason: '里程碑关联的项目尚未同步' };
    out.projectId = sid;
  }
  const taskIds: string[] = [];
  for (const tid of payload.taskIds ?? []) {
    const sid = taskIdMap.serverIdOf(tid);
    if (!sid) return { ok: false, reason: '里程碑关联的任务尚未同步' };
    taskIds.push(sid);
  }
  out.taskIds = taskIds;
  return { ok: true, payload: out };
}

// ── 发布记录模型映射（本地 ReleaseRecord ↔ 后端 Release） ──

export function releaseToLocal(raw: ReleaseApi): ReleaseRecord {
  const id = releaseIdMap.localIdOf(raw.id, 'rel-r');
  const notes = raw.notes ? raw.notes.split('\n\n') : [];
  return {
    id,
    projectId: raw.projectId ? projectIdMap.localIdOf(raw.projectId, 'p') : '',
    version: raw.version,
    title: raw.summary,
    summary: notes[0] || undefined,
    releaseDate: raw.releaseDate ?? raw.createdAt.slice(0, 10),
    taskIds: (raw.taskIds ?? []).map((sid) => taskIdMap.localIdOf(sid, 't')),
    items: (raw.checklist ?? []).map((c, i) => ({
      id: `ri-${id}-${i}`,
      label: c.title,
      done: c.done,
    })),
    risks: notes[1] || undefined,
    fromChecklistId: '',
    createdAt: raw.createdAt,
  };
}

export function releaseToApi(local: ReleaseRecord): CreateReleaseApi {
  return {
    version: local.version,
    summary: local.title,
    status: 'published',
    projectId: local.projectId || undefined,
    checklist: local.items.map((i) => ({ title: i.label, done: i.done })),
    taskIds: local.taskIds,
    releaseDate: local.releaseDate,
    notes: [local.summary, local.risks].filter(Boolean).join('\n\n'),
  };
}

/** 发布记录引用翻译：项目必须已同步；关联任务过滤掉未同步的（记录为历史快照，容忍缺失） */
export function resolveReleaseRefs(
  payload: CreateReleaseApi,
): { ok: true; payload: CreateReleaseApi } | { ok: false; reason: string } {
  const out: CreateReleaseApi = { ...payload };
  if (payload.projectId) {
    const sid = projectIdMap.serverIdOf(payload.projectId);
    if (!sid) return { ok: false, reason: '发布记录关联的项目尚未同步' };
    out.projectId = sid;
  }
  const taskIds: string[] = [];
  for (const tid of payload.taskIds ?? []) {
    const sid = taskIdMap.serverIdOf(tid);
    if (sid) taskIds.push(sid);
  }
  out.taskIds = taskIds;
  return { ok: true, payload: out };
}

// ── 引擎装配 ──

export interface ProjectSyncHandle {
  /** 合并状态（横幅用） */
  state: SyncState;
  projects: SyncState;
  milestones: SyncState;
  /** 立即重试待同步队列 / 重新对账 */
  retry(): Promise<void>;
  /** 清空错误提示（不改变状态本身） */
  dismissError(): void;
}

export function createProjectSync(input: {
  projects: Ref<ProjectDetail[]>;
  milestones: Ref<Milestone[]>;
}): ProjectSyncHandle {
  const projectsState = createSyncState();
  const milestonesState = createSyncState();

  const projectsEngine: SyncEngine = createSyncEngine<ProjectDetail, CreateProjectApi, ProjectApi>({
    name: 'projects',
    list: input.projects,
    idOf: (p) => p.id,
    api: {
      list: () => projectsApi.list(),
      create: (p) => projectsApi.create(p),
      update: (id, p) => projectsApi.update(id, p),
      remove: (id) => projectsApi.remove(id, { permanent: true, taskStrategy: 'cascade' }),
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        return null;
      return projectToLocal(raw as ProjectApi);
    },
    toPayload: projectToApi,
    patchOf: projectPatch,
    mergeLocalExtras: mergeProjectExtras,
    onCreated: (localId, serverId) => projectIdMap.register(localId, serverId),
    serverIdOf: (localId) => projectIdMap.serverIdOf(localId),
    state: projectsState,
    storageKey: 'projects',
  });

  const milestonesEngine: SyncEngine = createSyncEngine<
    Milestone,
    CreateMilestoneApi,
    MilestoneApi
  >({
    name: 'milestones',
    list: input.milestones,
    idOf: (m) => m.id,
    api: {
      list: () => milestonesApi.list(),
      create: (p) => milestonesApi.create(p),
      update: (id, p) => milestonesApi.update(id, p),
      remove: (id) => milestonesApi.remove(id),
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        return null;
      return milestoneToLocal(raw as MilestoneApi);
    },
    toPayload: milestoneToApi,
    patchOf: milestonePatch,
    resolveRefs: resolveMilestoneRefs,
    onCreated: (localId, serverId) => milestoneIdMap.register(localId, serverId),
    serverIdOf: (localId) => milestoneIdMap.serverIdOf(localId),
    state: milestonesState,
    storageKey: 'milestones',
  });

  if (isSyncEnabled()) {
    projectsEngine.start();
    milestonesEngine.start();
  }

  // 合并状态：可变普通对象，子状态变化时刷新（Pinia 会把 store 深包为 reactive，模板可读）
  const state: SyncState = createSyncState();
  function refreshMerged(): void {
    const merged = mergeSyncStates([projectsState, milestonesState]);
    Object.assign(state, merged, { version: state.version + 1 });
  }
  watch([projectsState, milestonesState], refreshMerged, { deep: true });
  refreshMerged();

  return {
    state,
    projects: projectsState,
    milestones: milestonesState,
    async retry() {
      if (projectsState.dirty > 0 || projectsState.status === 'offline')
        await projectsEngine.flush();
      else if (projectsState.source === 'local') await projectsEngine.hydrate();
      if (milestonesState.dirty > 0 || milestonesState.status === 'offline')
        await milestonesEngine.flush();
      else if (milestonesState.source === 'local') await milestonesEngine.hydrate();
    },
    dismissError() {
      if (projectsState.lastError) bumpState(projectsState, { lastError: null });
      if (milestonesState.lastError) bumpState(milestonesState, { lastError: null });
    },
  };
}

function bumpState(state: SyncState, patch: Partial<Omit<SyncState, 'version'>>): void {
  Object.assign(state, patch, { version: state.version + 1 });
}

// ── 发布记录同步（release-store 装配用） ──

export interface ReleasesSyncHandle {
  state: SyncState;
  retry(): Promise<void>;
  dismissError(): void;
}

export function createReleasesSync(records: Ref<ReleaseRecord[]>): ReleasesSyncHandle {
  const state = createSyncState();

  const engine = createSyncEngine<ReleaseRecord, CreateReleaseApi, ReleaseApi>({
    name: 'releases',
    list: records,
    idOf: (r) => r.id,
    api: {
      list: () => releasesApi.list(),
      create: (p) => releasesApi.create(p),
      update: (id, p) => releasesApi.update(id, p),
      remove: (id) => releasesApi.remove(id),
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        return null;
      return releaseToLocal(raw as ReleaseApi);
    },
    toPayload: releaseToApi,
    patchOf: releaseToApi,
    mergeLocalExtras: (cached, hydrated) =>
      cached
        ? {
            ...hydrated,
            summary: cached.summary,
            risks: cached.risks,
            fromChecklistId: cached.fromChecklistId,
          }
        : hydrated,
    resolveRefs: resolveReleaseRefs,
    onCreated: (localId, serverId) => releaseIdMap.register(localId, serverId),
    serverIdOf: (localId) => releaseIdMap.serverIdOf(localId),
    state,
    storageKey: 'releases',
  });

  if (isSyncEnabled()) engine.start();

  return {
    state,
    async retry() {
      await engine.flush();
    },
    dismissError() {
      if (state.lastError) bumpState(state, { lastError: null });
    },
  };
}
