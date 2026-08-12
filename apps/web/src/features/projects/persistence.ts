/**
 * 项目功能域 —— 本地持久化层（repository）
 *
 * 职责：
 * - 统一封装 localStorage 读写（组件 / store 不得直接访问 localStorage）；
 * - 带版本字段的信封格式 { version, data }，支持严格结构校验；
 * - v1（裸数组）与 v2（旧信封）自动迁移到 v3，旧 key 保留可回滚；
 * - 损坏 / 版本过新 / 写入失败时降级到种子或返回失败原因，保证页面可用。
 *
 * 版本历史：
 * - v1（legacy）：projects 裸数组 / activities 裸数组，无信封；
 * - v2：{ version: 2, data: ProjectDetail[] } 信封，项目增加 favorite / progressMode；
 * - v3（当前）：{ version: 3, data: { projects, milestones } }，
 *   项目增加计划字段（goal / startDate / targetDate / estimatedHours），
 *   新增里程碑、复盘笔记、归档快照三个独立信封。
 */
import { SEED_ACTIVITIES, SEED_PROJECTS } from './mock';
import { isValidDateStr } from './plan';
import { sanitizeMilestoneTaskIds } from './milestones';
import type { ProjectStatus } from '@personal-os/types';
import type { TaskItem } from '@/features/tasks/types';
import type {
  Milestone,
  MilestoneForm,
  MilestoneStatus,
  ProjectActivity,
  ProjectActivityType,
  ProjectDetail,
  ProjectProgressMode,
  ProjectSnapshot,
  ProjectSortKey,
  ProjectStatusFilter,
  ProjectViewFilter,
  Retrospective,
} from './types';

export const PROJECTS_VERSION = 3;
export const PROJECTS_KEY = 'personal-os.projects.v3';
export const PROJECTS_V2_KEY = 'personal-os.projects.v2';
export const PROJECTS_LEGACY_KEY = 'personal-os.projects.v1';
export const ACTIVITIES_KEY = 'personal-os.projects.activities.v3';
export const ACTIVITIES_V2_KEY = 'personal-os.projects.activities.v2';
export const ACTIVITIES_LEGACY_KEY = 'personal-os.projects.activities.v1';
export const PROJECTS_UI_KEY = 'personal-os.projects.ui.v3';
export const PROJECTS_UI_V2_KEY = 'personal-os.projects.ui.v2';
export const RETROSPECTIVES_KEY = 'personal-os.projects.retrospectives.v3';
export const SNAPSHOTS_KEY = 'personal-os.projects.snapshots.v3';

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

/** 项目 v3 信封数据：项目列表 + 里程碑列表 */
export interface PersistedProjectData {
  projects: ProjectDetail[];
  milestones: Milestone[];
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
  'milestone',
  'snapshot',
]);
const MILESTONE_STATUSES = new Set<MilestoneStatus>(['planned', 'in-progress', 'done']);

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

function numPositive(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.round(x) : undefined;
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
    goal: str(p.goal) ? p.goal : undefined,
    startDate: isValidDateStr(p.startDate) ? p.startDate : undefined,
    targetDate: isValidDateStr(p.targetDate) ? p.targetDate : undefined,
    estimatedHours: numPositive(p.estimatedHours),
  };
}

export function normalizeProjectList(raw: unknown): ProjectDetail[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeProject);
  if (list.some((x) => x === null)) return null;
  // 清洗重复 id（保留首次出现）
  const seen = new Set<string>();
  const out: ProjectDetail[] = [];
  for (const p of list as ProjectDetail[]) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

export function normalizeMilestone(raw: unknown): Milestone | null {
  if (!isPlainObject(raw)) return null;
  const m = raw;
  if (
    !str(m.id) ||
    !str(m.projectId) ||
    !str(m.title) ||
    !str(m.createdAt) ||
    !str(m.updatedAt) ||
    !str(m.status) ||
    !MILESTONE_STATUSES.has(m.status as MilestoneStatus) ||
    typeof m.order !== 'number' ||
    !Array.isArray(m.taskIds) ||
    !m.taskIds.every(str)
  ) {
    return null;
  }
  return {
    id: m.id,
    projectId: m.projectId,
    title: m.title,
    description: str(m.description) ? m.description : undefined,
    startDate: isValidDateStr(m.startDate) ? m.startDate : undefined,
    dueDate: isValidDateStr(m.dueDate) ? m.dueDate : undefined,
    status: m.status as MilestoneStatus,
    order: m.order,
    taskIds: sanitizeMilestoneTaskIds(m.taskIds as string[]),
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

export function normalizeMilestoneList(raw: unknown): Milestone[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeMilestone);
  if (list.some((x) => x === null)) return null;
  const seen = new Set<string>();
  const out: Milestone[] = [];
  for (const m of list as Milestone[]) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push(m);
  }
  return out;
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
  const seen = new Set<string>();
  const out: ProjectActivity[] = [];
  for (const a of list as ProjectActivity[]) {
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    out.push(a);
  }
  return out;
}

export function normalizeRetrospective(raw: unknown): Retrospective | null {
  if (!isPlainObject(raw)) return null;
  const r = raw;
  if (!str(r.projectId) || !str(r.done) || !str(r.blockers) || !str(r.next) || !str(r.lessons)) {
    return null;
  }
  return {
    projectId: r.projectId,
    done: r.done,
    blockers: r.blockers,
    next: r.next,
    lessons: r.lessons,
    updatedAt: str(r.updatedAt) ? r.updatedAt : new Date().toISOString(),
  };
}

export function normalizeRetrospectiveList(raw: unknown): Retrospective[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeRetrospective);
  if (list.some((x) => x === null)) return null;
  return list as Retrospective[];
}

export function normalizeSnapshot(raw: unknown): ProjectSnapshot | null {
  if (!isPlainObject(raw)) return null;
  const s = raw;
  if (!str(s.id) || !str(s.projectId) || !str(s.createdAt) || !isPlainObject(s.data)) {
    return null;
  }
  const project = normalizeProject(s.data.project);
  if (!project) return null;
  const tasksRaw = Array.isArray(s.data.tasks) ? s.data.tasks : [];
  const milestonesRaw = Array.isArray(s.data.milestones) ? s.data.milestones : [];
  const activitiesRaw = Array.isArray(s.data.activities) ? s.data.activities : [];
  // 快照中的任务 / 里程碑 / 活动做宽松校验：任一不合法则该快照无效
  const tasks = tasksRaw
    .map(normalizeSnapshotTask)
    .filter((x) => x !== null) as unknown[] as TaskItem[];
  if (tasksRaw.length !== 0 && tasks.length !== tasksRaw.length) return null;
  const milestones = milestonesRaw
    .map(normalizeMilestone)
    .filter((x): x is Milestone => x !== null);
  if (milestonesRaw.length !== 0 && milestones.length !== milestonesRaw.length) return null;
  const activities = activitiesRaw
    .map(normalizeActivity)
    .filter((x): x is ProjectActivity => x !== null);
  if (activitiesRaw.length !== 0 && activities.length !== activitiesRaw.length) return null;
  return {
    id: s.id,
    projectId: s.projectId,
    createdAt: s.createdAt,
    data: {
      project,
      tasks,
      milestones,
      activities,
      retrospective: s.data.retrospective ? normalizeRetrospective(s.data.retrospective) : null,
    },
  };
}

/** 快照内任务的宽松归一化（避免依赖任务持久化层，仅保留快照展示所需字段） */
function normalizeSnapshotTask(raw: unknown): unknown {
  if (!isPlainObject(raw)) return null;
  if (
    !str(raw.id) ||
    !str(raw.title) ||
    !str(raw.status) ||
    !str(raw.priority) ||
    !str(raw.createdAt) ||
    !str(raw.updatedAt)
  ) {
    return null;
  }
  return raw;
}

export function normalizeSnapshotList(raw: unknown): ProjectSnapshot[] | null {
  if (!Array.isArray(raw)) return null;
  const list = raw.map(normalizeSnapshot);
  if (list.some((x) => x === null)) return null;
  const seen = new Set<string>();
  const out: ProjectSnapshot[] = [];
  for (const s of list as ProjectSnapshot[]) {
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    out.push(s);
  }
  return out;
}

/** 快照序列化（与导出一致，保证可重新导入） */
export function serializeSnapshot(snapshot: ProjectSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}

/** 快照 JSON 解析（纯函数）：导出文件必须能原样导回 */
export function parseSnapshotJson(
  text: string,
): { ok: true; snapshot: ProjectSnapshot } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON 解析失败，文件可能已损坏' };
  }
  const snapshot = normalizeSnapshot(parsed);
  if (!snapshot) return { ok: false, reason: '快照数据结构不合法，无法导入' };
  return { ok: true, snapshot };
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

/** v1（裸数组）→ 归一化 */
function migrateV1Projects(): ProjectDetail[] | null {
  try {
    const raw = localStorage.getItem(PROJECTS_LEGACY_KEY);
    if (!raw) return null;
    return normalizeProjectList(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** v2（旧信封，data 为数组）→ v3 结构 */
function migrateV2Projects(): PersistedProjectData | null {
  try {
    const raw = localStorage.getItem(PROJECTS_V2_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || typeof parsed.version !== 'number' || !('data' in parsed)) {
      return null;
    }
    if (parsed.version > 3) return null;
    const projects = normalizeProjectList(parsed.data);
    if (projects === null) return null;
    return { projects, milestones: [] };
  } catch {
    return null;
  }
}

export function loadProjectsData(): LoadResult<PersistedProjectData> {
  const outcome = readEnvelope(PROJECTS_KEY, PROJECTS_VERSION, (raw) => {
    if (!isPlainObject(raw)) return null;
    const projects = normalizeProjectList(raw.projects);
    if (projects === null) return null;
    const milestones = normalizeMilestoneList(Array.isArray(raw.milestones) ? raw.milestones : []);
    if (milestones === null) return null;
    return { projects, milestones };
  });
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'newer') {
    return {
      data: { projects: cloneProjects(SEED_PROJECTS), milestones: [] },
      notice: `本地项目数据版本过新（v${outcome.version}），已使用示例数据，请升级应用`,
    };
  }
  // 尝试 v2 → v3，再 v1 → v3
  const fromV2 = migrateV2Projects();
  if (fromV2) {
    writeEnvelope(PROJECTS_KEY, PROJECTS_VERSION, fromV2);
    return { data: fromV2, notice: '本地项目数据已从旧版本升级' };
  }
  const fromV1 = migrateV1Projects();
  if (fromV1) {
    const migrated = { projects: fromV1, milestones: [] };
    writeEnvelope(PROJECTS_KEY, PROJECTS_VERSION, migrated);
    return { data: migrated, notice: '本地项目数据已从旧版本升级' };
  }
  return {
    data: { projects: cloneProjects(SEED_PROJECTS), milestones: [] },
    notice: '本地项目数据无法读取，已恢复为示例数据',
  };
}

export function saveProjectsData(data: PersistedProjectData): SaveResult {
  return writeEnvelope(PROJECTS_KEY, PROJECTS_VERSION, data);
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

function migrateV2Activities(): ProjectActivity[] | null {
  try {
    const raw = localStorage.getItem(ACTIVITIES_V2_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed) || !('data' in parsed)) return null;
    return normalizeActivityList(parsed.data);
  } catch {
    return null;
  }
}

export function loadActivitiesData(): LoadResult<ProjectActivity[]> {
  const outcome = readEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, normalizeActivityList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  const fromV2 = migrateV2Activities();
  if (fromV2) {
    writeEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, fromV2);
    return { data: fromV2, notice: null };
  }
  const fromV1 = migrateLegacyActivities();
  if (fromV1) {
    writeEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, fromV1);
    return { data: fromV1, notice: null };
  }
  return { data: cloneActivities(SEED_ACTIVITIES), notice: null };
}

export function saveActivitiesData(data: ProjectActivity[]): SaveResult {
  return writeEnvelope(ACTIVITIES_KEY, PROJECTS_VERSION, data);
}

// ── 复盘笔记 ──

export function loadRetrospectives(): LoadResult<Retrospective[]> {
  const outcome = readEnvelope(RETROSPECTIVES_KEY, PROJECTS_VERSION, normalizeRetrospectiveList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  return { data: [], notice: null };
}

export function saveRetrospectives(data: Retrospective[]): SaveResult {
  return writeEnvelope(RETROSPECTIVES_KEY, PROJECTS_VERSION, data);
}

// ── 归档快照 ──

export function loadSnapshots(): LoadResult<ProjectSnapshot[]> {
  const outcome = readEnvelope(SNAPSHOTS_KEY, PROJECTS_VERSION, normalizeSnapshotList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  return { data: [], notice: null };
}

export function saveSnapshots(data: ProjectSnapshot[]): SaveResult {
  return writeEnvelope(SNAPSHOTS_KEY, PROJECTS_VERSION, data);
}

// ── UI 偏好 ──

export function loadProjectsUi(): ProjectUiPrefs {
  const outcome = readEnvelope(PROJECTS_UI_KEY, PROJECTS_VERSION, normalizeUiPrefs);
  if (outcome.status === 'ok') return outcome.data;
  // 兼容旧 v2 UI key
  try {
    const raw = localStorage.getItem(PROJECTS_UI_V2_KEY);
    if (raw) {
      const prefs = normalizeUiPrefs(JSON.parse(raw));
      writeEnvelope(PROJECTS_UI_KEY, PROJECTS_VERSION, prefs);
      return prefs;
    }
  } catch {
    /* 忽略 */
  }
  return { ...PROJECT_UI_DEFAULTS };
}

export function saveProjectsUi(prefs: ProjectUiPrefs): SaveResult {
  return writeEnvelope(PROJECTS_UI_KEY, PROJECTS_VERSION, prefs);
}

/** 移除旧版 key（仅在用户清空全部本地数据时由外部显式调用） */
export function clearLegacyProjectsKeys(): void {
  try {
    localStorage.removeItem(PROJECTS_LEGACY_KEY);
    localStorage.removeItem(PROJECTS_V2_KEY);
    localStorage.removeItem(ACTIVITIES_LEGACY_KEY);
    localStorage.removeItem(ACTIVITIES_V2_KEY);
  } catch {
    /* 忽略 */
  }
}

/** 里程碑表单 → 可编辑的 Milestone 辅助（store 使用） */
export function milestoneFromForm(
  form: MilestoneForm,
  existing: Milestone | null,
): Omit<Milestone, 'id' | 'projectId' | 'createdAt'> {
  const now = new Date().toISOString();
  return {
    title: form.title.trim(),
    description: form.description?.trim() || undefined,
    startDate: isValidDateStr(form.startDate) ? form.startDate : undefined,
    dueDate: isValidDateStr(form.dueDate) ? form.dueDate : undefined,
    status: form.status,
    taskIds: sanitizeMilestoneTaskIds(form.taskIds),
    order: existing?.order ?? 0,
    updatedAt: existing?.updatedAt ?? now,
  };
}
