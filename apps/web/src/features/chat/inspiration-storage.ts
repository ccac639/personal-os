/**
 * Chat 功能域 —— 灵感广场持久化仓库
 *
 * - key：personal-os.chat.inspiration.v1（版本信封 { version, ui, items }）
 * - ui：卡片/列表视图、排序、快捷视图与筛选条件（本地持久化）
 * - zod 结构校验：损坏 / 版本不符安全回退为空库，并返回 recovered 标志
 * - 只存灵感文本与结构化元数据；附件二进制 / 会话记录绝不写入
 */
import { z } from 'zod';

import type { ChatInspiration } from './inspiration-types';

export const INSPIRATION_STORAGE_KEY = 'personal-os.chat.inspiration.v1';
const INSPIRATION_STORAGE_VERSION = 1;

const inspirationSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  category: z.enum(['writing', 'code', 'vision', 'research', 'efficiency', 'other']),
  tags: z.array(z.string()),
  prompt: z.string(),
  creativeGoal: z.string(),
  visualPreset: z.enum(['color', 'grid', 'paper', 'code', 'minimal', 'geometry']),
  favorite: z.boolean().optional(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  source: z.enum(['manual', 'chat', 'agent']),
  relatedAgentId: z.string().optional(),
  relatedModelId: z.string().optional(),
  relatedConversationId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const uiSchema = z.object({
  view: z.enum(['masonry', 'list']),
  sort: z.enum(['newest', 'oldest', 'updated']),
  quickView: z.enum(['all', 'recent', 'favorites', 'drafting', 'archived']),
  filters: z.object({
    keyword: z.string(),
    category: z.enum(['all', 'writing', 'code', 'vision', 'research', 'efficiency', 'other']),
    tag: z.string(),
    source: z.enum(['all', 'manual', 'chat', 'agent']),
    favoritesOnly: z.boolean(),
    pinnedOnly: z.boolean(),
    archived: z.boolean().optional(),
  }),
});

const inspirationEnvelopeSchema = z.object({
  version: z.literal(INSPIRATION_STORAGE_VERSION),
  ui: uiSchema.optional(),
  items: z.array(inspirationSchema),
});

export interface InspirationUiData {
  view: 'masonry' | 'list';
  sort: 'newest' | 'oldest' | 'updated';
  quickView: 'all' | 'recent' | 'favorites' | 'drafting' | 'archived';
  filters: {
    keyword: string;
    category: 'all' | 'writing' | 'code' | 'vision' | 'research' | 'efficiency' | 'other';
    tag: string;
    source: 'all' | 'manual' | 'chat' | 'agent';
    favoritesOnly: boolean;
    pinnedOnly: boolean;
    archived: boolean;
  };
}

export interface InspirationLibraryLoadResult {
  items: ChatInspiration[];
  ui: InspirationUiData;
  recovered: boolean;
}

export function defaultInspirationUi(): InspirationUiData {
  return {
    view: 'masonry',
    sort: 'newest',
    quickView: 'all',
    filters: {
      keyword: '',
      category: 'all',
      tag: '',
      source: 'all',
      favoritesOnly: false,
      pinnedOnly: false,
      archived: false,
    },
  };
}

export function loadInspirationLibrary(): InspirationLibraryLoadResult {
  try {
    const raw = localStorage.getItem(INSPIRATION_STORAGE_KEY);
    if (!raw) return { items: [], ui: defaultInspirationUi(), recovered: false };
    const parsed: unknown = JSON.parse(raw);
    const result = inspirationEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      clearInspirationLibrary();
      return { items: [], ui: defaultInspirationUi(), recovered: true };
    }
    return {
      items: result.data.items.map(normalizeInspiration),
      ui: result.data.ui
        ? {
            ...result.data.ui,
            filters: {
              ...result.data.ui.filters,
              archived: result.data.ui.filters.archived ?? false,
            },
          }
        : defaultInspirationUi(),
      recovered: false,
    };
  } catch {
    clearInspirationLibrary();
    return { items: [], ui: defaultInspirationUi(), recovered: true };
  }
}

function normalizeInspiration(it: {
  id: string;
  title: string;
  summary: string;
  category: ChatInspiration['category'];
  tags: string[];
  prompt: string;
  creativeGoal: string;
  visualPreset: ChatInspiration['visualPreset'];
  favorite?: boolean;
  pinned?: boolean;
  archived?: boolean;
  source: ChatInspiration['source'];
  relatedAgentId?: string;
  relatedModelId?: string;
  relatedConversationId?: string;
  createdAt: number;
  updatedAt: number;
}): ChatInspiration {
  return {
    ...it,
    favorite: it.favorite ?? false,
    pinned: it.pinned ?? false,
    archived: it.archived ?? false,
  };
}

export function saveInspirationLibrary(
  items: ChatInspiration[],
  ui: InspirationUiData,
): void {
  try {
    const payload = {
      version: INSPIRATION_STORAGE_VERSION,
      ui,
      items: items.map((it) => ({
        ...it,
        favorite: it.favorite ?? false,
        pinned: it.pinned ?? false,
        archived: it.archived ?? false,
      })),
    };
    localStorage.setItem(INSPIRATION_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 写入失败（隐私模式 / 配额满）不阻塞 UI
  }
}

export function clearInspirationLibrary(): void {
  try {
    localStorage.removeItem(INSPIRATION_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/** 旧版（v0：裸数组）迁移；无法识别返回 null */
export function migrateInspirationV0(input: unknown): ChatInspiration[] | null {
  if (!Array.isArray(input)) return null;
  const valid: ChatInspiration[] = [];
  for (const x of input) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.title === 'string' && typeof o.prompt === 'string') {
      valid.push(normalizeInspiration(o as unknown as ChatInspiration));
    }
  }
  return valid;
}
