/**
 * 项目知识 —— 独立持久化 repository
 *
 * 独立 key + 信封（v1）：知识条目列表。
 * 损坏 / 版本过新时降级为空列表并给出非阻塞提示。
 */
import { readEnvelope, writeEnvelope, isPlainObject, type SaveResult } from './persistence';
import { normalizeKnowledgeEntry, type KnowledgeEntry } from './knowledge';

export const KNOWLEDGE_VERSION = 1;
export const KNOWLEDGE_KEY = 'personal-os.knowledge.v1';

export interface LoadKnowledgeResult {
  data: KnowledgeEntry[];
  notice: string | null;
}

function normalizeList(raw: unknown): KnowledgeEntry[] | null {
  if (!Array.isArray(raw)) return null;
  const out: KnowledgeEntry[] = [];
  for (const item of raw) {
    const n = normalizeKnowledgeEntry(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

export function loadKnowledgeData(): LoadKnowledgeResult {
  const outcome = readEnvelope(KNOWLEDGE_KEY, KNOWLEDGE_VERSION, normalizeList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'newer') {
    return { data: [], notice: '本地知识数据版本过新，已使用空数据，请升级应用' };
  }
  if (outcome.status === 'corrupt') {
    return { data: [], notice: '本地知识数据损坏，已重置为空数据' };
  }
  return { data: [], notice: null };
}

export function saveKnowledgeData(entries: KnowledgeEntry[]): SaveResult {
  return writeEnvelope(KNOWLEDGE_KEY, KNOWLEDGE_VERSION, entries);
}

export { isPlainObject };
