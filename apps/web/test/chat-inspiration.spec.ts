import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useInspirationStore } from '@/features/chat/inspiration-store';
import {
  INSPIRATION_STORAGE_KEY,
  migrateInspirationV0,
} from '@/features/chat/inspiration-storage';
import { BUILTIN_AGENTS } from '@/features/chat/agents';
import {
  INSPIRATION_CATEGORIES,
  activeFilterCount,
  applyQuickView,
  collectTags,
  createInspirationDraft,
  draftFromAgent,
  draftFromMessage,
  duplicateInspiration,
  emptyInspirationFilters,
  filterInspirations,
  inspirationLibraryJson,
  parseInspirationImport,
  resolveInspirationImport,
  sortInspirations,
  visualPresetClass,
} from '@/features/chat/inspiration';
import type {
  ChatInspiration,
  InspirationDraftInput,
  InspirationImportStrategy,
} from '@/features/chat/inspiration-types';
import { useChatStore } from '@/features/chat/store';
import { CHAT_MODELS } from '@/features/chat/models';

function makeItem(over: Partial<ChatInspiration> = {}): ChatInspiration {
  return {
    id: `insp-${Math.random().toString(36).slice(2, 8)}`,
    title: '灵感标题',
    summary: '摘要',
    category: 'writing',
    tags: ['写作'],
    prompt: '完整提示词内容',
    creativeGoal: '',
    visualPreset: 'paper',
    favorite: false,
    pinned: false,
    archived: false,
    source: 'manual',
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    ...over,
  };
}

function draftInput(over: Partial<InspirationDraftInput> = {}): InspirationDraftInput {
  return {
    title: '新灵感',
    summary: '摘要',
    prompt: '提示词',
    category: 'writing',
    tags: ['写作'],
    source: 'manual',
    ...over,
  };
}

describe('灵感：纯函数筛选 / 排序 / 快捷视图', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('类别 / 来源 / 标签 / 收藏 / 置顶 / 归档组合筛选', () => {
    const items = [
      makeItem({ id: 'a', category: 'writing', source: 'chat', tags: ['润色'], favorite: true, pinned: true }),
      makeItem({ id: 'b', category: 'code', source: 'manual', tags: ['vue'], favorite: false }),
      makeItem({ id: 'c', category: 'writing', source: 'chat', tags: ['润色'], archived: true }),
    ];
    const base = emptyInspirationFilters();
    expect(filterInspirations(items, { ...base, category: 'writing' }).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterInspirations(items, { ...base, source: 'chat' }).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterInspirations(items, { ...base, tag: '润色' }).map((i) => i.id)).toEqual(['a', 'c']);
    expect(filterInspirations(items, { ...base, favoritesOnly: true }).map((i) => i.id)).toEqual(['a']);
    expect(filterInspirations(items, { ...base, pinnedOnly: true }).map((i) => i.id)).toEqual(['a']);
    expect(filterInspirations(items, { ...base, archived: true }).map((i) => i.id)).toEqual(['c']);
    expect(
      filterInspirations(items, { ...base, category: 'writing', source: 'chat', tag: '润色', favoritesOnly: true, pinnedOnly: true })
        .map((i) => i.id),
    ).toEqual(['a']);
  });

  it('关键词搜索：标题 / 摘要 / 提示词 / 标签', () => {
    const items = [
      makeItem({ id: 'a', title: '深夜书房', tags: [] }),
      makeItem({ id: 'b', summary: '包含特殊关键词的摘要' }),
      makeItem({ id: 'c', prompt: 'prompt 里提到 霓虹灯' }),
    ];
    const kw = (k: string) => filterInspirations(items, { ...emptyInspirationFilters(), keyword: k }).map((i) => i.id);
    expect(kw('深夜')).toEqual(['a']);
    expect(kw('特殊关键词')).toEqual(['b']);
    expect(kw('霓虹灯')).toEqual(['c']);
    expect(kw('书房')).toEqual(['a']);
  });

  it('排序：newest 置顶优先；oldest / updated', () => {
    const items = [
      makeItem({ id: 'old', createdAt: 1000, updatedAt: 3000 }),
      makeItem({ id: 'mid', createdAt: 2000, updatedAt: 1000 }),
      makeItem({ id: 'pin', createdAt: 1500, updatedAt: 500, pinned: true }),
    ];
    expect(sortInspirations(items, 'newest').map((i) => i.id)).toEqual(['pin', 'mid', 'old']);
    expect(sortInspirations(items, 'oldest').map((i) => i.id)).toEqual(['old', 'pin', 'mid']);
    expect(sortInspirations(items, 'updated').map((i) => i.id)).toEqual(['old', 'mid', 'pin']);
  });

  it('快捷视图：全部 / 最近 / 收藏 / 创作中 / 已归档', () => {
    const items = [
      makeItem({ id: 'a', archived: false }),
      makeItem({ id: 'b', archived: false, favorite: true }),
      makeItem({ id: 'c', archived: true }),
    ];
    const base = emptyInspirationFilters();
    expect(applyQuickView(base, 'all').archived).toBe(false);
    expect(applyQuickView(base, 'favorites')).toMatchObject({ favoritesOnly: true, archived: false });
    expect(applyQuickView(base, 'archived').archived).toBe(true);
    // 组合后过滤
    const ids = (v: ReturnType<typeof applyQuickView>) =>
      filterInspirations(items, v).map((i) => i.id);
    expect(ids(applyQuickView(base, 'all'))).toEqual(['a', 'b']);
    expect(ids(applyQuickView(base, 'favorites'))).toEqual(['b']);
    expect(ids(applyQuickView(base, 'archived'))).toEqual(['c']);
    expect(ids(applyQuickView(base, 'drafting'))).toEqual(['a', 'b']);
  });

  it('生效筛选计数与标签聚合', () => {
    const f = { ...emptyInspirationFilters(), category: 'code' as const, keyword: 'x' };
    expect(activeFilterCount(f, 'all')).toBe(2);
    const items = [
      makeItem({ tags: ['a', 'b'] }),
      makeItem({ tags: ['a', 'a', 'c'] }),
    ];
    expect(collectTags(items)).toEqual(['a', 'b', 'c']);
  });

  it('视觉预设：合法 key 返回对应 class', () => {
    expect(visualPresetClass('geometry')).toBe('insp-cover-geometry');
    expect(visualPresetClass('paper')).toBe('insp-cover-paper');
  });

  it('类别清单包含六个类别', () => {
    const keys = INSPIRATION_CATEGORIES.map((c) => c.key);
    expect(keys).toContain('writing');
    expect(keys).toContain('code');
    expect(keys).toContain('vision');
    expect(keys).toContain('research');
    expect(keys).toContain('efficiency');
    expect(keys).toContain('other');
  });
});

describe('灵感：CRUD 与复制', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('创建 / 更新 / 删除', () => {
    const store = useInspirationStore();
    const created = store.createInspiration(draftInput());
    expect(store.itemCount).toBe(1);
    expect(store.updateInspiration(created.id, { title: '改名' })).toBe(true);
    expect(store.itemById(created.id)?.title).toBe('改名');
    expect(store.deleteInspiration(created.id)).toBe(true);
    expect(store.itemCount).toBe(0);
  });

  it('收藏 / 置顶 / 归档切换', () => {
    const store = useInspirationStore();
    const item = store.createInspiration(draftInput());
    store.toggleFavorite(item.id);
    store.togglePinned(item.id);
    store.toggleArchived(item.id);
    const after = store.itemById(item.id)!;
    expect(after.favorite).toBe(true);
    expect(after.pinned).toBe(true);
    expect(after.archived).toBe(true);
  });

  it('复制为新条目：新 id、副本后缀、状态清零', () => {
    const store = useInspirationStore();
    const item = store.createInspiration(draftInput({ title: '原标题' }));
    store.toggleFavorite(item.id);
    const copy = store.duplicateItem(item.id)!;
    expect(copy.id).not.toBe(item.id);
    expect(copy.title).toBe('原标题（副本）');
    expect(copy.favorite).toBe(false);
    expect(store.itemCount).toBe(2);
  });

  it('纯函数：从消息构建保存草稿（不含附件 / 会话完整内容）', () => {
    const d = draftFromMessage({ content: '第一行标题\n\n后续内容', modelId: 'code-collab', sessionId: 's1' });
    expect(d.title).toContain('第一行标题');
    expect(d.source).toBe('chat');
    expect(d.relatedModelId).toBe('code-collab');
    expect(d.relatedConversationId).toBe('s1');
    expect(JSON.stringify(d)).not.toMatch(/data:image|base64|attachment/i);
  });

  it('纯函数：从智能体构建保存草稿', () => {
    const d = draftFromAgent({ agentName: '文章润色', agentId: 'builtin-polish', prompt: 'p', modelId: 'm1' });
    expect(d.source).toBe('agent');
    expect(d.relatedAgentId).toBe('builtin-polish');
    expect(d.tags).toContain('文章润色');
  });
});

describe('灵感：导入导出', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('导入预览：数量 / 版本 / 无效条目', () => {
    const json = JSON.stringify({
      app: 'personal-os-inspiration',
      version: 1,
      items: [
        makeItem(),
        { id: 'bad', title: '', prompt: 'x' }, // 缺标题
        { id: 5, title: 't', prompt: 'p' }, // id 非法
      ],
    });
    const parsed = parseInspirationImport(json);
    expect('preview' in parsed).toBe(true);
    const { preview, items } = parsed as { preview: { total: number; version: number; invalidCount: number }; items: ChatInspiration[] };
    expect(preview.total).toBe(3);
    expect(preview.version).toBe(1);
    expect(preview.invalidCount).toBe(2);
    expect(items).toHaveLength(1);
  });

  it('版本过新拒绝导入', () => {
    const parsed = parseInspirationImport(
      JSON.stringify({ app: 'personal-os-inspiration', version: 9, items: [] }),
    );
    expect('error' in parsed).toBe(true);
  });

  it('非灵感库文件拒绝导入', () => {
    expect('error' in parseInspirationImport(JSON.stringify({ app: 'other', items: [] }))).toBe(true);
    expect('error' in parseInspirationImport('not json')).toBe(true);
  });

  it('冲突策略：skip / overwrite / copy', () => {
    const existing = [makeItem({ id: 'dup', title: '原版' })];
    const incoming = [
      makeItem({ id: 'new', title: '新增' }),
      makeItem({ id: 'dup', title: '重复' }),
    ];
    const run = (strategy: InspirationImportStrategy) =>
      resolveInspirationImport(existing, incoming, strategy);
    const skip = run('skip');
    expect(skip.result).toMatchObject({ added: 1, skipped: 1 });
    expect(skip.items.find((i) => i.id === 'dup')?.title).toBe('原版');
    const overwrite = run('overwrite');
    expect(overwrite.result).toMatchObject({ added: 2, overwritten: 1 });
    expect(overwrite.items.find((i) => i.id === 'dup')?.title).toBe('重复');
    const copy = run('copy');
    expect(copy.result).toMatchObject({ added: 2, copied: 1 });
    expect(copy.items.filter((i) => i.title === '重复')).toHaveLength(1);
  });

  it('导出结构：仅灵感字段，不含会话 / 附件 / 敏感字段', () => {
    const store = useInspirationStore();
    store.createInspiration(draftInput({ prompt: '提示词内容' }));
    const json = inspirationLibraryJson(store.items);
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe('personal-os-inspiration');
    expect(parsed.version).toBe(1);
    expect(parsed.items).toHaveLength(1);
    const keys = Object.keys(parsed.items[0]!);
    expect(keys).toContain('prompt');
    expect(keys).not.toContain('messages');
    expect(keys).not.toContain('attachments');
    expect(json).not.toMatch(/data:image|base64|apiKey|token/i);
  });

  it('store.importFromJson：合并入库并统计', () => {
    const store = useInspirationStore();
    const json = JSON.stringify({
      app: 'personal-os-inspiration',
      version: 1,
      items: [makeItem({ id: 'x1', title: '导入一' }), makeItem({ id: 'x2', title: '导入二' })],
    });
    const result = store.importFromJson(json, 'skip');
    expect(result.ok).toBe(true);
    expect(result.result?.added).toBe(2);
    expect(store.itemCount).toBe(2);
  });
});

describe('灵感：对话联动与持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('从助手消息保存：预填草稿 + 确认入库 + 关联会话', () => {
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    chat.sendMessage('帮我写周报');
    const msg = chat.activeSession!.messages[1]!;
    const insp = useInspirationStore();
    insp.saveFromMessage(msg.id);
    expect(insp.pendingSave).not.toBeNull();
    expect(insp.pendingSave!.draft.source).toBe('chat');
    expect(insp.pendingSave!.draft.relatedConversationId).toBe(chat.activeId);
    const saved = insp.commitSave(insp.pendingSave!.draft);
    expect(saved).not.toBeNull();
    expect(insp.itemCount).toBe(1);
    expect(insp.pendingSave).toBeNull();
    expect(insp.items[0]!.relatedConversationId).toBe(chat.activeId);
  });

  it('基于灵感创建 Chat 草稿：不自动发送', () => {
    const insp = useInspirationStore();
    const item = insp.createInspiration(
      draftInput({ prompt: '帮我设计一个登录页', relatedModelId: 'code-collab' }),
    );
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    const sessionId = insp.createChatDraft(item.id);
    expect(sessionId).not.toBeNull();
    expect(chat.activeSession?.messages).toHaveLength(0);
    expect(chat.composerDraft).toContain('帮我设计一个登录页');
    expect(chat.activeSession?.model).toBe('code-collab');
  });

  it('基于灵感创作：相关智能体上下文生效', () => {
    const insp = useInspirationStore();
    const item = insp.createInspiration(
      draftInput({ prompt: '帮我润色', relatedAgentId: 'builtin-polish', relatedModelId: 'long-form-writing' }),
    );
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    insp.createChatDraft(item.id);
    expect(chat.activeSession?.agentName).toBe('灵感');
    expect(chat.activeSession?.model).toBe('long-form-writing');
    expect(chat.composerDraft).toContain('帮我润色');
  });

  it('附件 / 敏感字段绝不进入灵感存储', async () => {
    const insp = useInspirationStore();
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    chat.sendMessage('带图片的消息');
    const msg = chat.activeSession!.messages[1]!;
    // 提示词是合法文本字段（内容可能包含任意字符串）；
    // 验证点是存储结构绝不包含附件 / 完整会话 / 密钥等字段。
    insp.createInspiration(
      draftInput({ prompt: 'data:image/png;base64,AAAA 测试' }),
    );
    await vi.waitFor(() => {
      const raw = localStorage.getItem(INSPIRATION_STORAGE_KEY);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!) as { items: Array<Record<string, unknown>> };
      expect(parsed).not.toHaveProperty('attachments');
      expect(parsed).not.toHaveProperty('messages');
      expect(parsed).not.toHaveProperty('apiKey');
      const keys = Object.keys(parsed.items[0] ?? {});
      expect(keys).not.toContain('attachments');
      expect(keys).not.toContain('messages');
      expect(keys).not.toContain('apiKey');
      expect(keys).not.toContain('token');
    });
    void msg;
  });

  it('持久化：损坏回退 + recovered 标志', () => {
    localStorage.setItem(INSPIRATION_STORAGE_KEY, '{oops');
    const store = useInspirationStore();
    expect(store.recovered).toBe(true);
    expect(store.itemCount).toBe(0);
    expect(localStorage.getItem(INSPIRATION_STORAGE_KEY)).toBeNull();
  });

  it('持久化：版本不符回退', () => {
    localStorage.setItem(INSPIRATION_STORAGE_KEY, JSON.stringify({ version: 8, items: [] }));
    const store = useInspirationStore();
    expect(store.recovered).toBe(true);
  });

  it('写入失败不崩溃', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = useInspirationStore();
    expect(() => store.createInspiration(draftInput())).not.toThrow();
    expect(store.itemCount).toBe(1);
    spy.mockRestore();
  });

  it('v0 裸数组迁移', () => {
    const migrated = migrateInspirationV0([makeItem({ id: 'old-1' }), { bad: true }]);
    expect(migrated).toHaveLength(1);
    expect(migrated![0]!.id).toBe('old-1');
  });

  it('UI 偏好持久化：视图 / 排序 / 快捷视图', async () => {
    const store = useInspirationStore();
    store.setView('list');
    store.setSort('updated');
    store.setQuickView('favorites');
    store.setFilters({ keyword: 'xx' });
    await vi.waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(INSPIRATION_STORAGE_KEY)!);
      expect(raw.ui.view).toBe('list');
      expect(raw.ui.sort).toBe('updated');
      expect(raw.ui.quickView).toBe('favorites');
      expect(raw.ui.filters.keyword).toBe('xx');
    });
    // 重新加载保留 UI 状态
    setActivePinia(createPinia());
    const store2 = useInspirationStore();
    expect(store2.ui.view).toBe('list');
    expect(store2.ui.quickView).toBe('favorites');
  });
});

describe('灵感：模型关联', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('createInspirationDraft 默认视觉预设随类别', () => {
    const item = createInspirationDraft({ ...draftInput(), category: 'code' });
    expect(item.visualPreset).toBe('code');
    const writing = createInspirationDraft({ ...draftInput(), category: 'writing' });
    expect(writing.visualPreset).toBe('paper');
  });

  it('duplicateInspiration 纯函数：新 id 与副本后缀', () => {
    const src = makeItem();
    const copy = duplicateInspiration(src);
    expect(copy.id).not.toBe(src.id);
    expect(copy.title).toContain('（副本）');
  });

  it('推荐模型 id 来自模型目录（不展示价格/余额）', () => {
    // 智能体推荐模型必须存在于模型目录
    const ids = new Set(CHAT_MODELS.map((m) => m.id));
    for (const a of BUILTIN_AGENTS) {
      expect(ids.has(a.recommendedModelId)).toBe(true);
      expect(a.description).not.toMatch(/价格|余额|充值|积分|元/);
    }
  });
});
