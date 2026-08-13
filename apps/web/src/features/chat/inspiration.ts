/**
 * Chat 功能域 —— 灵感广场纯逻辑
 *
 * - 纯函数：筛选 / 排序 / 快捷视图 / 导入校验与冲突解决 / 导出结构
 * - 视觉预设为本地 CSS 配置（无外部图片、无版权素材）
 * - 导出的 JSON 仅含灵感字段，不含会话记录 / 附件 / 敏感信息
 */
import type {
  ChatInspiration,
  InspirationCategory,
  InspirationDraftInput,
  InspirationFilters,
  InspirationImportPreview,
  InspirationImportResult,
  InspirationImportStrategy,
  InspirationQuickView,
  InspirationSortKey,
  InspirationSource,
  InspirationVisualPreset,
} from './inspiration-types';
import { uid } from './utils';

export const INSPIRATION_CATEGORIES: {
  key: InspirationCategory | 'all';
  label: string;
  color: string;
}[] = [
  { key: 'all', label: '全部', color: 'var(--chat-mono)' },
  { key: 'writing', label: '写作', color: 'var(--chat-rose)' },
  { key: 'code', label: '代码', color: 'var(--chat-teal)' },
  { key: 'vision', label: '视觉', color: 'var(--chat-orange)' },
  { key: 'research', label: '研究', color: 'var(--chat-cyan)' },
  { key: 'efficiency', label: '效率', color: 'var(--chat-cyan)' },
  { key: 'other', label: '其他', color: 'var(--chat-mono)' },
];

export function inspirationCategoryLabel(key: InspirationCategory): string {
  return INSPIRATION_CATEGORIES.find((c) => c.key === key)?.label ?? '其他';
}

export const INSPIRATION_SOURCES: { key: InspirationSource | 'all'; label: string }[] = [
  { key: 'all', label: '全部来源' },
  { key: 'manual', label: '手动创建' },
  { key: 'chat', label: '从对话保存' },
  { key: 'agent', label: '从智能体创建' },
];

export function inspirationSourceLabel(key: InspirationSource): string {
  return INSPIRATION_SOURCES.find((s) => s.key === key)?.label ?? '手动创建';
}

/* ---------- 视觉预设（本地 CSS） ---------- */

export const VISUAL_PRESETS: {
  key: InspirationVisualPreset;
  label: string;
  className: string;
}[] = [
  { key: 'color', label: '配色块', className: 'insp-cover-color' },
  { key: 'grid', label: '网格', className: 'insp-cover-grid' },
  { key: 'paper', label: '纸张', className: 'insp-cover-paper' },
  { key: 'code', label: '代码行', className: 'insp-cover-code' },
  { key: 'minimal', label: '极简排版', className: 'insp-cover-minimal' },
  { key: 'geometry', label: '抽象几何', className: 'insp-cover-geometry' },
];

export function visualPresetClass(key: InspirationVisualPreset): string {
  return VISUAL_PRESETS.find((p) => p.key === key)?.className ?? 'insp-cover-minimal';
}

export function visualPresetLabel(key: InspirationVisualPreset): string {
  return VISUAL_PRESETS.find((p) => p.key === key)?.label ?? '极简排版';
}

/* ---------- 筛选 / 排序 / 快捷视图 ---------- */

export function emptyInspirationFilters(): InspirationFilters {
  return {
    keyword: '',
    category: 'all',
    tag: '',
    source: 'all',
    favoritesOnly: false,
    pinnedOnly: false,
    // undefined=显示全部（含归档）；快捷视图显式设 false/true
    archived: undefined,
  };
}

export function filterInspirations(
  items: ChatInspiration[],
  filters: InspirationFilters,
): ChatInspiration[] {
  const kw = filters.keyword.trim().toLowerCase();
  return items.filter((it) => {
    // archived 三态：true=只看归档；false=排除归档；undefined=显示全部
    if (filters.archived === true && !it.archived) return false;
    if (filters.archived === false && it.archived) return false;
    if (filters.category !== 'all' && it.category !== filters.category) return false;
    if (filters.source !== 'all' && it.source !== filters.source) return false;
    if (filters.favoritesOnly && !it.favorite) return false;
    if (filters.pinnedOnly && !it.pinned) return false;
    if (filters.tag && !it.tags.includes(filters.tag)) return false;
    if (!kw) return true;
    return (
      it.title.toLowerCase().includes(kw) ||
      it.summary.toLowerCase().includes(kw) ||
      it.prompt.toLowerCase().includes(kw) ||
      it.tags.some((t) => t.toLowerCase().includes(kw))
    );
  });
}

export function sortInspirations(
  items: ChatInspiration[],
  by: InspirationSortKey,
): ChatInspiration[] {
  const list = [...items];
  switch (by) {
    case 'oldest':
      return list.sort((a, b) => a.createdAt - b.createdAt);
    case 'updated':
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    case 'newest':
    default:
      return list.sort(
        (a, b) =>
          Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
          b.createdAt - a.createdAt,
      );
  }
}

/** 快捷视图 → 过滤器覆盖（组合条件，可再叠加关键词） */
export function applyQuickView(
  base: InspirationFilters,
  view: InspirationQuickView,
): InspirationFilters {
  switch (view) {
    case 'recent':
      return { ...base, archived: false };
    case 'favorites':
      return { ...base, favoritesOnly: true, archived: false };
    case 'drafting':
      return { ...base, archived: false };
    case 'archived':
      return { ...base, archived: true };
    case 'all':
    default:
      return { ...base, archived: false };
  }
}

/** 生效筛选数量（含快捷视图基数） */
export function activeFilterCount(filters: InspirationFilters, quickView: InspirationQuickView): number {
  let n = 0;
  if (filters.keyword.trim()) n += 1;
  if (filters.category !== 'all') n += 1;
  if (filters.tag) n += 1;
  if (filters.source !== 'all') n += 1;
  if (filters.favoritesOnly) n += 1;
  if (filters.pinnedOnly) n += 1;
  if (filters.archived) n += 1;
  if (quickView !== 'all') n += 1;
  return n;
}

/** 聚合全部标签（按出现次数降序） */
export function collectTags(items: ChatInspiration[]): string[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    for (const t of it.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([t]) => t)
    .slice(0, 12);
}

/* ---------- 新建 / 复制 ---------- */

export function createInspirationDraft(
  input: InspirationDraftInput,
  now = Date.now(),
): ChatInspiration {
  return {
    id: uid(),
    title: input.title.trim() || '未命名灵感',
    summary: input.summary.trim(),
    category: input.category,
    tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
    prompt: input.prompt.trim(),
    creativeGoal: input.creativeGoal?.trim() ?? '',
    visualPreset: pickVisualPreset(input.category),
    favorite: false,
    pinned: false,
    archived: false,
    source: input.source,
    relatedAgentId: input.relatedAgentId,
    relatedModelId: input.relatedModelId,
    relatedConversationId: input.relatedConversationId,
    createdAt: now,
    updatedAt: now,
  };
}

/** 从助手消息保存灵感的预填草稿（纯文本，不携带附件 / 会话完整内容） */
export function draftFromMessage(input: {
  content: string;
  modelId?: string;
  sessionId?: string;
}): InspirationDraftInput {
  const firstLine = (input.content.split('\n')[0] ?? '').trim();
  return {
    title: firstLine.slice(0, 24) || '来自对话的灵感',
    summary: input.content.replace(/\s+/g, ' ').trim().slice(0, 80),
    prompt: input.content,
    category: 'other',
    tags: [],
    source: 'chat',
    relatedModelId: input.modelId,
    relatedConversationId: input.sessionId,
  };
}

/** 从智能体创建灵感的预填草稿 */
export function draftFromAgent(input: {
  agentName: string;
  agentId: string;
  prompt: string;
  modelId?: string;
}): InspirationDraftInput {
  return {
    title: `来自「${input.agentName}」`,
    summary: '由智能体启动生成的灵感',
    prompt: input.prompt,
    category: 'other',
    tags: [input.agentName],
    source: 'agent',
    relatedAgentId: input.agentId,
    relatedModelId: input.modelId,
  };
}

function pickVisualPreset(category: InspirationCategory): InspirationVisualPreset {
  switch (category) {
    case 'writing':
      return 'paper';
    case 'code':
      return 'code';
    case 'vision':
      return 'color';
    case 'research':
      return 'grid';
    case 'efficiency':
      return 'minimal';
    default:
      return 'geometry';
  }
}

export function duplicateInspiration(source: ChatInspiration, now = Date.now()): ChatInspiration {
  return {
    ...source,
    id: uid(),
    title: `${source.title}（副本）`,
    favorite: false,
    pinned: false,
    archived: false,
    createdAt: now,
    updatedAt: now,
  };
}

/* ---------- 导入 / 导出 ---------- */

const INSPIRATION_EXPORT_VERSION = 1;

/** 导出 JSON：仅灵感字段（不含会话 / 附件 / 敏感信息） */
export function inspirationLibraryJson(items: ChatInspiration[]): string {
  return JSON.stringify(
    {
      app: 'personal-os-inspiration',
      version: INSPIRATION_EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      count: items.length,
      items: items.map((it) => ({
        id: it.id,
        title: it.title,
        summary: it.summary,
        category: it.category,
        tags: it.tags,
        prompt: it.prompt,
        creativeGoal: it.creativeGoal,
        visualPreset: it.visualPreset,
        favorite: it.favorite,
        pinned: it.pinned,
        archived: it.archived,
        source: it.source,
        relatedAgentId: it.relatedAgentId,
        relatedModelId: it.relatedModelId,
        relatedConversationId: it.relatedConversationId,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
      })),
    },
    null,
    2,
  );
}

/** 严格校验单个导入条目；返回规范化条目或错误原因 */
export function validateInspirationItem(
  raw: unknown,
): { item: ChatInspiration } | { error: string } {
  if (typeof raw !== 'object' || raw === null) return { error: '条目不是对象' };
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) return { error: '缺少 id' };
  if (typeof o.title !== 'string' || !o.title.trim()) return { error: '缺少标题' };
  if (typeof o.prompt !== 'string' || !o.prompt.trim()) return { error: '缺少提示词' };
  if (typeof o.createdAt !== 'number' || !Number.isFinite(o.createdAt)) {
    return { error: '创建时间非法' };
  }
  const category: InspirationCategory = CATEGORY_SET.has(o.category as InspirationCategory)
    ? (o.category as InspirationCategory)
    : 'other';
  const source: InspirationSource = SOURCE_SET.has(o.source as InspirationSource)
    ? (o.source as InspirationSource)
    : 'manual';
  const visualPreset: InspirationVisualPreset = PRESET_SET.has(o.visualPreset as InspirationVisualPreset)
    ? (o.visualPreset as InspirationVisualPreset)
    : 'minimal';
  const tags = Array.isArray(o.tags)
    ? o.tags.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).slice(0, 12)
    : [];
  return {
    item: {
      id: o.id,
      title: String(o.title).trim().slice(0, 80),
      summary: typeof o.summary === 'string' ? o.summary.trim().slice(0, 160) : '',
      category,
      tags,
      prompt: String(o.prompt).trim(),
      creativeGoal: typeof o.creativeGoal === 'string' ? o.creativeGoal.trim() : '',
      visualPreset,
      favorite: o.favorite === true,
      pinned: o.pinned === true,
      archived: o.archived === true,
      source,
      relatedAgentId: typeof o.relatedAgentId === 'string' ? o.relatedAgentId : undefined,
      relatedModelId: typeof o.relatedModelId === 'string' ? o.relatedModelId : undefined,
      relatedConversationId: typeof o.relatedConversationId === 'string' ? o.relatedConversationId : undefined,
      createdAt: o.createdAt,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : o.createdAt,
    },
  };
}

const CATEGORY_SET = new Set<InspirationCategory>(['writing', 'code', 'vision', 'research', 'efficiency', 'other']);
const SOURCE_SET = new Set<InspirationSource>(['manual', 'chat', 'agent']);
const PRESET_SET = new Set<InspirationVisualPreset>(['color', 'grid', 'paper', 'code', 'minimal', 'geometry']);

/** 解析导入 JSON → 预览（数量 / 版本 / 非法数） */
export function parseInspirationImport(
  text: string,
): { preview: InspirationImportPreview; items: ChatInspiration[] } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: '不是有效的 JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null) return { error: '导入结构无效' };
  const o = parsed as Record<string, unknown>;
  if (o.app !== 'personal-os-inspiration') return { error: '不是灵感库导出文件' };
  const version = typeof o.version === 'number' ? o.version : 1;
  if (version > INSPIRATION_EXPORT_VERSION) {
    return { error: `版本过新（${version}），请升级应用后导入` };
  }
  const rawItems = Array.isArray(o.items) ? o.items : [];
  const items: ChatInspiration[] = [];
  let invalidCount = 0;
  let firstInvalidReason: string | undefined;
  for (const raw of rawItems) {
    const result = validateInspirationItem(raw);
    if ('error' in result) {
      invalidCount += 1;
      firstInvalidReason ??= result.error;
    } else {
      items.push(result.item);
    }
  }
  return { preview: { total: rawItems.length, version, invalidCount, firstInvalidReason }, items };
}

/** 按策略合并导入：skip 跳过重 id；overwrite 覆盖；copy 复制为新 id */
export function resolveInspirationImport(
  existing: ChatInspiration[],
  incoming: ChatInspiration[],
  strategy: InspirationImportStrategy,
): { items: ChatInspiration[]; result: InspirationImportResult } {
  const result: InspirationImportResult = {
    added: 0,
    skipped: 0,
    overwritten: 0,
    copied: 0,
    invalid: 0,
  };
  const byId = new Map(existing.map((it) => [it.id, it]));
  const added: ChatInspiration[] = [];
  for (const inc of incoming) {
    const existingItem = byId.get(inc.id);
    if (!existingItem) {
      byId.set(inc.id, inc);
      added.push(inc);
      result.added += 1;
      continue;
    }
    if (strategy === 'skip') {
      result.skipped += 1;
      continue;
    }
    if (strategy === 'overwrite') {
      byId.set(inc.id, inc);
      added.push(inc);
      result.added += 1;
      result.overwritten += 1;
      continue;
    }
    // copy：复制为新 id（保留标题；副本也计入 added）
    const copy: ChatInspiration = {
      ...inc,
      id: uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      favorite: false,
      pinned: false,
      archived: false,
    };
    byId.set(copy.id, copy);
    added.push(copy);
    result.added += 1;
    result.copied += 1;
  }
  return { items: [...byId.values()], result };
}
