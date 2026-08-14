/**
 * Agents 管理 —— store 测试（列表 / 筛选 / 创建 / 编辑 / 删除 / API 失败 / 防重复提交）
 *
 * 通过 vi.mock 替换 services/agents，聚焦 store 的状态机与 pending 通道。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useAgentAdminStore } from '@/features/agents/store';
import type { AgentRecord, CreateAgentPayload } from '@/services/agents';

const { agentsApiMock } = vi.hoisted(() => ({
  agentsApiMock: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
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
  return { agentsApi: agentsApiMock, AgentApiError };
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

const payload: CreateAgentPayload = { name: '新助手', provider: 'openai', model: 'gpt-4o-mini' };

describe('store：列表加载', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('成功：填充 items/total/loaded，携带分页与关键字查询', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record(), record({ id: 'agt_2', name: '内置', kind: 'builtin' })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    const store = useAgentAdminStore();
    await store.fetchList();
    expect(store.items).toHaveLength(2);
    expect(store.total).toBe(2);
    expect(store.loaded).toBe(true);
    expect(store.listError).toBeNull();
    expect(agentsApiMock.list).toHaveBeenCalledWith({ q: undefined, page: 1, pageSize: 100 });
  });

  it('失败：listError 转用户可读信息并保留 requestId', async () => {
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.list.mockRejectedValue(
      new AgentApiError('服务暂时不可用', {
        statusCode: 500,
        code: 'INTERNAL_ERROR',
        requestId: 'rid-list',
      }),
    );
    const store = useAgentAdminStore();
    await store.fetchList();
    expect(store.loaded).toBe(false);
    expect(store.listError?.message).toBe('服务暂时不可用');
    expect(store.listError?.requestId).toBe('rid-list');
    expect(store.listError?.code).toBe('INTERNAL_ERROR');
  });
});

describe('store：筛选', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    agentsApiMock.list.mockResolvedValue({
      items: [
        record({ id: 'agt_enabled', name: '启用中', enabled: true, favorite: true }),
        record({ id: 'agt_disabled', name: '已停用', enabled: false }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
  });

  it('状态筛选：all / enabled / disabled 客户端过滤', async () => {
    const store = useAgentAdminStore();
    await store.fetchList();
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['agt_enabled', 'agt_disabled']);

    store.setStatusFilter('enabled');
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['agt_enabled']);

    store.setStatusFilter('disabled');
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['agt_disabled']);
  });

  it('只看收藏 + activeFilterCount', async () => {
    const store = useAgentAdminStore();
    await store.fetchList();
    expect(store.activeFilterCount).toBe(0);
    store.toggleFavoritesOnly();
    expect(store.activeFilterCount).toBe(1);
    expect(store.visibleAgents.map((a) => a.id)).toEqual(['agt_enabled']);

    store.setStatusFilter('disabled');
    expect(store.activeFilterCount).toBe(2);
    expect(store.visibleAgents).toHaveLength(0);
  });

  it('setKeyword：置关键字并重置页码；clearFilters 全量复位', () => {
    const store = useAgentAdminStore();
    store.page = 3;
    store.setKeyword('润色');
    expect(store.keyword).toBe('润色');
    expect(store.page).toBe(1);

    store.setStatusFilter('disabled');
    store.toggleFavoritesOnly();
    store.clearFilters();
    expect(store.keyword).toBe('');
    expect(store.statusFilter).toBe('all');
    expect(store.favoritesOnly).toBe(false);
    expect(store.page).toBe(1);
  });
});

describe('store：创建', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    agentsApiMock.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
  });

  it('成功：调用 create 后按服务端排序刷新列表，saving 复位', async () => {
    const created = record({ id: 'agt_new', name: '新助手' });
    agentsApiMock.create.mockResolvedValue(created);
    agentsApiMock.list.mockResolvedValue({ items: [created], total: 1, page: 1, pageSize: 100 });

    const store = useAgentAdminStore();
    const result = await store.createAgent(payload);
    expect(result?.id).toBe('agt_new');
    expect(agentsApiMock.create).toHaveBeenCalledWith(payload);
    expect(agentsApiMock.list).toHaveBeenCalledTimes(1);
    expect(store.items.map((a) => a.id)).toEqual(['agt_new']);
    expect(store.saving).toBe(false);
    expect(store.actionError).toBeNull();
  });

  it('提交中防重复提交：第二次调用直接返回 null，create 只调一次', async () => {
    let resolveCreate!: (r: AgentRecord) => void;
    agentsApiMock.create.mockReturnValue(
      new Promise<AgentRecord>((res) => {
        resolveCreate = res;
      }),
    );

    const store = useAgentAdminStore();
    const p1 = store.createAgent(payload);
    const p2 = store.createAgent(payload); // saving=true，应被拦截
    await expect(p2).resolves.toBeNull();
    expect(store.saving).toBe(true);

    resolveCreate(record({ id: 'agt_new' }));
    await p1;
    expect(agentsApiMock.create).toHaveBeenCalledTimes(1);
    expect(store.saving).toBe(false);
  });

  it('失败：actionError 转用户可读信息并保留 requestId', async () => {
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.create.mockRejectedValue(
      new AgentApiError('名称已被占用', { statusCode: 409, code: 'CONFLICT', requestId: 'rid-c' }),
    );
    const store = useAgentAdminStore();
    const result = await store.createAgent(payload);
    expect(result).toBeNull();
    expect(store.actionError?.message).toBe('名称已被占用');
    expect(store.actionError?.requestId).toBe('rid-c');
    expect(store.saving).toBe(false);
  });
});

describe('store：编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  async function storeWithOne(): Promise<ReturnType<typeof useAgentAdminStore>> {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '旧名字', enabled: true })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    const store = useAgentAdminStore();
    await store.fetchList();
    return store;
  }

  it('成功（表单通道）：patch 列表内记录，saving 复位', async () => {
    const store = await storeWithOne();
    agentsApiMock.update.mockResolvedValue(record({ id: 'agt_1', name: '新名字' }));

    const updated = await store.updateAgent('agt_1', { name: '新名字', enabled: true }, 'form');
    expect(updated?.name).toBe('新名字');
    expect(agentsApiMock.update).toHaveBeenCalledWith('agt_1', { name: '新名字', enabled: true });
    expect(store.items[0]?.name).toBe('新名字');
    expect(store.saving).toBe(false);
  });

  it('成功（toggle 通道）：togglingIds 期间防重复，结束后清空', async () => {
    const store = await storeWithOne();
    let resolveUpdate!: (r: AgentRecord) => void;
    agentsApiMock.update.mockReturnValue(
      new Promise<AgentRecord>((res) => {
        resolveUpdate = res;
      }),
    );

    const p1 = store.updateAgent('agt_1', { favorite: true }, 'toggle');
    const p2 = store.updateAgent('agt_1', { favorite: true }, 'toggle'); // 行级防重复
    await expect(p2).resolves.toBeNull();
    expect(store.togglingIds).toContain('agt_1');
    expect(store.saving).toBe(false); // toggle 不影响表单通道

    resolveUpdate(record({ id: 'agt_1', name: '旧名字', favorite: true }));
    await p1;
    expect(store.togglingIds).not.toContain('agt_1');
    expect(store.items[0]?.favorite).toBe(true);
    expect(agentsApiMock.update).toHaveBeenCalledTimes(1);
  });

  it('失败：返回 null 且 actionError 保留 requestId', async () => {
    const store = await storeWithOne();
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.update.mockRejectedValue(
      new AgentApiError('该智能体已停用', {
        statusCode: 400,
        code: 'BAD_REQUEST',
        requestId: 'rid-u',
      }),
    );
    const result = await store.updateAgent('agt_1', { enabled: false }, 'toggle');
    expect(result).toBeNull();
    expect(store.actionError?.message).toBe('该智能体已停用');
    expect(store.actionError?.requestId).toBe('rid-u');
    expect(store.togglingIds).not.toContain('agt_1');
  });
});

describe('store：删除', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('成功：调用 remove 并移除条目、total 减一，deletingIds 清空', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1' }), record({ id: 'agt_2' })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    agentsApiMock.remove.mockResolvedValue(undefined);

    const store = useAgentAdminStore();
    await store.fetchList();
    const ok = await store.removeAgent('agt_1');
    expect(ok).toBe(true);
    expect(agentsApiMock.remove).toHaveBeenCalledWith('agt_1');
    expect(store.items.map((a) => a.id)).toEqual(['agt_2']);
    expect(store.total).toBe(1);
    expect(store.deletingIds).toEqual([]);
  });

  it('行级 pending：同一 id 删除中再次调用被拦截', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    let resolveRemove!: () => void;
    agentsApiMock.remove.mockReturnValue(
      new Promise<void>((res) => {
        resolveRemove = res;
      }),
    );

    const store = useAgentAdminStore();
    await store.fetchList();
    const p1 = store.removeAgent('agt_1');
    const p2 = store.removeAgent('agt_1');
    await expect(p2).resolves.toBe(false);
    expect(store.deletingIds).toContain('agt_1');

    resolveRemove();
    await p1;
    expect(store.deletingIds).toEqual([]);
    expect(agentsApiMock.remove).toHaveBeenCalledTimes(1);
  });

  it('失败（如后端拒绝删除内置模板）：返回 false 且 actionError 保留 requestId', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.remove.mockRejectedValue(
      new AgentApiError('内置模板不可删除，可改为隐藏', {
        statusCode: 400,
        code: 'BAD_REQUEST',
        requestId: 'rid-d',
      }),
    );

    const store = useAgentAdminStore();
    await store.fetchList();
    const ok = await store.removeAgent('agt_1');
    expect(ok).toBe(false);
    expect(store.actionError?.message).toBe('内置模板不可删除，可改为隐藏');
    expect(store.actionError?.requestId).toBe('rid-d');
    expect(store.items).toHaveLength(1); // 失败不移除
  });
});
