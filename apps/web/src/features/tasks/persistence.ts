/**
 * 任务功能域 —— 本地持久化层（repository）
 *
 * 职责：
 * - 统一封装 localStorage 读写（组件 / store 不得直接访问 localStorage）；
 * - 带版本字段的信封格式 { version, data }，支持严格结构校验；
 * - v1（裸对象）与 v2（旧信封）自动迁移到 v3，旧 key 保留可回滚；
 * - 迁移时自动清理无效引用（任务指向不存在的项目 / 依赖任务）并报告；
 * - 损坏 / 版本过新 / 写入失败时降级到种子或返回失败原因，保证页面可用。
 *
 * 版本历史：
 * - v1（legacy）：{ tasks, sortBy, sortDir } 裸对象；
 * - v2：{ version: 2, data: { tasks, events, sortBy, sortDir } }，
 *   任务增加 subtasks，新增 events；
 * - v3（当前）：data 增加 focus / focusSessions / runningFocus，
 *   任务增加 dependsOn（前置依赖）。
 */
import { SEED_TASKS } from './mock';
import type { TaskPriority, TaskStatus } from '@personal-os/types';
import type {
  FocusItem,
  FocusSession,
  RunningFocus,
  SubTask,
  TaskDateFilter,
  TaskEvent,
  TaskEventType,
  TaskItem,
  TaskQuickFilter,
  TaskSortKey,
} from './types';

export const TASKS_VERSION = 3;
export const TASKS_KEY = 'personal-os.tasks.v3';
export const TASKS_V2_KEY = 'personal-os.tasks.v2';
export const TASKS_LEGACY_KEY = 'personal-os.tasks.v1';
export const TASKS_UI_KEY = 'personal-os.tasks.ui.v3';
export const TASKS_UI_V2_KEY = 'personal-os.tasks.ui.v2';

export const TASK_UI_DEFAULTS = {
  dateFilter: 'all' as TaskDateFilter,
  /** 看板 / 日期视图 */
  viewMode: 'kanban' as 'kanban' | 'date',
  quickFilter: 'all' as TaskQuickFilter,
};

export interface TaskUiPrefs {
  dateFilter: TaskDateFilter;
  viewMode: 'kanban' | 'date';
  quickFilter: TaskQuickFilter;
}

/** 任务 v3 信封数据 */
export interface PersistedTaskState {
  tasks: TaskItem[];
  events: TaskEvent[];
  sortBy: TaskSortKey;
  sortDir: 'asc' | 'desc';
  focus: FocusItem[];
  focusSessions: FocusSession[];
  runningFocus: RunningFocus | null;
}

/** 迁移 / 引用清理报告 */
export interface MigrationReport {
  /** 清理了多少条指向不存在项目的任务引用 */
  cleanedProjectRefs: number;
  /** 清理了多少条指向不存在任务的依赖引用 */
  cleanedDependencyRefs: number;
}

/** 读取结果：data 一定可用（失败时已回退种子），notice 为可展示的非阻塞提示 */
export interface LoadResult<T> {
  data: T;
  notice: string | null;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

const STATUSES = new Set<TaskStatus>(['todo', 'in-progress', 'done', 'cancelled']);
const PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'urgent']);
const EVENT_TYPES = new Set<TaskEventType>([
  'created',
  'updated',
  'moved',
  'deleted',
  'subtask',
  'focus',
]);

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown): x is string {
  return typeof x === 'string';
}

// ── 严格结构校验 + 归一化 ──

export function normalizeSubtask(raw: unknown): SubTask | null {
  if (!isPlainObject(raw)) return null;
  if (!str(raw.id) || !str(raw.title) || typeof raw.done !== 'boolean') return null;
  return { id: raw.id, title: raw.title, done: raw.done };
}

export function normalizeTask(raw: unknown): TaskItem | null {
  if (!isPlainObject(raw)) return null;
  const t = raw;
  if (
    !str(t.id) ||
    !str(t.title) ||
    !str(t.createdAt) ||
    !str(t.updatedAt) ||
    !str(t.status) ||
    !STATUSES.has(t.status as TaskStatus) ||
    !str(t.priority) ||
    !PRIORITIES.has(t.priority as TaskPriority) ||
    typeof t.order !== 'number' ||
    !Array.isArray(t.tags) ||
    !t.tags.every(str)
  ) {
    return null;
  }
  const subtaskRaw = Array.isArray(t.subtasks) ? t.subtasks : [];
  const subtasks = subtaskRaw.map(normalizeSubtask);
  if (subtasks.some((x) => x === null)) return null;
  const dependsRaw = Array.isArray(t.dependsOn) ? t.dependsOn : [];
  if (!dependsRaw.every(str)) return null;
  return {
    id: t.id,
    projectId: str(t.projectId) ? t.projectId : undefined,
    title: t.title,
    description: str(t.description) ? t.description : undefined,
    status: t.status as TaskStatus,
    priority: t.priority as TaskPriority,
    assigneeId: str(t.assigneeId) ? t.assigneeId : undefined,
    dueDate: str(t.dueDate) ? t.dueDate : undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    tags: t.tags as string[],
    order: t.order,
    subtasks: subtasks as SubTask[],
    dependsOn: dependsRaw as string[],
  };
}

export function normalizeTaskList(raw: unknown): TaskItem[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeTask);
  if (list.some((x) => x === null)) return null;
  return list as TaskItem[];
}

export function normalizeEvent(raw: unknown): TaskEvent | null {
  if (!isPlainObject(raw)) return null;
  const e = raw;
  if (
    !str(e.id) ||
    !str(e.taskId) ||
    !str(e.title) ||
    !str(e.createdAt) ||
    !str(e.type) ||
    !EVENT_TYPES.has(e.type as TaskEventType)
  ) {
    return null;
  }
  return {
    id: e.id,
    taskId: e.taskId,
    type: e.type as TaskEventType,
    title: e.title,
    createdAt: e.createdAt,
  };
}

export function normalizeEventList(raw: unknown): TaskEvent[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeEvent);
  if (list.some((x) => x === null)) return null;
  return list as TaskEvent[];
}

export function normalizeFocusItem(raw: unknown): FocusItem | null {
  if (!isPlainObject(raw)) return null;
  if (!str(raw.taskId) || typeof raw.plannedMinutes !== 'number') return null;
  return { taskId: raw.taskId, plannedMinutes: Math.max(0, Math.round(raw.plannedMinutes)) };
}

export function normalizeFocusSession(raw: unknown): FocusSession | null {
  if (!isPlainObject(raw)) return null;
  const s = raw;
  if (
    !str(s.id) ||
    !str(s.taskId) ||
    !str(s.startedAt) ||
    !str(s.endedAt) ||
    typeof s.minutes !== 'number' ||
    (s.status !== 'completed' && s.status !== 'abandoned')
  ) {
    return null;
  }
  return {
    id: s.id,
    taskId: s.taskId,
    startedAt: s.startedAt,
    endedAt: s.endedAt,
    minutes: Math.max(1, Math.round(s.minutes)),
    status: s.status,
  };
}

export function normalizeRunningFocus(raw: unknown): RunningFocus | null {
  if (!isPlainObject(raw)) return null;
  const r = raw;
  if (
    !str(r.taskId) ||
    !str(r.startedAt) ||
    !str(r.lastResumeAt) ||
    typeof r.accumulatedMs !== 'number' ||
    (r.status !== 'running' && r.status !== 'paused')
  ) {
    return null;
  }
  return {
    taskId: r.taskId,
    startedAt: r.startedAt,
    accumulatedMs: Math.max(0, r.accumulatedMs),
    status: r.status,
    lastResumeAt: r.lastResumeAt,
  };
}

export function normalizePersistedState(raw: unknown): PersistedTaskState | null {
  if (!isPlainObject(raw)) return null;
  const tasks = normalizeTaskList(raw.tasks);
  if (tasks === null) return null;
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events = normalizeEventList(eventsRaw);
  if (events === null) return null;
  const focusRaw = Array.isArray(raw.focus) ? raw.focus : [];
  const focus = focusRaw.map(normalizeFocusItem);
  if (focus.some((x) => x === null)) return null;
  const sessionsRaw = Array.isArray(raw.focusSessions) ? raw.focusSessions : [];
  const sessions = sessionsRaw.map(normalizeFocusSession);
  if (sessions.some((x) => x === null)) return null;
  return {
    tasks,
    events,
    sortBy: str(raw.sortBy) ? (raw.sortBy as TaskSortKey) : 'order',
    sortDir: raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'asc',
    focus: focus as FocusItem[],
    focusSessions: sessions as FocusSession[],
    runningFocus: normalizeRunningFocus(raw.runningFocus),
  };
}

export function normalizeUiPrefs(raw: unknown): TaskUiPrefs {
  if (!isPlainObject(raw)) return { ...TASK_UI_DEFAULTS };
  return {
    dateFilter: str(raw.dateFilter)
      ? (raw.dateFilter as TaskDateFilter)
      : TASK_UI_DEFAULTS.dateFilter,
    viewMode: raw.viewMode === 'date' ? 'date' : TASK_UI_DEFAULTS.viewMode,
    quickFilter: str(raw.quickFilter)
      ? (raw.quickFilter as TaskQuickFilter)
      : TASK_UI_DEFAULTS.quickFilter,
  };
}

// ── 信封读写 ──

interface Envelope<T> {
  version: number;
  data: T;
}

type ReadOutcome<T> =
  | { status: 'ok'; data: T }
  | { status: 'empty' }
  | { status: 'corrupt'; reason: string }
  | { status: 'newer'; version: number };

function readEnvelope<T>(
  key: string,
  current: number,
  normalize: (raw: unknown) => T | null,
): ReadOutcome<T> {
  let raw: string | null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return { status: 'corrupt', reason: '本地存储不可访问' };
  }
  if (!raw) return { status: 'empty' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 'corrupt', reason: '本地数据解析失败' };
  }
  if (!isPlainObject(parsed) || typeof parsed.version !== 'number' || !('data' in parsed)) {
    return { status: 'corrupt', reason: '本地数据格式不合法' };
  }
  const version = parsed.version;
  if (version > current) return { status: 'newer', version };
  if (version < current) return { status: 'corrupt', reason: `本地数据版本过旧（v${version}）` };
  const data = normalize(parsed.data);
  if (data === null) return { status: 'corrupt', reason: '本地数据结构校验失败' };
  return { status: 'ok', data };
}

export function writeEnvelope<T>(key: string, version: number, data: T): SaveResult {
  try {
    const envelope: Envelope<T> = { version, data };
    localStorage.setItem(key, JSON.stringify(envelope));
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason:
        e instanceof DOMException && e.name === 'QuotaExceededError'
          ? '本地存储空间不足，更改未能保存'
          : '本地存储写入失败',
    };
  }
}

function cloneTasks(list: TaskItem[]): TaskItem[] {
  return list.map((t) => ({
    ...t,
    tags: [...t.tags],
    subtasks: t.subtasks.map((s) => ({ ...s })),
    dependsOn: [...t.dependsOn],
  }));
}

function cloneSeeds(): PersistedTaskState {
  return {
    tasks: cloneTasks(SEED_TASKS),
    events: [],
    sortBy: 'order',
    sortDir: 'asc',
    focus: [],
    focusSessions: [],
    runningFocus: null,
  };
}

// ── 领域加载 / 保存 ──

/** v1（裸对象）→ 归一化 */
function migrateLegacyState(): PersistedTaskState | null {
  try {
    const raw = localStorage.getItem(TASKS_LEGACY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    const tasks = normalizeTaskList(parsed.tasks);
    if (tasks === null) return null;
    return {
      tasks,
      events: [],
      sortBy: str(parsed.sortBy) ? (parsed.sortBy as TaskSortKey) : 'order',
      sortDir: parsed.sortDir === 'asc' || parsed.sortDir === 'desc' ? parsed.sortDir : 'asc',
      focus: [],
      focusSessions: [],
      runningFocus: null,
    };
  } catch {
    return null;
  }
}

/** v2（旧信封）→ v3 结构（补 focus 相关字段与 dependsOn） */
function migrateV2State(): PersistedTaskState | null {
  try {
    const raw = localStorage.getItem(TASKS_V2_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || typeof parsed.version !== 'number' || !('data' in parsed)) {
      return null;
    }
    if (parsed.version > 3) return null;
    const base = normalizePersistedState(parsed.data);
    if (base === null) return null;
    return {
      tasks: base.tasks,
      events: base.events,
      sortBy: base.sortBy,
      sortDir: base.sortDir,
      focus: [],
      focusSessions: [],
      runningFocus: null,
    };
  } catch {
    return null;
  }
}

/**
 * 清理无效引用（纯函数）：
 * - 任务指向不存在的项目 → 移除该任务（保留其余）；
 * - 任务 dependsOn 指向不存在任务（含被移除的任务）→ 移除该依赖。
 * 返回清理后的状态与报告。
 */
export function cleanupInvalidRefs(
  state: PersistedTaskState,
  validProjectIds: Set<string>,
): { state: PersistedTaskState; report: MigrationReport } {
  const kept: TaskItem[] = [];
  let cleanedProjectRefs = 0;
  let cleanedDependencyRefs = 0;

  for (const t of state.tasks) {
    if (t.projectId && !validProjectIds.has(t.projectId)) {
      cleanedProjectRefs += 1;
      continue; // 丢弃指向不存在项目的任务
    }
    kept.push(t);
  }

  // 依赖有效性以「保留后」的任务集合为准（前置任务本身被移除 → 依赖一并清理）
  const keptIds = new Set(kept.map((t) => t.id));
  const withCleanedDeps: TaskItem[] = [];
  for (const t of kept) {
    const deps = t.dependsOn.filter((d) => {
      if (keptIds.has(d)) return true;
      cleanedDependencyRefs += 1;
      return false;
    });
    withCleanedDeps.push(deps.length === t.dependsOn.length ? t : { ...t, dependsOn: deps });
  }

  return {
    state: {
      ...state,
      tasks: withCleanedDeps,
      events: state.events.filter((e) => keptIds.has(e.taskId)),
      focus: state.focus.filter((f) => keptIds.has(f.taskId)),
      focusSessions: state.focusSessions.filter((s) => keptIds.has(s.taskId)),
      runningFocus:
        state.runningFocus && keptIds.has(state.runningFocus.taskId) ? state.runningFocus : null,
    },
    report: { cleanedProjectRefs, cleanedDependencyRefs },
  };
}

export function loadTaskState(
  validProjectIds: Set<string>,
): LoadResult<PersistedTaskState> & { report: MigrationReport } {
  const emptyReport: MigrationReport = { cleanedProjectRefs: 0, cleanedDependencyRefs: 0 };
  const outcome = readEnvelope(TASKS_KEY, TASKS_VERSION, normalizePersistedState);
  if (outcome.status === 'ok') {
    const cleaned = cleanupInvalidRefs(outcome.data, validProjectIds);
    if (cleaned.report.cleanedProjectRefs || cleaned.report.cleanedDependencyRefs) {
      writeEnvelope(TASKS_KEY, TASKS_VERSION, cleaned.state);
    }
    return { data: cleaned.state, notice: null, report: cleaned.report };
  }
  if (outcome.status === 'newer') {
    return {
      data: cloneSeeds(),
      notice: `本地任务数据版本过新（v${outcome.version}），已使用示例数据，请升级应用`,
      report: emptyReport,
    };
  }
  // v2 → v3，再 v1 → v3
  const fromV2 = migrateV2State();
  if (fromV2) {
    const cleaned = cleanupInvalidRefs(fromV2, validProjectIds);
    writeEnvelope(TASKS_KEY, TASKS_VERSION, cleaned.state);
    return { data: cleaned.state, notice: '本地任务数据已从旧版本升级', report: cleaned.report };
  }
  const fromV1 = migrateLegacyState();
  if (fromV1) {
    const cleaned = cleanupInvalidRefs(fromV1, validProjectIds);
    writeEnvelope(TASKS_KEY, TASKS_VERSION, cleaned.state);
    return { data: cleaned.state, notice: '本地任务数据已从旧版本升级', report: cleaned.report };
  }
  return {
    data: cloneSeeds(),
    notice: '本地任务数据无法读取，已恢复为示例数据',
    report: emptyReport,
  };
}

export function saveTaskState(data: PersistedTaskState): SaveResult {
  return writeEnvelope(TASKS_KEY, TASKS_VERSION, data);
}

export function loadTasksUi(): TaskUiPrefs {
  const outcome = readEnvelope(TASKS_UI_KEY, TASKS_VERSION, normalizeUiPrefs);
  if (outcome.status === 'ok') return outcome.data;
  try {
    const raw = localStorage.getItem(TASKS_UI_V2_KEY);
    if (raw) {
      const prefs = normalizeUiPrefs(JSON.parse(raw));
      writeEnvelope(TASKS_UI_KEY, TASKS_VERSION, prefs);
      return prefs;
    }
  } catch {
    /* 忽略 */
  }
  return { ...TASK_UI_DEFAULTS };
}

export function saveTasksUi(prefs: TaskUiPrefs): SaveResult {
  return writeEnvelope(TASKS_UI_KEY, TASKS_VERSION, prefs);
}

/** 清理任务事件（外部显式调用，如删除任务时级联） */
export function clearLegacyTasksKey(): void {
  try {
    localStorage.removeItem(TASKS_LEGACY_KEY);
    localStorage.removeItem(TASKS_V2_KEY);
  } catch {
    /* 忽略 */
  }
}
