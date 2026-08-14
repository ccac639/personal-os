/**
 * Chat 智能体 —— 后端数据源测试
 *
 * 覆盖：列表加载 / 失败重试 / 展示适配 / 筛选排序 / 收藏隐藏 / 创建编辑删除 /
 * 启动会话（start 端点 + 防重复 + requestId）/ 预填；纯函数与 storage 迁移保留。
 * 通过 vi.mock 替换 services/agents，不调用真实 API。
 */
import { flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useAgentsStore,
  toChatAgent,
  modelIdFor,
  AGENT_LIST_PAGE_SIZE,
} from '@/features/chat/agent-store';
import { migrateAgentEnvelopeV0 } from '@/features/chat/agent-storage';
import {
  AGENT_CATEGORIES,
  BUILTIN_AGENTS,
  agentCategoryLabel,
  buildAgentLaunchPrompt,
  deriveAgentVariant,
  filterAgents,
  initialAgentInputs,
  sortAgents,
  validateAgentForm,
} from '@/features/chat/agents';
import { useChatStore } from '@/features/chat/store';
import type { ChatAgent } from '@/features/chat/agent-types';
import { AgentApiError } from '@/services/agents';
import type { AgentRecord } from '@/services/agents';

const { agentsApiMock } = vi.hoisted(() => ({
  agentsApiMock: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    start: vi.fn(),
  },
}));

vi.mock('@/services/agents', () => {
  class AgentApiError extends Error {
    readonly statusCode?: number;
    readonly code?: string;
    readonly requestId?: string;
    constructor(
      message: string,
      info: { statusCode?: number; code?: string; requestId?: string } = {},
    ) {
      super(message);
      this.name = 'AgentApiError';
      this.statusCode = info.statusCode;
      this.code = info.code;
      this.requestId = info.requestId;
    }
  }
  return {
    agentsApi: agentsApiMock,
    AgentApiError,
    AGENT_PROVIDERS: ['openai', 'anthropic', 'google', 'openrouter', 'siliconflow'],
  };
});

function record(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agt_1',
    name: '测试助手',
    description: '一句简介',
    model: 'gpt-4o-mini',
    provider: 'openai',
    systemPrompt: '你是测试助手',
    kind: 'personal',
    builtinKey: null,
    favorite: false,
    hidden: false,
    enabled: true,
    usageCount: 3,
    lastUsedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function seedList(records: AgentRecord[]): void {
  agentsApiMock.list.mockResolvedValue({
    items: records,
    total: records.length,
    page: 1,
    pageSize: AGENT_LIST_PAGE_SIZE,
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  vi.clearAllMocks();
});

describe('智能体：后端列表加载 / 失败重试', () => {
  it('store 创建即加载；records / agents / total 来自后端', async () => {
    seedList([
      record(),
      record({ id: 'agt_2', name: '代码评审员', kind: 'builtin', builtinKey: 'code-reviewer' }),
    ]);
    const store = useAgentsStore();
    await flushPromises();
    expect(agentsApiMock.list).toHaveBeenCalledWith({ pageSize: AGENT_LIST_PAGE_SIZE });
    expect(store.total).toBe(2);
    expect(store.agents).toHaveLength(2);
    expect(store.loaded).toBe(true);
    expect(store.listLoading).toBe(false);
    expect(store.listError).toBeNull();
  });

  it('加载失败：listError 保留 requestId，retry 恢复', async () => {
    agentsApiMock.list
      .mockRejectedValueOnce(
        new AgentApiError('服务暂时不可用', {
          statusCode: 500,
          code: 'INTERNAL',
          requestId: 'rid-abc',
        }),
      )
      .mockResolvedValueOnce({
        items: [record()],
        total: 1,
        page: 1,
        pageSize: AGENT_LIST_PAGE_SIZE,
      });
    const store = useAgentsStore();
    await flushPromises();
    expect(store.listError).toMatchObject({ message: '服务暂时不可用', requestId: 'rid-abc' });
    expect(store.agents).toHaveLength(0);

    await store.retry();
    await flushPromises();
    expect(store.listError).toBeNull();
    expect(store.agents).toHaveLength(1);
  });
});

describe('智能体：展示适配（后端记录 → ChatAgent）', () => {
  it('toChatAgent：真实字段透传，展示字段派生稳定默认值', () => {
    const a = toChatAgent(
      record({
        name: '写作润色师',
        description: '润色文章',
        usageCount: 7,
        lastUsedAt: '2026-08-10T00:00:00.000Z',
      }),
    );
    expect(a.id).toBe('agt_1');
    expect(a.name).toBe('写作润色师');
    expect(a.category).toBe('writing');
    expect(a.icon).toBe('pen-line');
    expect(a.color).toBe('var(--chat-rose)');
    expect(a.builtin).toBe(false);
    expect(a.favorite).toBe(false);
    expect(a.usageCount).toBe(7);
    expect(a.lastUsedAt).toBe(new Date('2026-08-10T00:00:00.000Z').getTime());
    expect(a.recommendedMode).toBe('chat');
    expect(a.starterPrompts).toEqual([]);
    expect(a.inputFields).toEqual([]);
  });

  it('toChatAgent：内置模板 kind=builtin；类别按名称/简介关键词派生', () => {
    const builtin = toChatAgent(
      record({ name: '代码评审员', kind: 'builtin', builtinKey: 'code-reviewer' }),
    );
    expect(builtin.builtin).toBe(true);
    expect(builtin.category).toBe('code');
    const fallback = toChatAgent(record({ name: '某个工具', description: '日常使用' }));
    expect(fallback.category).toBe('efficiency');
  });

  it('modelIdFor：后端 model 不在 CHAT_MODELS 时回退默认', () => {
    expect(modelIdFor('gpt-4o-mini')).toBe('general-reasoning');
    expect(modelIdFor('general-reasoning')).toBe('general-reasoning');
  });

  it('展示字段不写回后端（payload 无 ownerId / userId / id / usageCount / 时间戳）', async () => {
    seedList([]);
    agentsApiMock.create.mockResolvedValue(record());
    const store = useAgentsStore();
    await flushPromises();
    await store.createAgent({
      name: '新智能体',
      description: 'd',
      systemPrompt: 'p',
      category: 'code',
    });
    expect(agentsApiMock.create).toHaveBeenCalledWith(
      expect.not.objectContaining({
        ownerId: expect.anything(),
        userId: expect.anything(),
        id: expect.anything(),
        usageCount: expect.anything(),
        createdAt: expect.anything(),
      }),
    );
    const payload = agentsApiMock.create.mock.calls[0]![0] as Record<string, unknown>;
    expect(payload.name).toBe('新智能体');
    expect(payload.model).toBeUndefined();
  });
});

describe('智能体：筛选 / 排序（客户端 UI 状态）', () => {
  it('搜索命中名称；类别筛选；只看收藏', async () => {
    seedList([
      record({ id: 'a1', name: '文章润色', description: '写作助手' }),
      record({ id: 'a2', name: '代码助手', description: '评审代码', category: 'code' }),
    ]);
    const store = useAgentsStore();
    await flushPromises();

    store.setKeyword('润色');
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['a1']);

    store.setKeyword('');
    store.setCategory('code');
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['a2']);

    store.setCategory('all');
    store.toggleFavoritesOnly();
    expect(store.visibleAgents).toHaveLength(0);
    store.toggleFavoritesOnly();
    expect(store.activeFilterCount).toBe(0);
  });

  it('排序：最近使用 / 使用次数', async () => {
    seedList([
      record({ id: 'a1', name: 'A', usageCount: 1, lastUsedAt: '2026-08-01T00:00:00.000Z' }),
      record({ id: 'a2', name: 'B', usageCount: 5, lastUsedAt: '2026-08-10T00:00:00.000Z' }),
    ]);
    const store = useAgentsStore();
    await flushPromises();

    store.setSortBy('recent');
    expect(store.visibleAgents[0]!.id).toBe('a2');
    store.setSortBy('usage');
    expect(store.visibleAgents[0]!.id).toBe('a2');
    store.clearFilters();
    expect(store.sortBy).toBe('default');
  });

  it('隐藏的内置模板不出现；agentById 仍可读取', async () => {
    seedList([
      record({ id: 'b1', name: '内置', kind: 'builtin', builtinKey: 'x', hidden: true }),
      record({ id: 'p1', name: '个人', hidden: false }),
    ]);
    const store = useAgentsStore();
    await flushPromises();
    expect(store.visibleAgents.some((a) => a.id === 'b1')).toBe(false);
    expect(store.agentById('b1')?.name).toBe('内置');
  });
});

describe('智能体：收藏 / 隐藏（后端更新）', () => {
  it('toggleFavorite：调用 update 并本地 upsert', async () => {
    seedList([record()]);
    agentsApiMock.update.mockResolvedValue(record({ favorite: true }));
    const store = useAgentsStore();
    await flushPromises();

    const ok = await store.toggleFavorite('agt_1');
    expect(ok).toBe(true);
    expect(agentsApiMock.update).toHaveBeenCalledWith('agt_1', { favorite: true });
    expect(store.agentById('agt_1')?.favorite).toBe(true);
  });

  it('toggleFavorite 失败：返回 false 且 actionError 保留 requestId', async () => {
    seedList([record()]);
    agentsApiMock.update.mockRejectedValue(
      new AgentApiError('服务暂时不可用', {
        statusCode: 500,
        code: 'INTERNAL',
        requestId: 'rid-fav',
      }),
    );
    const store = useAgentsStore();
    await flushPromises();

    const ok = await store.toggleFavorite('agt_1');
    expect(ok).toBe(false);
    expect(store.actionError?.requestId).toBe('rid-fav');
  });

  it('toggleHidden：仅内置可隐藏', async () => {
    seedList([
      record({ id: 'b1', name: '内置', kind: 'builtin', builtinKey: 'x' }),
      record({ id: 'p1', name: '个人' }),
    ]);
    agentsApiMock.update.mockResolvedValue(
      record({ id: 'b1', name: '内置', kind: 'builtin', builtinKey: 'x', hidden: true }),
    );
    const store = useAgentsStore();
    await flushPromises();

    await store.toggleHidden('b1');
    expect(agentsApiMock.update).toHaveBeenCalledWith('b1', { hidden: true });
    expect(store.agentById('b1')?.hidden).toBe(true);

    agentsApiMock.update.mockClear();
    await store.toggleHidden('p1');
    expect(agentsApiMock.update).not.toHaveBeenCalled();
  });
});

describe('智能体：个人变体 CRUD（后端）', () => {
  it('创建：调 create 并追加到列表', async () => {
    seedList([]);
    agentsApiMock.create.mockResolvedValue(record({ id: 'agt_new', name: '新智能体' }));
    const store = useAgentsStore();
    await flushPromises();

    const created = await store.createAgent({
      name: '新智能体',
      description: 'd',
      systemPrompt: 'p',
    });
    expect(created?.id).toBe('agt_new');
    expect(agentsApiMock.create).toHaveBeenCalledTimes(1);
    expect(store.agentById('agt_new')).toBeDefined();
  });

  it('创建失败：返回 null 且 actionError 保留 requestId；saving 期间防重复', async () => {
    seedList([]);
    agentsApiMock.create.mockRejectedValue(
      new AgentApiError('名称不能为空', {
        statusCode: 400,
        code: 'VALIDATION',
        requestId: 'rid-create',
      }),
    );
    const store = useAgentsStore();
    await flushPromises();

    const first = store.createAgent({ name: '' });
    const second = store.createAgent({ name: '' });
    expect(await first).toBeNull();
    expect(await second).toBeNull();
    expect(agentsApiMock.create).toHaveBeenCalledTimes(1); // saving 期间重复提交被拒绝
    expect(store.actionError?.requestId).toBe('rid-create');
  });

  it('编辑：调 update（仅变更字段）；内置不可编辑', async () => {
    seedList([
      record({ id: 'p1', name: '个人', description: '旧简介', systemPrompt: '旧提示词' }),
      record({ id: 'b1', name: '内置', kind: 'builtin', builtinKey: 'x' }),
    ]);
    agentsApiMock.update.mockResolvedValue(
      record({ id: 'p1', name: '个人', description: '新简介', systemPrompt: '旧提示词' }),
    );
    const store = useAgentsStore();
    await flushPromises();

    expect(await store.updateAgent('b1', { name: 'x' })).toBe(false);
    expect(agentsApiMock.update).not.toHaveBeenCalled();

    const ok = await store.updateAgent('p1', {
      name: '个人',
      description: '新简介',
      systemPrompt: '旧提示词',
    });
    expect(ok).toBe(true);
    expect(agentsApiMock.update).toHaveBeenCalledWith('p1', { description: '新简介' });
  });

  it('复制：以源智能体创建「（变体）」', async () => {
    seedList([
      record({
        id: 'b1',
        name: '写作润色师',
        kind: 'builtin',
        builtinKey: 'writer-polisher',
        systemPrompt: '润色',
      }),
    ]);
    agentsApiMock.create.mockResolvedValue(record({ id: 'agt_copy', name: '写作润色师（变体）' }));
    const store = useAgentsStore();
    await flushPromises();

    const copy = await store.duplicateAgent('b1');
    expect(copy?.id).toBe('agt_copy');
    expect(agentsApiMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: '写作润色师（变体）', systemPrompt: '润色' }),
    );
  });

  it('删除：内置拒绝；个人调 remove 并移除', async () => {
    seedList([
      record({ id: 'b1', name: '内置', kind: 'builtin', builtinKey: 'x' }),
      record({ id: 'p1', name: '个人' }),
    ]);
    agentsApiMock.remove.mockResolvedValue(undefined);
    const store = useAgentsStore();
    await flushPromises();

    expect(await store.deleteAgent('b1')).toBe(false);
    expect(agentsApiMock.remove).not.toHaveBeenCalled();

    expect(await store.deleteAgent('p1')).toBe(true);
    expect(agentsApiMock.remove).toHaveBeenCalledWith('p1');
    expect(store.agentById('p1')).toBeUndefined();
  });

  it('删除失败：false 且 actionError 保留 requestId', async () => {
    seedList([record()]);
    agentsApiMock.remove.mockRejectedValue(
      new AgentApiError('服务暂时不可用', {
        statusCode: 500,
        code: 'INTERNAL',
        requestId: 'rid-del',
      }),
    );
    const store = useAgentsStore();
    await flushPromises();

    expect(await store.deleteAgent('agt_1')).toBe(false);
    expect(store.actionError?.requestId).toBe('rid-del');
    expect(store.agentById('agt_1')).toBeDefined();
  });
});

describe('智能体：启动会话（后端 start 端点）', () => {
  it('启动：调 POST start，会话对齐 conversationId，草稿预填，不自动发送', async () => {
    seedList([
      record({ id: 'agt_1', name: '测试助手', systemPrompt: '你是测试助手', usageCount: 3 }),
    ]);
    agentsApiMock.start.mockResolvedValue({
      agent: record({
        id: 'agt_1',
        name: '测试助手',
        systemPrompt: '你是测试助手',
        usageCount: 4,
        lastUsedAt: '2026-08-15T00:00:00.000Z',
      }),
      conversationId: 'conv_100',
    });
    const store = useAgentsStore();
    await flushPromises();

    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);

    const result = await store.launchAgent('agt_1', {});
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(agentsApiMock.start).toHaveBeenCalledWith('agt_1', { title: '测试助手' });
      expect(result.sessionId).toBe('conv_100');
      const session = chat.activeSession!;
      expect(session.id).toBe('conv_100');
      expect(session.systemPrompt?.text).toBe('你是测试助手');
      expect(session.systemPrompt?.presetId).toBe('agent:agt_1');
      expect(session.agentName).toBe('测试助手');
      expect(chat.composerDraft).toContain('测试助手');
      expect(session.messages).toHaveLength(0); // 初始内容不自动发送
    }
  });

  it('启动成功：刷新列表使 usageCount / lastUsedAt 更新', async () => {
    seedList([record({ id: 'agt_1', usageCount: 3, lastUsedAt: null })]);
    agentsApiMock.start.mockResolvedValue({
      agent: record({ id: 'agt_1', usageCount: 4, lastUsedAt: '2026-08-15T00:00:00.000Z' }),
      conversationId: 'conv_1',
    });
    const store = useAgentsStore();
    await flushPromises();
    expect(agentsApiMock.list).toHaveBeenCalledTimes(1);

    // 启动成功后刷新列表：后端返回更新后的 usageCount / lastUsedAt
    agentsApiMock.list.mockResolvedValueOnce({
      items: [record({ id: 'agt_1', usageCount: 4, lastUsedAt: '2026-08-15T00:00:00.000Z' })],
      total: 1,
      page: 1,
      pageSize: AGENT_LIST_PAGE_SIZE,
    });
    await store.launchAgent('agt_1', {});
    await flushPromises();
    expect(agentsApiMock.list.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(store.agentById('agt_1')?.usageCount).toBe(4);
    expect(store.agentById('agt_1')?.lastUsedAt).not.toBeNull();
  });

  it('防重复：同一智能体启动中再次点击被拒绝', async () => {
    seedList([record()]);
    let resolveStart: (v: unknown) => void = () => {};
    agentsApiMock.start.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const store = useAgentsStore();
    await flushPromises();

    const first = store.launchAgent('agt_1', {});
    const second = await store.launchAgent('agt_1', {});
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error).toContain('正在启动');

    resolveStart({ agent: record(), conversationId: 'conv_1' });
    const firstResult = await first;
    expect(firstResult.ok).toBe(true);
    expect(agentsApiMock.start).toHaveBeenCalledTimes(1);
  });

  it('启动失败：保留 requestId，不创建会话', async () => {
    seedList([record()]);
    agentsApiMock.start.mockRejectedValue(
      new AgentApiError('服务暂时不可用', {
        statusCode: 500,
        code: 'INTERNAL',
        requestId: 'rid-start',
      }),
    );
    const store = useAgentsStore();
    await flushPromises();

    const chat = useChatStore();
    const before = chat.sessions.length;

    const result = await store.launchAgent('agt_1', {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.info?.requestId).toBe('rid-start');
      expect(result.error).toBe('服务暂时不可用');
    }
    expect(chat.sessions.length).toBe(before);
  });
});

describe('智能体：目录与纯函数（本地展示逻辑保留）', () => {
  it('内置目录：六个类别、id 唯一、无第三方品牌', () => {
    expect(AGENT_CATEGORIES).toHaveLength(6);
    expect(BUILTIN_AGENTS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(BUILTIN_AGENTS.map((a) => a.id));
    expect(ids.size).toBe(BUILTIN_AGENTS.length);
    const names = BUILTIN_AGENTS.map((a) => a.name).join(' ');
    expect(names).not.toMatch(/gpt|claude|deepseek|glm|llama|gemini/i);
    expect(BUILTIN_AGENTS.every((a) => a.builtin)).toBe(true);
    expect(agentCategoryLabel('code')).toBe('代码协作');
  });

  it('纯函数：启动输入构建（填充字段 / 缺必填 null / 无字段回退示例任务）', () => {
    const agent = BUILTIN_AGENTS[0]!;
    expect(buildAgentLaunchPrompt(agent, { draft: ' 一段草稿 ', tone: 'formal' })).toContain(
      '一段草稿',
    );
    expect(buildAgentLaunchPrompt(agent, {})).toBeNull();
    const noField: ChatAgent = { ...agent, inputFields: [] };
    expect(buildAgentLaunchPrompt(noField, {})).toBe(agent.starterPrompts[0]);
  });

  it('纯函数：初始输入值带默认值', () => {
    const values = initialAgentInputs(BUILTIN_AGENTS[0]!);
    expect(values.tone).toBe('formal');
  });

  it('纯函数：表单校验', () => {
    expect(
      validateAgentForm({ name: '', description: 'x', systemPrompt: 'y', recommendedModelId: 'z' })
        .name,
    ).toBeDefined();
    expect(
      validateAgentForm({
        name: 'n',
        description: 'd',
        systemPrompt: 's',
        recommendedModelId: 'r',
      }),
    ).toEqual({});
  });

  it('纯函数：派生变体为 builtin=false、新 id、计数清零', () => {
    const v = deriveAgentVariant(BUILTIN_AGENTS[0]!, { name: '我的润色' });
    expect(v.builtin).toBe(false);
    expect(v.id).not.toBe(BUILTIN_AGENTS[0]!.id);
    expect(v.usageCount).toBe(0);
    expect(v.name).toBe('我的润色');
  });

  it('纯函数：filterAgents / sortAgents 行为不变', () => {
    const agents: ChatAgent[] = [
      { ...BUILTIN_AGENTS[0]!, id: 'x1', name: '文章润色', favorite: false, createdAt: 1 },
      { ...BUILTIN_AGENTS[1]!, id: 'x2', name: '代码评审', favorite: true, createdAt: 2 },
    ];
    const filtered = filterAgents(agents, {
      keyword: '润色',
      category: 'all',
      favoritesOnly: false,
    });
    expect(filtered.map((a) => a.id)).toEqual(['x1']);
    expect(sortAgents(agents, 'default')[0]!.id).toBe('x2');
  });
});

describe('智能体：不再消费 localStorage 主数据', () => {
  it('预置旧目录数据不影响后端列表', async () => {
    localStorage.setItem(
      'personal-os.chat.agents.v1',
      JSON.stringify({ version: 1, custom: [{ id: 'local_1', name: '本地旧智能体' }], states: {} }),
    );
    seedList([record()]);
    const store = useAgentsStore();
    await flushPromises();
    expect(store.agents).toHaveLength(1);
    expect(store.agents[0]!.id).toBe('agt_1');
    expect(store.agents.some((a) => a.id === 'local_1')).toBe(false);
  });

  it('v0 裸数组迁移函数保留（数据不丢，仅不再被 store 消费）', () => {
    const migrated = migrateAgentEnvelopeV0([
      { id: 'a1', name: '旧智能体', systemPrompt: 'p', description: 'd' },
      { id: 1, name: '非法' },
    ]);
    expect(migrated).not.toBeNull();
    expect(migrated!.custom).toHaveLength(1);
    expect(migrated!.custom[0]!.builtin).toBe(false);
  });
});

describe('智能体：从消息预填变体', () => {
  it('prefillFromMessage 设置预填状态并清除', async () => {
    seedList([]);
    const store = useAgentsStore();
    await flushPromises();
    store.prefillFromMessage('m1', '帮我写一段润色示例', 's1');
    expect(store.pendingPrefill).toMatchObject({ source: 'message', relatedId: 's1' });
    expect(store.pendingPrefill?.title).toContain('帮我写一段润色示例');
    store.clearPrefill();
    expect(store.pendingPrefill).toBeNull();
  });
});
