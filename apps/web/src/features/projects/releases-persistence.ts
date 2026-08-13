/**
 * 发布管理 —— 独立持久化 repository
 *
 * 独立 key + 信封（v1）：检查单草稿、发布记录、个人检查单模板。
 * 复用通用信封读写（readEnvelope / writeEnvelope / SaveResult），
 * 损坏 / 版本过新时降级为空列表并给出非阻塞提示。
 */
import { readEnvelope, writeEnvelope, isPlainObject, type SaveResult } from './persistence';
import {
  normalizeChecklist,
  normalizeRecord,
  type ReleaseChecklist,
  type ReleaseRecord,
  type ReleaseTemplate,
} from './releases';

export const RELEASES_VERSION = 1;
export const RELEASES_KEY = 'personal-os.releases.v1';
export const RELEASE_TEMPLATES_KEY = 'personal-os.releases.templates.v1';

export interface PersistedReleases {
  checklists: ReleaseChecklist[];
  records: ReleaseRecord[];
}

export interface LoadReleasesResult {
  data: PersistedReleases;
  notice: string | null;
}

function normalizeList<T>(raw: unknown, norm: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const item of raw) {
    const n = norm(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

function normalizePersisted(raw: unknown): PersistedReleases | null {
  if (!isPlainObject(raw)) return null;
  const checklists = normalizeList(raw.checklists, normalizeChecklist);
  const records = normalizeList(raw.records, normalizeRecord);
  if (checklists === null || records === null) return null;
  return { checklists, records };
}

function empty(): PersistedReleases {
  return { checklists: [], records: [] };
}

export function loadReleasesData(): LoadReleasesResult {
  const outcome = readEnvelope(RELEASES_KEY, RELEASES_VERSION, normalizePersisted);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'newer') {
    return { data: empty(), notice: '本地发布数据版本过新，已使用空数据，请升级应用' };
  }
  if (outcome.status === 'corrupt') {
    return { data: empty(), notice: '本地发布数据损坏，已重置为空数据' };
  }
  return { data: empty(), notice: null };
}

export function saveReleasesData(data: PersistedReleases): SaveResult {
  return writeEnvelope(RELEASES_KEY, RELEASES_VERSION, data);
}

export function loadReleaseTemplates(): ReleaseTemplate[] {
  const outcome = readEnvelope(RELEASE_TEMPLATES_KEY, RELEASES_VERSION, (raw) => {
    if (!Array.isArray(raw)) return null;
    const out: ReleaseTemplate[] = [];
    for (const item of raw) {
      if (!isPlainObject(item)) return null;
      const t = item;
      if (
        typeof t.id !== 'string' ||
        typeof t.name !== 'string' ||
        !Array.isArray(t.items) ||
        !t.items.every((x) => typeof x === 'string') ||
        typeof t.builtin !== 'boolean'
      ) {
        return null;
      }
      out.push({ id: t.id, name: t.name, items: [...t.items], builtin: t.builtin });
    }
    return out;
  });
  if (outcome.status === 'ok') return outcome.data;
  return [];
}

export function saveReleaseTemplates(templates: ReleaseTemplate[]): SaveResult {
  return writeEnvelope(RELEASE_TEMPLATES_KEY, RELEASES_VERSION, templates);
}
