/**
 * 任务功能域 —— 本地持久化层（repository）
 *
 * 职责：
 * - 统一封装 localStorage 读写（组件 / store 不得直接访问 localStorage）；
 * - 带版本字段的信封格式 { version, data }，支持严格结构校验；
 * - 旧版本（v1）自动迁移；损坏 / 版本过新 / 写入失败时降级到种子或
 *   返回失败原因，保证页面可用。
 *
 * 版本历史：
 * - v1（legacy）：{ tasks, sortBy, sortDir } 裸对象，无信封、无校验；
 * - v2（当前）：{ version: 2, data: { tasks, events, sortBy, sortDir } }，
 *   任务增加 subtasks，新增任务活动历史 events。
 */
import { SEED_TASKS } from './mock';
import type { TaskPriority, TaskStatus } from '@personal-os/types';
import type {
  SubTask,
  TaskDateFilter,
  TaskEvent,
  TaskEventType,
  TaskItem,
  TaskSortKey,
} from './types';

export const TASKS_VERSION = 2;
export const TASKS_KEY = 'personal-os.tasks.v2';
export const TASKS_LEGACY_KEY = 'personal-os.tasks.v1';
export const TASKS_UI_KEY = 'personal-os.tasks.ui.v2';

export const TASK_UI_DEFAULTS = {
  dateFilter: 'all' as TaskDateFilter,
  /** 看板 / 日期视图 */
  viewMode: 'kanban' as 'kanban' | 'date',
};

export interface TaskUiPrefs {
  dateFilter: TaskDateFilter;
  viewMode: 'kanban' | 'date';
}

export interface PersistedTaskState {
  tasks: TaskItem[];
  events: TaskEvent[];
  sortBy: TaskSortKey;
  sortDir: 'asc' | 'desc';
}

/** 读取结果：data 一定可用（失败时已回退种子），notice 为可展示的非阻塞提示 */
export interface LoadResult<T> {
  data: T;
  notice: string | null;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

const STATUSES = new Set<TaskStatus>(['todo', 'in-progress', 'done', 'cancelled']);
const PRIORITIES = new Set<TaskPriority>(['low', 'medium', 'high', 'urgent']);
const EVENT_TYPES = new Set<TaskEventType>(['created', 'updated', 'moved', 'deleted', 'subtask']);

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
  // v1 数据无 subtasks 字段，迁移时补默认空数组
  const subtaskRaw = Array.isArray(t.subtasks) ? t.subtasks : [];
  const subtasks = subtaskRaw.map(normalizeSubtask);
  if (subtasks.some((x) => x === null)) return null;
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

export function normalizePersistedState(raw: unknown): PersistedTaskState | null {
  if (!isPlainObject(raw)) return null;
  const tasks = normalizeTaskList(raw.tasks);
  if (tasks === null) return null;
  const eventsRaw = Array.isArray(raw.events) ? raw.events : [];
  const events = normalizeEventList(eventsRaw);
  if (events === null) return null;
  return {
    tasks,
    events,
    sortBy: str(raw.sortBy) ? (raw.sortBy as TaskSortKey) : 'order',
    sortDir: raw.sortDir === 'asc' || raw.sortDir === 'desc' ? raw.sortDir : 'asc',
  };
}

export function normalizeUiPrefs(raw: unknown): TaskUiPrefs {
  if (!isPlainObject(raw)) return { ...TASK_UI_DEFAULTS };
  return {
    dateFilter: str(raw.dateFilter)
      ? (raw.dateFilter as TaskDateFilter)
      : TASK_UI_DEFAULTS.dateFilter,
    viewMode: raw.viewMode === 'date' ? 'date' : TASK_UI_DEFAULTS.viewMode,
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
  }));
}

function cloneSeeds(): PersistedTaskState {
  return {
    tasks: cloneTasks(SEED_TASKS),
    events: [],
    sortBy: 'order',
    sortDir: 'asc',
  };
}

// ── 领域加载 / 保存 ──

/** 旧版 v1（{ tasks, sortBy, sortDir }）→ v2 归一化迁移 */
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
    };
  } catch {
    return null;
  }
}

export function loadTaskState(): LoadResult<PersistedTaskState> {
  const outcome = readEnvelope(TASKS_KEY, TASKS_VERSION, normalizePersistedState);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'empty' || outcome.status === 'corrupt') {
    const legacy = migrateLegacyState();
    if (legacy) {
      writeEnvelope(TASKS_KEY, TASKS_VERSION, legacy);
      return { data: legacy, notice: '本地任务数据已从旧版本升级' };
    }
  }
  if (outcome.status === 'newer') {
    return {
      data: cloneSeeds(),
      notice: `本地任务数据版本过新（v${outcome.version}），已使用示例数据，请升级应用`,
    };
  }
  return {
    data: cloneSeeds(),
    notice: '本地任务数据无法读取，已恢复为示例数据',
  };
}

export function saveTaskState(data: PersistedTaskState): SaveResult {
  return writeEnvelope(TASKS_KEY, TASKS_VERSION, data);
}

export function loadTasksUi(): TaskUiPrefs {
  const outcome = readEnvelope(TASKS_UI_KEY, TASKS_VERSION, normalizeUiPrefs);
  return outcome.status === 'ok' ? outcome.data : { ...TASK_UI_DEFAULTS };
}

export function saveTasksUi(prefs: TaskUiPrefs): SaveResult {
  return writeEnvelope(TASKS_UI_KEY, TASKS_VERSION, prefs);
}

/** 清理任务事件（外部显式调用，如删除任务时级联） */
export function clearLegacyTasksKey(): void {
  try {
    localStorage.removeItem(TASKS_LEGACY_KEY);
  } catch {
    /* 忽略 */
  }
}
