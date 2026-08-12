/**
 * 项目功能域 —— 本地持久化层（repository）
 *
 * 职责：
 * - 统一封装 localStorage 读写（组件 / store 不得直接访问 localStorage）；
 * - 带版本字段的信封格式 { version, data }，支持严格结构校验；
 * - 旧版本（v1 裸数组）自动迁移；损坏 / 版本过新 / 写入失败时降级到种子或
 *   返回失败原因，保证页面可用。
 *
 * 版本历史：
 * - v1（legacy）：裸数组，无信封、无校验；
 * - v2（当前）：{ version: 2, data } 信封，项目增加 favorite / progressMode。
 */
import { SEED_ACTIVITIES, SEED_PROJECTS } from './mock';
import type { ProjectStatus } from '@personal-os/types';
import type {
  ProjectActivity,
  ProjectActivityType,
  ProjectDetail,
  ProjectProgressMode,
  ProjectSortKey,
  ProjectStatusFilter,
  ProjectViewFilter,
} from './types';

export const PROJECTS_VERSION = 2;
export const PROJECTS_KEY = 'personal-os.projects.v2';
export const PROJECTS_LEGACY_KEY = 'personal-os.projects.v1';
export const ACTIVITIES_KEY = 'personal-os.projects.activities.v2';
export const ACTIVITIES_LEGACY_KEY = 'personal-os.projects.activities.v1';
export const PROJECTS_UI_KEY = 'personal-os.projects.ui.v2';

export const PROJECT_UI_DEFAULTS = {
  searchQuery: '',
  statusFilter: 'all' as ProjectStatusFilter,
  viewFilter: 'all' as ProjectViewFilter,
  sortBy: 'updatedAt' as ProjectSortKey,
  sortDir: 'desc' as 'asc' | 'desc',
};

export interface ProjectUiPrefs {
  searchQuery: string;
  statusFilter: ProjectStatusFilter;
  viewFilter: ProjectViewFilter;
  sortBy: ProjectSortKey;
  sortDir: 'asc' | 'desc';
}

/** 读取结果：data 一定可用（失败时已回退种子），notice 为可展示的非阻塞提示 */
export interface LoadResult<T> {
  data: T;
  notice: string | null;
}

export type SaveResult = { ok: true } | { ok: false; reason: string };

const STATUSES = new Set<ProjectStatus>(['planning', 'active', 'paused', 'completed', 'archived']);
const ACTIVITY_TYPES = new Set<ProjectActivityType>([
  'created',
  'updated',
  'archived',
  'restored',
  'deleted',
  'task',
]);

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(x: unknown): x is string {
  return typeof x === 'string';
}

function num01(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x)
    ? Math.min(100, Math.max(0, Math.round(x)))
    : undefined;
}

// ── 严格结构校验 + 归一化 ──

/** 校验并归一化单个项目；不合法返回 null */
export function normalizeProject(raw: unknown): ProjectDetail | null {
  if (!isPlainObject(raw)) return null;
  const p = raw;
  if (
    !str(p.id) ||
    !str(p.name) ||
    !str(p.ownerId) ||
    !str(p.createdAt) ||
    !str(p.updatedAt) ||
    !str(p.status) ||
    !STATUSES.has(p.status as ProjectStatus) ||
    !Array.isArray(p.tags) ||
    !p.tags.every(str) ||
    !Array.isArray(p.techStack) ||
    !p.techStack.every(str)
  ) {
    return null;
  }
  const progressMode: ProjectProgressMode = p.progressMode === 'manual' ? 'manual' : 'auto';
  const manualProgress = num01(p.manualProgress);
  return {
    id: p.id,
    name: p.name,
    description: str(p.description) ? p.description : undefined,
    status: p.status as ProjectStatus,
    ownerId: p.ownerId,
    tags: p.tags as string[],
    techStack: p.techStack as string[],
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    favorite: p.favorite === true,
    progressMode,
    manualProgress,
  };
}

export function normalizeProjectList(raw: unknown): ProjectDetail[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeProject);
  if (list.some((x) => x === null)) return null;
  return list as ProjectDetail[];
}

export function normalizeActivity(raw: unknown): ProjectActivity | null {
  if (!isPlainObject(raw)) return null;
  const a = raw;
  if (
    !str(a.id) ||
    !str(a.projectId) ||
    !str(a.createdAt) ||
    !str(a.type) ||
    !ACTIVITY_TYPES.has(a.type as ProjectActivityType) ||
    !str(a.title)
  ) {
    return null;
  }
  return {
    id: a.id,
    projectId: a.projectId,
    type: a.type as ProjectActivityType,
    title: a.title,
    description: str(a.description) ? a.description : undefined,
    createdAt: a.createdAt,
  };
}

export function normalizeActivityList(raw: unknown): ProjectActivity[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeActivity);
  if (list.some((x) => x === null)) return null;
  return list as ProjectActivity[];
}

export function normalizeUiPrefs(raw: unknown): ProjectUiPrefs {
  if (!isPlainObject(raw)) return { ...PROJECT_UI_DEFAULTS };
  const s = raw;
  return {
    searchQuery: str(s.searchQuery) ? s.searchQuery : PROJECT_UI_DEFAULTS.searchQuery,
    statusFilter: str(s.statusFilter)
      ? (s.statusFilter as ProjectStatusFilter)
      : PROJECT_UI_DEFAULTS.statusFilter,
    viewFilter: str(s.viewFilter)
      ? (s.viewFilter as ProjectViewFilter)
      : PROJECT_UI_DEFAULTS.viewFilter,
    sortBy: str(s.sortBy) ? (s.sortBy as ProjectSortKey) : PROJECT_UI_DEFAULTS.sortBy,
    sortDir: s.sortDir === 'asc' || s.sortDir === 'desc' ? s.sortDir : PROJECT_UI_DEFAULTS.sortDir,
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

function cloneProjects(list: ProjectDetail[]): ProjectDetail[] {
  return list.map((p) => ({
    ...p,
    tags: [...p.tags],
    techStack: [...p.techStack],
  }));
}

function cloneActivities(list: ProjectActivity[]): ProjectActivity[] {
  return list.map((a) => ({ ...a }));
}

// ── 领域加载 / 保存 ──

/** 旧版 v1（裸数组）→ v2 归一化迁移 */
function migrateLegacyProjects(): ProjectDetail[] | null {
  try {
    const raw = localStorage.getItem(PROJECTS_LEGACY_KEY);
    if (!raw) return null;
    return normalizeProjectList(JSON.parse(raw));
  } catch {
    return null;
  }
}

function migrateLegacyActivities(): ProjectActivity[] | null {
  try {
    const raw = localStorage.getItem(ACTIVITIES_LEGACY_KEY);
    if (!raw) return null;
    return normalizeActivityList(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadProjectsData(): LoadResult<ProjectDetail[]> {
  const outcome = readEnvelope(PROJECTS_KEY, PROJECTS_VERSION, normalizeProjectList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'empty' || outcome.status === 'corrupt' || outcome.status === 'newer') {
    const legacy = migrateLegacyProjects();
    if (legacy) {
      // 迁移成功后立即以新格式落盘，旧 key 保留不删（可回滚）
      writeEnvelope(PROJECTS_KEY, PROJECTS_VERSION, legacy);
      return { data: legacy, notice: '本地项目数据已从旧版本升级' };
    }
  }
  if (outcome.status === 'newer') {
    return {
      data: cloneProjects(SEED_PROJECTS),
      notice: `本地项目数据版本过新（v${outcome.version}），已使用示例数据，请升级应用`,
    };
  }
  return {
    data: cloneProjects(SEED_PROJECTS),
    notice: '本地项目数据无法读取，已恢复为示例数据',
  };
}

export function loadActivitiesData(): LoadResult<ProjectActivity[]> {
  const outcome = readEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, normalizeActivityList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  const legacy = migrateLegacyActivities();
  if (legacy) {
    writeEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, legacy);
    return { data: legacy, notice: null };
  }
  return { data: cloneActivities(SEED_ACTIVITIES), notice: null };
}

export function saveProjectsData(data: ProjectDetail[]): SaveResult {
  return writeEnvelope(PROJECTS_KEY, PROJECTS_VERSION, data);
}

export function saveActivitiesData(data: ProjectActivity[]): SaveResult {
  return writeEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, data);
}

export function loadProjectsUi(): ProjectUiPrefs {
  const outcome = readEnvelope(PROJECTS_UI_KEY, PROJECTS_VERSION, normalizeUiPrefs);
  return outcome.status === 'ok' ? outcome.data : { ...PROJECT_UI_DEFAULTS };
}

export function saveProjectsUi(prefs: ProjectUiPrefs): SaveResult {
  return writeEnvelope(PROJECTS_UI_KEY, PROJECTS_VERSION, prefs);
}

/** 移除旧版 key（仅在用户清空全部本地数据时由外部显式调用） */
export function clearLegacyProjectsKeys(): void {
  try {
    localStorage.removeItem(PROJECTS_LEGACY_KEY);
    localStorage.removeItem(ACTIVITIES_LEGACY_KEY);
  } catch {
    /* 忽略 */
  }
}
