/**
 * 任务功能域 —— 服务端同步装配（Tasks / 今日计划 / 计划历史 / 专注记录）
 *
 * 职责：
 * - 本地 TaskItem ↔ 后端 TaskJson 映射（subtasks 无 id，hydrate 时按索引确定性生成；
 *   blocked 为前端派生字段不上送；order ↔ sortOrder；dependsOn ↔ dependencies）；
 * - 今日计划（focus + focusDone）与已归档日计划（focusHistory）映射到后端 focus/plans；
 * - 专注记录（focusSessions）映射到后端 focus/sessions（status 以 note 标记保留）；
 * - 任务依赖 / 项目归属引用翻译：本地 id → 服务端 id，未就绪时延迟重试。
 *
 * 本地专属（不参与服务端同步）：活动历史 events、运行中计时器 runningFocus、
 * 自定义任务模板、子任务的本地 id（服务端仅存 title/done）。
 */
import { watch, type Ref } from 'vue';

import { focusApi, tasksApi } from './api';
import type { Paginated } from '@/features/projects/api';
import type {
  CreateSessionApi,
  CreateTaskApi,
  FocusPlanApi,
  FocusSessionApi,
  TaskApi,
  UpdateTaskApi,
  UpsertPlanApi,
} from './api';
import { sessionDate } from './focus';
import { taskIdMap, projectIdMap, isSyncEnabled } from '@/features/projects/sync';
import {
  createLocalIdMap,
  createSyncEngine,
  createSyncState,
  bumpSyncState,
  deepEqual,
  isOfflineError,
  errorMessage,
  mergeSyncStates,
  type SyncState,
} from '@/features/projects/sync-core';
import type { FocusItem, FocusPlanDay, FocusSession, TaskItem } from './types';

// ── id 映射 ──

export const sessionIdMap = createLocalIdMap('focus-sessions');

/** focus 端点返回裸数组（无分页），适配为同步契约的分页形态 */
function asPage<T>(items: T[]): Paginated<T> {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: items.length,
    totalPages: items.length > 0 ? 1 : 0,
  };
}

// ── 日期窗口（计划历史 / 专注记录拉取范围） ──

function todayStr(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ── 任务模型映射 ──

export function taskToLocal(raw: TaskApi): TaskItem {
  const id = taskIdMap.localIdOf(raw.id, 't');
  return {
    id,
    projectId: raw.projectId ? projectIdMap.localIdOf(raw.projectId, 'p') : undefined,
    title: raw.title,
    description: raw.description || undefined,
    status: raw.status,
    priority: raw.priority,
    dueDate: raw.dueDate ?? undefined,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    tags: raw.tags ?? [],
    order: raw.sortOrder ?? 0,
    // 服务端子任务无 id：按索引确定性生成，保持同一会话内状态可追踪
    subtasks: (raw.subtasks ?? []).map((s, i) => ({
      id: `st-${id}-${i}`,
      title: s.title,
      done: s.done,
    })),
    dependsOn: (raw.dependencies ?? []).map((sid) => taskIdMap.localIdOf(sid, 't')),
    estimatedMinutes: (raw.estimatedMinutes ?? 0) > 0 ? raw.estimatedMinutes : undefined,
    actualMinutes: (raw.actualMinutes ?? 0) > 0 ? raw.actualMinutes : undefined,
    dod: raw.dod || undefined,
    blockedReason: raw.blockedReason || undefined,
  };
}

export function taskToApi(local: TaskItem): CreateTaskApi {
  return {
    projectId: local.projectId ?? null,
    title: local.title,
    description: local.description ?? '',
    status: local.status,
    priority: local.priority,
    tags: local.tags,
    dueDate: local.dueDate,
    estimatedMinutes: local.estimatedMinutes ?? 0,
    actualMinutes: local.actualMinutes ?? 0,
    dod: local.dod ?? '',
    blockedReason: local.blockedReason ?? '',
    subtasks: local.subtasks.map((s) => ({ title: s.title, done: s.done })),
    dependencies: local.dependsOn,
    sortOrder: local.order,
  };
}

function subtaskSignature(list: { title: string; done: boolean }[]): string {
  return JSON.stringify(list);
}

export function taskPatch(local: TaskItem, prev: TaskItem): UpdateTaskApi {
  const patch: UpdateTaskApi = {};
  if (local.title !== prev.title) patch.title = local.title;
  if (local.projectId !== prev.projectId) patch.projectId = local.projectId ?? null;
  if ((local.description ?? '') !== (prev.description ?? ''))
    patch.description = local.description ?? '';
  if (local.status !== prev.status) patch.status = local.status;
  if (local.priority !== prev.priority) patch.priority = local.priority;
  if (!deepEqual(local.tags, prev.tags)) patch.tags = local.tags;
  if (local.dueDate !== prev.dueDate) patch.dueDate = local.dueDate;
  if ((local.estimatedMinutes ?? 0) !== (prev.estimatedMinutes ?? 0)) {
    patch.estimatedMinutes = local.estimatedMinutes ?? 0;
  }
  if ((local.actualMinutes ?? 0) !== (prev.actualMinutes ?? 0)) {
    patch.actualMinutes = local.actualMinutes ?? 0;
  }
  if ((local.dod ?? '') !== (prev.dod ?? '')) patch.dod = local.dod ?? '';
  if ((local.blockedReason ?? '') !== (prev.blockedReason ?? '')) {
    patch.blockedReason = local.blockedReason ?? '';
  }
  if (!deepEqual(local.dependsOn, prev.dependsOn)) patch.dependencies = local.dependsOn;
  if (local.order !== prev.order) patch.sortOrder = local.order;
  if (subtaskSignature(local.subtasks) !== subtaskSignature(prev.subtasks)) {
    patch.subtasks = local.subtasks.map((s) => ({ title: s.title, done: s.done }));
  }
  return patch;
}

/** 任务引用翻译：项目归属与依赖必须都已同步，否则延迟重试 */
export function resolveTaskRefs(
  payload: CreateTaskApi,
): { ok: true; payload: CreateTaskApi } | { ok: false; reason: string } {
  const out: CreateTaskApi = { ...payload };
  if (payload.projectId != null) {
    const sid = projectIdMap.serverIdOf(payload.projectId);
    if (!sid) return { ok: false, reason: '任务所属项目尚未同步' };
    out.projectId = sid;
  }
  const deps: string[] = [];
  for (const dep of payload.dependencies ?? []) {
    const sid = taskIdMap.serverIdOf(dep);
    if (!sid) return { ok: false, reason: '任务依赖尚未同步' };
    deps.push(sid);
  }
  out.dependencies = deps;
  return { ok: true, payload: out };
}

// ── 今日计划 / 计划历史模型映射 ──

/** 计划条目 → 后端 payload（taskId 仍为本地 id，由 resolveRefs 翻译） */
export function planDayToApi(
  day: FocusPlanDay,
  titleOf: (taskId: string) => string,
): UpsertPlanApi & { date: string } {
  return {
    date: day.date,
    note: '',
    items: day.items.map((f, i) => ({
      taskId: f.taskId,
      title: titleOf(f.taskId) || f.taskId,
      done: day.doneIds.includes(f.taskId),
      sortOrder: i,
    })),
  };
}

export function planToLocalDay(raw: FocusPlanApi, cached?: FocusPlanDay): FocusPlanDay | null {
  const items: FocusItem[] = [];
  for (const item of raw.items ?? []) {
    if (!item.taskId) continue; // 服务端允许自由条目，本地模型仅支持任务关联
    const plannedMinutes =
      cached?.items.find((c) => c.taskId === item.taskId)?.plannedMinutes ?? 25;
    items.push({ taskId: taskIdMap.localIdOf(item.taskId, 't'), plannedMinutes });
  }
  const doneIds = (raw.items ?? [])
    .filter((i) => i.done && i.taskId)
    .map((i) => taskIdMap.localIdOf(i.taskId!, 't'));
  if (items.length === 0 && doneIds.length === 0) return null; // 空计划不保留
  return { date: raw.date, items, doneIds: [...new Set(doneIds)] };
}

export function resolvePlanRefs(
  payload: UpsertPlanApi & { date: string },
): { ok: true; payload: UpsertPlanApi } | { ok: false; reason: string } {
  const items: NonNullable<UpsertPlanApi['items']> = [];
  for (const item of payload.items ?? []) {
    if (!item.taskId) continue;
    const sid = taskIdMap.serverIdOf(item.taskId);
    if (!sid) return { ok: false, reason: '计划关联的任务尚未同步' };
    items.push({ taskId: sid, title: item.title, done: item.done, sortOrder: item.sortOrder });
  }
  if (items.length < (payload.items ?? []).length) {
    return { ok: false, reason: '计划条目尚未全部同步' };
  }
  return { ok: true, payload: { note: payload.note, items } };
}

// ── 专注记录模型映射 ──

export function sessionToLocal(raw: FocusSessionApi): FocusSession {
  const id = sessionIdMap.localIdOf(raw.id, 'f');
  return {
    id,
    taskId: raw.taskId ? taskIdMap.localIdOf(raw.taskId, 't') : '',
    startedAt: raw.startedAt,
    endedAt: raw.endedAt ?? raw.startedAt,
    minutes:
      raw.durationMinutes ??
      Math.max(
        1,
        Math.round((Date.parse(raw.endedAt ?? raw.startedAt) - Date.parse(raw.startedAt)) / 60_000),
      ),
    status: raw.note === 'abandoned' ? 'abandoned' : 'completed',
  };
}

export function sessionToApi(local: FocusSession): CreateSessionApi {
  return {
    date: sessionDate(local.endedAt),
    startedAt: local.startedAt,
    endedAt: local.endedAt,
    durationMinutes: local.minutes,
    taskId: local.taskId || undefined,
    note: local.status === 'abandoned' ? 'abandoned' : '',
  };
}

export function resolveSessionRefs(
  payload: CreateSessionApi,
): { ok: true; payload: CreateSessionApi } | { ok: false; reason: string } {
  const out: CreateSessionApi = { ...payload };
  if (payload.taskId) {
    const sid = taskIdMap.serverIdOf(payload.taskId);
    if (!sid) return { ok: false, reason: '专注记录关联的任务尚未同步' };
    out.taskId = sid;
  }
  return { ok: true, payload: out };
}

// ── 今日计划同步（focus + focusDone，独立于集合引擎：按日期 upsert） ──

export interface TodayPlanSync {
  state: SyncState;
  push(): Promise<void>;
  hydrate(): Promise<void>;
  dispose(): void;
}

export function createTodayPlanSync(input: {
  focus: Ref<FocusItem[]>;
  focusDone: Ref<string[]>;
  titleOf: (taskId: string) => string;
  state: SyncState;
}): TodayPlanSync {
  const { focus, focusDone, titleOf, state } = input;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let lastSignature = '';

  function signature(): string {
    return JSON.stringify({
      items: focus.value.map((f) => [f.taskId, f.plannedMinutes]),
      done: [...focusDone.value].sort(),
    });
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void push();
    }, 600);
  }

  async function push(): Promise<void> {
    if (inFlight) return;
    if (focus.value.length === 0 && focusDone.value.length === 0) {
      // 今日计划为空：无需推送（服务端该日为空即等价状态）
      lastSignature = signature();
      return;
    }
    const sig = signature();
    if (sig === lastSignature) return;
    inFlight = true;
    bumpSyncState(state, { status: 'saving', busy: true });
    try {
      const payload = planDayToApi(
        {
          date: todayStr(),
          items: focus.value.map((f) => ({ ...f })),
          doneIds: [...focusDone.value],
        },
        titleOf,
      );
      const resolved = resolvePlanRefs(payload);
      if (!resolved.ok) {
        // 计划关联任务尚未同步：保留待同步标记，任务同步后由下次变更触发
        bumpSyncState(state, {
          status: 'idle',
          dirty: focus.value.length,
          lastError: resolved.reason,
          busy: false,
        });
        return;
      }
      await focusApi.upsertPlan(todayStr(), resolved.payload);
      lastSignature = sig;
      bumpSyncState(state, {
        status: 'idle',
        source: 'server',
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        dirty: 0,
        busy: false,
      });
    } catch (e) {
      if (isOfflineError(e)) {
        bumpSyncState(state, {
          status: 'offline',
          source: 'local',
          lastError: '无法连接服务端，今日计划保留在本地',
          busy: false,
        });
      } else {
        bumpSyncState(state, {
          status: 'error',
          source: 'local',
          lastError: errorMessage(e),
          busy: false,
        });
      }
    } finally {
      inFlight = false;
    }
  }

  async function hydrate(): Promise<void> {
    bumpSyncState(state, { status: 'loading' });
    try {
      let plan: FocusPlanApi | null = null;
      try {
        plan = await focusApi.getPlan(todayStr());
      } catch (e) {
        const status =
          (e as { statusCode?: number; status?: number }).statusCode ??
          (e as { status?: number }).status;
        if (status === 404) {
          plan = null; // 今日尚无计划
        } else {
          throw e;
        }
      }
      if (plan) {
        const cachedItems = new Map(focus.value.map((f) => [f.taskId, f.plannedMinutes]));
        const items: FocusItem[] = [];
        const doneIds: string[] = [];
        for (const item of plan.items ?? []) {
          if (!item.taskId) continue;
          const localTaskId = taskIdMap.localIdOf(item.taskId, 't');
          items.push({ taskId: localTaskId, plannedMinutes: cachedItems.get(localTaskId) ?? 25 });
          if (item.done) doneIds.push(localTaskId);
        }
        focus.value = items;
        focusDone.value = doneIds;
      } else if (focus.value.length > 0) {
        // 服务端今日为空但本地有计划：由 push 自动导入
        lastSignature = '';
        void push();
      }
      bumpSyncState(state, {
        status: 'idle',
        source: 'server',
        lastError: null,
        busy: false,
        lastSyncedAt: new Date().toISOString(),
      });
    } catch (e) {
      if (isOfflineError(e)) {
        bumpSyncState(state, {
          status: 'offline',
          source: 'local',
          lastError: '无法连接服务端，今日计划使用本地数据',
          busy: false,
        });
      } else {
        bumpSyncState(state, {
          status: 'error',
          source: 'local',
          lastError: errorMessage(e),
          busy: false,
        });
      }
    }
  }

  const stop = watch([focus, focusDone], schedule, { deep: true });

  return {
    state,
    push,
    hydrate,
    dispose: stop,
  };
}

// ── 引擎装配 ──

export interface TaskSyncHandle {
  /** 合并状态（横幅用） */
  state: SyncState;
  tasks: SyncState;
  focus: SyncState;
  sessions: SyncState;
  retry(): Promise<void>;
  dismissError(): void;
}

export function createTaskSync(input: {
  tasks: Ref<TaskItem[]>;
  focus: Ref<FocusItem[]>;
  focusDone: Ref<string[]>;
  focusHistory: Ref<FocusPlanDay[]>;
  focusSessions: Ref<FocusSession[]>;
  titleOf: (taskId: string) => string;
}): TaskSyncHandle {
  const tasksState = createSyncState();
  const focusState = createSyncState();
  const sessionsState = createSyncState();

  const tasksEngine = createSyncEngine<TaskItem, CreateTaskApi, TaskApi>({
    name: 'tasks',
    list: input.tasks,
    idOf: (t) => t.id,
    api: {
      list: () => tasksApi.list(),
      create: (p) => tasksApi.create(p),
      update: (id, p) => tasksApi.update(id, p),
      remove: (id) => tasksApi.remove(id),
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        return null;
      return taskToLocal(raw as TaskApi);
    },
    toPayload: taskToApi,
    patchOf: taskPatch,
    resolveRefs: resolveTaskRefs,
    onCreated: (localId, serverId) => taskIdMap.register(localId, serverId),
    serverIdOf: (localId) => taskIdMap.serverIdOf(localId),
    state: tasksState,
    storageKey: 'tasks',
  });

  const historyEngine = createSyncEngine<
    FocusPlanDay,
    UpsertPlanApi & { date: string },
    FocusPlanApi
  >({
    name: 'focus-history',
    list: input.focusHistory,
    idOf: (d) => d.date,
    api: {
      list: async () => asPage(await focusApi.listPlans({ from: daysAgo(400), to: todayStr() })),
      create: (p) => focusApi.upsertPlan(p.date, { note: p.note, items: p.items }),
      update: (date, p) => focusApi.upsertPlan(date, { note: p.note, items: p.items }),
      remove: async () => {
        /* 后端无删除端点：仅本地删除 */
      },
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { date?: unknown }).date !== 'string')
        return null;
      return planToLocalDay(raw as FocusPlanApi);
    },
    toPayload: (day) => planDayToApi(day, input.titleOf),
    patchOf: (day) => planDayToApi(day, input.titleOf),
    mergeLocalExtras: (cached, hydrated) =>
      cached
        ? {
            ...hydrated,
            items: hydrated.items.map((item) => ({
              ...item,
              plannedMinutes:
                cached.items.find((c) => c.taskId === item.taskId)?.plannedMinutes ??
                item.plannedMinutes,
            })),
          }
        : hydrated,
    resolveRefs: (payload) => resolvePlanRefs(payload),
    canRemove: false,
    state: focusState,
    storageKey: 'focus-history',
  });

  const sessionsEngine = createSyncEngine<FocusSession, CreateSessionApi, FocusSessionApi>({
    name: 'focus-sessions',
    list: input.focusSessions,
    idOf: (s) => s.id,
    api: {
      list: async () => asPage(await focusApi.listSessions({ from: daysAgo(180), to: todayStr() })),
      create: (p) => focusApi.createSession(p),
      update: async () => {
        /* 后端无单条更新端点：本地会话不修改 */
      },
      remove: (id) => focusApi.deleteSession(id),
    },
    toLocal: (raw) => {
      if (!raw || typeof raw !== 'object' || typeof (raw as { id?: unknown }).id !== 'string')
        return null;
      return sessionToLocal(raw as FocusSessionApi);
    },
    toPayload: sessionToApi,
    patchOf: sessionToApi,
    resolveRefs: resolveSessionRefs,
    onCreated: (localId, serverId) => sessionIdMap.register(localId, serverId),
    serverIdOf: (localId) => sessionIdMap.serverIdOf(localId),
    state: sessionsState,
    storageKey: 'focus-sessions',
  });

  const todayPlanSync = createTodayPlanSync({
    focus: input.focus,
    focusDone: input.focusDone,
    titleOf: input.titleOf,
    state: focusState,
  });

  if (isSyncEnabled()) {
    tasksEngine.start();
    historyEngine.start();
    sessionsEngine.start();
    void todayPlanSync.hydrate();
  }

  // 合并状态：可变普通对象，子状态变化时刷新
  const state: SyncState = createSyncState();
  function refreshMerged(): void {
    const merged = mergeSyncStates([tasksState, focusState, sessionsState]);
    Object.assign(state, merged, { version: state.version + 1 });
  }
  watch([tasksState, focusState, sessionsState], refreshMerged, { deep: true });
  refreshMerged();

  return {
    state,
    tasks: tasksState,
    focus: focusState,
    sessions: sessionsState,
    async retry() {
      if (tasksState.dirty > 0 || tasksState.status === 'offline') await tasksEngine.flush();
      else if (tasksState.source === 'local') await tasksEngine.hydrate();
      if (focusState.dirty > 0 || focusState.status === 'offline') {
        await historyEngine.flush();
        await todayPlanSync.push();
      } else if (focusState.source === 'local') {
        await historyEngine.hydrate();
        await todayPlanSync.hydrate();
      }
      if (sessionsState.dirty > 0 || sessionsState.status === 'offline')
        await sessionsEngine.flush();
      else if (sessionsState.source === 'local') await sessionsEngine.hydrate();
    },
    dismissError() {
      for (const s of [tasksState, focusState, sessionsState]) {
        if (s.lastError) bumpSyncState(s, { lastError: null });
      }
    },
  };
}
