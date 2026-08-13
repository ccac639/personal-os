/**
 * 成果库数据持久化层（localStorage）
 *
 * - 数据格式：`{ version, seq, collectionSeq, items, collections, savedFilters }` 信封，
 *   version 用于迁移与兼容判断（v2 新增集合 / 筛选方案 / 关系 / 复用包）。
 * - UI 偏好（视图/筛选/排序）独立存储：损坏时只回退 UI，不动成果数据。
 * - 所有读取都经过清洗（字段缺失/非法日期/重复 ID/非法链接），保证结构一致。
 * - 附件（复用包关键链接）仅保存 URL 与名称，绝不持久化文件二进制。
 */
import { ACHIEVEMENT_TYPES, sanitizeCollectionColor } from './constants';
import { emptyFilters, emptyRelations, emptyReuse } from './types';
import { isValidDateString, isValidIso, isValidUrl } from './validation';
import type {
  Achievement,
  AchievementCollection,
  AchievementFilters,
  AchievementRelations,
  AchievementType,
  AchievementUiState,
  AchievementView,
  CollectionDraft,
  LinkItem,
  ReusePackage,
  SavedFilter,
} from './types';

export const STORAGE_VERSION = 2;
export const ACHIEVEMENT_STORAGE_KEY = 'personal-os-achievements-v1';
export const ACHIEVEMENT_UI_STORAGE_KEY = 'personal-os-achievements-ui-v1';

/** 成果数据信封（v2） */
export interface AchievementStorageData {
  version: number;
  /** 成果自增 id 基数（保证跨会话不重复） */
  seq: number;
  /** 集合自增 id 基数 */
  collectionSeq: number;
  items: Achievement[];
  collections: AchievementCollection[];
  savedFilters: SavedFilter[];
}

/** 导入/导出负载（成果 + 集合；筛选方案不随导入流转） */
export interface ImportPayload {
  items: Achievement[];
  collections: AchievementCollection[];
}

/** 导入冲突策略：跳过 / 覆盖 / 复制为新条目 */
export type ImportMode = 'skip' | 'overwrite' | 'copy';

const TYPE_SET = new Set<string>(ACHIEVEMENT_TYPES);
const SORT_SET = new Set<string>(['date-desc', 'date-asc', 'updated', 'title', 'manual']);
const VIEW_SET = new Set<string>(['card', 'list', 'timeline']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function uniqueStrings(v: unknown, max = 20): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x.trim()) continue;
    const t = x.trim().slice(0, 30);
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, max);
}

/** 引用 id 列表清洗（去重去空，上限 50 条，防异常数据膨胀） */
function sanitizeIdList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x.trim()) continue;
    const t = x.trim().slice(0, 80);
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, 50);
}

function sanitizeRelations(raw: unknown): AchievementRelations {
  if (!isRecord(raw)) return emptyRelations();
  return {
    projectIds: sanitizeIdList(raw.projectIds),
    workflowIds: sanitizeIdList(raw.workflowIds),
    predecessorIds: sanitizeIdList(raw.predecessorIds),
    derivedIds: sanitizeIdList(raw.derivedIds),
  };
}

/** 关键链接清洗：仅接受 http/https，标签必填 */
function sanitizeLinks(v: unknown): LinkItem[] {
  if (!Array.isArray(v)) return [];
  const out: LinkItem[] = [];
  for (const x of v) {
    if (!isRecord(x)) continue;
    const label = str(x.label, '').trim().slice(0, 80);
    const url = str(x.url, '').trim().slice(0, 500);
    if (label && isValidUrl(url)) out.push({ label, url });
    if (out.length >= 10) break;
  }
  return out;
}

/** 纯文本列表清洗（复用包交付清单） */
function sanitizeTextList(v: unknown, max = 30): string[] {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string' || !x.trim()) continue;
    const t = x.trim().slice(0, 200);
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out.slice(0, max);
}

function sanitizeReuse(raw: unknown): ReusePackage {
  if (!isRecord(raw)) return emptyReuse();
  return {
    links: sanitizeLinks(raw.links),
    usageGuide: str(raw.usageGuide, '').slice(0, 2000),
    checklist: sanitizeTextList(raw.checklist),
    retrospective: str(raw.retrospective, '').slice(0, 3000),
    templateSnippet: str(raw.templateSnippet, '').slice(0, 10000),
  };
}

function sanitizeMetrics(v: unknown): Achievement['metrics'] {
  if (!Array.isArray(v)) return [];
  const out: Achievement['metrics'] = [];
  for (const m of v) {
    if (!isRecord(m)) continue;
    const label = str(m.label, '').trim();
    const value = str(m.value, '').trim();
    if (label && value) out.push({ label: label.slice(0, 40), value: value.slice(0, 40) });
    if (out.length >= 6) break;
  }
  return out;
}

/** 清洗单条成果；结构不合法（类型未知/日期非法）返回 null 丢弃 */
export function sanitizeItem(raw: unknown, index: number): Achievement | null {
  if (!isRecord(raw)) return null;
  const type =
    typeof raw.type === 'string' && TYPE_SET.has(raw.type) ? (raw.type as AchievementType) : null;
  if (!type) return null;
  if (!isValidDateString(str(raw.completedAt, ''))) return null;

  const completedAt = raw.completedAt as string;
  const createdAt = isValidIso(raw.createdAt)
    ? raw.createdAt
    : new Date(`${completedAt}T09:00:00+08:00`).toISOString();
  const updatedAt = isValidIso(raw.updatedAt) ? raw.updatedAt : createdAt;
  const link = str(raw.link, '');
  const order = typeof raw.order === 'number' && Number.isFinite(raw.order) ? raw.order : index;

  return {
    id: str(raw.id, `imported-${index + 1}`) || `imported-${index + 1}`,
    type,
    title: str(raw.title, '未命名成果').slice(0, 120),
    summary: str(raw.summary, '').slice(0, 500),
    description: str(raw.description, '').slice(0, 5000),
    tags: uniqueStrings(raw.tags),
    relatedProject: str(raw.relatedProject, '').trim().slice(0, 80) || undefined,
    completedAt,
    link: isValidUrl(link) ? link : undefined,
    metrics: sanitizeMetrics(raw.metrics),
    relations: sanitizeRelations(raw.relations),
    reuse: sanitizeReuse(raw.reuse),
    pinned: raw.pinned === true,
    archived: raw.archived === true,
    order,
    createdAt,
    updatedAt,
  };
}

/** 清洗列表并去重（保留首个出现的 id） */
export function sanitizeItems(raw: unknown[]): Achievement[] {
  const seen = new Set<string>();
  const out: Achievement[] = [];
  raw.forEach((r, i) => {
    const item = sanitizeItem(r, i);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id);
    out.push(item);
  });
  return out;
}

/** 清洗单条集合；名称缺失返回 null 丢弃 */
export function sanitizeCollection(raw: unknown, index: number): AchievementCollection | null {
  if (!isRecord(raw)) return null;
  const name = str(raw.name, '').trim().slice(0, 60);
  if (!name) return null;
  const createdAt = isValidIso(raw.createdAt) ? raw.createdAt : new Date().toISOString();
  const updatedAt = isValidIso(raw.updatedAt) ? raw.updatedAt : createdAt;
  return {
    id: str(raw.id, `imported-col-${index + 1}`) || `imported-col-${index + 1}`,
    name,
    description: str(raw.description, '').trim().slice(0, 500),
    color: sanitizeCollectionColor(raw.color),
    achievementIds: sanitizeIdList(raw.achievementIds),
    createdAt,
    updatedAt,
  };
}

export function sanitizeCollections(raw: unknown[]): AchievementCollection[] {
  const seen = new Set<string>();
  const out: AchievementCollection[] = [];
  raw.forEach((r, i) => {
    const col = sanitizeCollection(r, i);
    if (!col || seen.has(col.id)) return;
    seen.add(col.id);
    out.push(col);
  });
  return out;
}

/** 清洗筛选条件（UI 状态与筛选方案共用；异常字段回退默认） */
export function sanitizeFilters(raw: unknown): AchievementFilters {
  const f = isRecord(raw) ? raw : {};
  return {
    keyword: typeof f.keyword === 'string' ? f.keyword.slice(0, 120) : '',
    types: Array.isArray(f.types)
      ? f.types
          .filter((t): t is AchievementType => typeof t === 'string' && TYPE_SET.has(t))
          .slice(0, 5)
      : [],
    year:
      typeof f.year === 'number' && Number.isInteger(f.year) && f.year >= 2000 && f.year <= 2100
        ? f.year
        : null,
    // month 依赖 year：year 为空时强制重置，避免「有月份无年份」的死状态
    month:
      typeof f.month === 'number' &&
      Number.isInteger(f.month) &&
      f.month >= 1 &&
      f.month <= 12 &&
      typeof f.year === 'number'
        ? f.month
        : null,
    tags: Array.isArray(f.tags)
      ? f.tags.filter((t): t is string => typeof t === 'string').slice(0, 20)
      : [],
    archived: f.archived === 'all' || f.archived === 'archived' ? f.archived : 'active',
    sort: isSort(f.sort) ? f.sort : 'date-desc',
    titleQuery: typeof f.titleQuery === 'string' ? f.titleQuery.slice(0, 120) : '',
    descQuery: typeof f.descQuery === 'string' ? f.descQuery.slice(0, 200) : '',
    projectQuery: typeof f.projectQuery === 'string' ? f.projectQuery.slice(0, 120) : '',
  };
}

/** 清洗保存的筛选方案；名称缺失返回 null 丢弃 */
export function sanitizeSavedFilter(raw: unknown, index: number): SavedFilter | null {
  if (!isRecord(raw)) return null;
  const name = str(raw.name, '').trim().slice(0, 40);
  if (!name) return null;
  return {
    id: str(raw.id, `saved-${index + 1}`) || `saved-${index + 1}`,
    name,
    filters: sanitizeFilters(raw.filters),
    createdAt: isValidIso(raw.createdAt) ? raw.createdAt : new Date().toISOString(),
  };
}

export function sanitizeSavedFilters(raw: unknown[]): SavedFilter[] {
  const seen = new Set<string>();
  const out: SavedFilter[] = [];
  raw.forEach((r, i) => {
    const s = sanitizeSavedFilter(r, i);
    if (!s || seen.has(s.id)) return;
    seen.add(s.id);
    out.push(s);
  });
  return out;
}

/** 把任意解析结果规范化为当前版本信封；无法处理返回 null */
export function normalizeStorage(parsed: unknown): AchievementStorageData | null {
  if (Array.isArray(parsed)) {
    // v0 旧格式：纯数组
    const items = sanitizeItems(parsed);
    return {
      version: STORAGE_VERSION,
      seq: items.length,
      collectionSeq: items.length,
      items,
      collections: [],
      savedFilters: [],
    };
  }
  if (!isRecord(parsed)) return null;
  const version = typeof parsed.version === 'number' ? parsed.version : undefined;
  if (version !== undefined && version > STORAGE_VERSION) return null; // 未来版本
  if (!Array.isArray(parsed.items)) return null;
  const items = sanitizeItems(parsed.items);
  if (version === STORAGE_VERSION) {
    const collections = Array.isArray(parsed.collections)
      ? sanitizeCollections(parsed.collections)
      : [];
    const savedFilters = Array.isArray(parsed.savedFilters)
      ? sanitizeSavedFilters(parsed.savedFilters)
      : [];
    const seq =
      typeof parsed.seq === 'number' && Number.isInteger(parsed.seq)
        ? Math.max(parsed.seq, items.length)
        : items.length;
    const collectionSeq =
      typeof parsed.collectionSeq === 'number' && Number.isInteger(parsed.collectionSeq)
        ? Math.max(parsed.collectionSeq, collections.length)
        : collections.length;
    return { version: STORAGE_VERSION, seq, collectionSeq, items, collections, savedFilters };
  }
  // v1 或更早（有 items 字段）：补齐 v2 新增字段
  return {
    version: STORAGE_VERSION,
    seq: items.length,
    collectionSeq: items.length,
    items,
    collections: [],
    savedFilters: [],
  };
}

/** 读取并规范化成果数据；无数据/损坏返回 null（调用方决定播种） */
export function loadAchievementStorage(): AchievementStorageData | null {
  try {
    const raw = localStorage.getItem(ACHIEVEMENT_STORAGE_KEY);
    if (!raw) return null;
    return normalizeStorage(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** 写入成果数据；返回是否成功（写入失败时内存状态保留） */
export function saveAchievementStorage(data: AchievementStorageData): boolean {
  try {
    localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/* ---------- UI 偏好（视图/筛选/排序） ---------- */

function isView(v: unknown): v is AchievementView {
  return typeof v === 'string' && VIEW_SET.has(v);
}

function isSort(v: unknown): v is AchievementFilters['sort'] {
  return typeof v === 'string' && SORT_SET.has(v);
}

/** 清洗 UI 状态；任何异常都回退到默认值 */
export function sanitizeUiState(raw: unknown): AchievementUiState {
  if (!isRecord(raw)) return { view: 'card', filters: emptyFilters() };
  return { view: isView(raw.view) ? raw.view : 'card', filters: sanitizeFilters(raw.filters) };
}

export function loadUiState(): AchievementUiState {
  try {
    const raw = localStorage.getItem(ACHIEVEMENT_UI_STORAGE_KEY);
    if (!raw) return { view: 'card', filters: emptyFilters() };
    return sanitizeUiState(JSON.parse(raw) as unknown);
  } catch {
    return { view: 'card', filters: emptyFilters() };
  }
}

export function saveUiState(ui: AchievementUiState): boolean {
  try {
    localStorage.setItem(
      ACHIEVEMENT_UI_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, ...ui }),
    );
    return true;
  } catch {
    return false;
  }
}

/* ---------- 导入 / 导出 / 合并 ---------- */

export type ImportParseResult =
  { ok: true; payload: ImportPayload; dropped: number } | { ok: false; error: string };

/**
 * 解析导入文件：支持纯数组或 { version, items, collections } 信封，逐条清洗。
 * 版本仅拒绝「过新」（v > STORAGE_VERSION）；旧版本自动按当前版本清洗导入。
 */
export function parseImport(raw: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: '文件不是有效的 JSON' };
  }
  if (!isRecord(parsed) && !Array.isArray(parsed)) {
    return { ok: false, error: '文件格式不支持（应为数组或 JSON 对象）' };
  }
  if (isRecord(parsed) && typeof parsed.version === 'number' && parsed.version > STORAGE_VERSION) {
    return {
      ok: false,
      error: `数据版本过新（文件 v${parsed.version}，当前支持 v${STORAGE_VERSION}）`,
    };
  }
  const source = Array.isArray(parsed) ? parsed : Array.isArray(parsed.items) ? parsed.items : null;
  if (!source) return { ok: false, error: '缺少成果数组（应为数组或 { items: [...] } 结构）' };
  const items = sanitizeItems(source);
  const collections =
    isRecord(parsed) && Array.isArray(parsed.collections)
      ? sanitizeCollections(parsed.collections)
      : [];
  const dropped = source.length - items.length;
  return { ok: true, payload: { items, collections }, dropped };
}

export interface MergeOutcome {
  items: Achievement[];
  collections: AchievementCollection[];
  /** 新增成果数 */
  added: number;
  /** 覆盖成果数（overwrite 冲突） */
  replaced: number;
  /** 跳过成果数（skip 冲突） */
  skipped: number;
  /** 复制为新条目的成果数（copy 冲突） */
  copied: number;
  /** 新增/复制集合数 */
  collectionAdded: number;
  /** 覆盖集合数 */
  collectionReplaced: number;
  /** 跳过集合数 */
  collectionSkipped: number;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 合并导入：按冲突策略处理同 id 条目。
 * - skip：保留现有条目，导入的同 id 条目丢弃；
 * - overwrite：以导入内容覆盖同 id 条目（保留现有 id 与创建时间，引用稳定）；
 * - copy：为冲突条目分配新 id 复制为新条目，集合引用随之重映射。
 * 纯函数（不修改入参）；idFactory 仅在 copy 模式使用，测试可注入计数器。
 */
export function mergeImport(
  currentItems: Achievement[],
  currentCollections: AchievementCollection[],
  incoming: ImportPayload,
  mode: ImportMode,
  idFactory: (prefix: string) => string = (prefix) => `${prefix}-${Date.now().toString(36)}`,
): MergeOutcome {
  const byId = new Map<string, Achievement>();
  for (const a of currentItems) byId.set(a.id, a);
  let added = 0;
  let replaced = 0;
  let skipped = 0;
  let copied = 0;
  /** copy 模式下旧 id → 新 id 映射（用于集合引用重映射） */
  const idMap = new Map<string, string>();

  for (const inc of incoming.items) {
    if (byId.has(inc.id)) {
      if (mode === 'skip') {
        skipped += 1;
        continue;
      }
      if (mode === 'copy') {
        const newId = idFactory('ac');
        idMap.set(inc.id, newId);
        byId.set(newId, { ...inc, id: newId, createdAt: nowIso(), updatedAt: nowIso() });
        copied += 1;
      } else {
        // overwrite：保留现有 id 与创建时间，内容以导入为准
        const existing = byId.get(inc.id)!;
        byId.set(inc.id, {
          ...existing,
          ...inc,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
        });
        replaced += 1;
      }
    } else {
      byId.set(inc.id, inc);
      added += 1;
    }
  }

  const colById = new Map<string, AchievementCollection>(
    currentCollections.map((c) => [c.id, { ...c, achievementIds: [...c.achievementIds] }]),
  );
  let collectionAdded = 0;
  let collectionReplaced = 0;
  let collectionSkipped = 0;

  for (const inc of incoming.collections) {
    const remapped: AchievementCollection = {
      ...inc,
      achievementIds: inc.achievementIds.map((id) => idMap.get(id) ?? id),
    };
    if (colById.has(inc.id)) {
      if (mode === 'skip') {
        collectionSkipped += 1;
        continue;
      }
      if (mode === 'copy') {
        const newId = idFactory('col');
        colById.set(newId, { ...remapped, id: newId, createdAt: nowIso(), updatedAt: nowIso() });
        collectionAdded += 1;
      } else {
        const existing = colById.get(inc.id)!;
        colById.set(inc.id, {
          ...existing,
          ...remapped,
          id: existing.id,
          createdAt: existing.createdAt,
          updatedAt: nowIso(),
        });
        collectionReplaced += 1;
      }
    } else {
      colById.set(inc.id, remapped);
      collectionAdded += 1;
    }
  }

  return {
    items: [...byId.values()],
    collections: [...colById.values()],
    added,
    replaced,
    skipped,
    copied,
    collectionAdded,
    collectionReplaced,
    collectionSkipped,
  };
}

/** 导出负载（含版本号与导出时间） */
export interface ExportPayload {
  version: number;
  exportedAt: string;
  app: string;
  items: Achievement[];
  collections: AchievementCollection[];
}

/** 导出 JSON 字符串（全库 / 单项 / 集合由调用方组装 payload） */
export function buildExport(payload: ExportPayload): string {
  return JSON.stringify(
    { ...payload, version: STORAGE_VERSION, app: 'personal-os-achievements' },
    null,
    2,
  );
}

/** 导出文件基础信息（标题 / 时间戳，供下载文件名使用） */
export function exportFilename(label: string, date = new Date()): string {
  const d = date.toISOString().slice(0, 10);
  return `achievements-${label}-${d}.json`;
}

/** 集合表单负载（供组件构造，纯数据） */
export function emptyCollectionDraft(): CollectionDraft {
  return { name: '', description: '', color: '#6366f1' };
}
