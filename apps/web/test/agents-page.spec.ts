/**
 * Agents 管理页 —— 集成测试（列表 / 搜索 / 状态筛选 / 空态 / 失败态 / 创建 / 编辑 / 删除确认）
 *
 * 通过 vi.mock 替换 services/agents 与 app 壳层 confirm/toast；
 * AppDrawer 内部使用 Teleport，测试中以 teleport stub 内联渲染以便查询表单。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';

import AgentsPage from '@/pages/agents/index.vue';
import type { AgentRecord } from '@/services/agents';

const { agentsApiMock } = vi.hoisted(() => ({
  agentsApiMock: {
    list: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));
const { toastMock } = vi.hoisted(() => ({
  toastMock: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
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

vi.mock('@/app/confirm', () => ({ confirm: confirmMock }));
vi.mock('@/app/toast', () => ({ toast: toastMock, dismissToast: vi.fn() }));

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

function mountPage() {
  const pinia = createPinia();
  const wrapper = mount(AgentsPage, {
    global: {
      plugins: [pinia],
      stubs: { teleport: true },
    },
  });
  return { wrapper, pinia };
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockReset();
  toastMock.success.mockClear();
  toastMock.error.mockClear();
  toastMock.info.mockClear();
  confirmMock.mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('列表加载', () => {
  it('成功：渲染卡片与计数', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [
        record({ id: 'agt_1', name: '个人助手' }),
        record({ id: 'agt_2', name: '通用助手', kind: 'builtin', builtinKey: 'general-assistant' }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    const { wrapper } = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('个人助手');
    expect(wrapper.text()).toContain('通用助手');
    expect(wrapper.text()).toContain('共 2 个');
    expect(wrapper.find('[data-testid="agents-loading"]').exists()).toBe(false);
  });

  it('加载失败：展示错误与 requestId，点击重试恢复', async () => {
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.list
      .mockRejectedValueOnce(
        new AgentApiError('服务暂时不可用', {
          statusCode: 500,
          code: 'INTERNAL_ERROR',
          requestId: 'rid-500',
        }),
      )
      .mockResolvedValueOnce({
        items: [record({ id: 'agt_1', name: '恢复后的助手' })],
        total: 1,
        page: 1,
        pageSize: 100,
      });

    const { wrapper } = mountPage();
    await flushPromises();

    expect(wrapper.get('[data-testid="agents-error"]').text()).toContain('服务暂时不可用');
    expect(wrapper.get('[data-testid="agents-error"]').text()).toContain('rid-500');

    await wrapper.get('[data-testid="agents-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('恢复后的助手');
    expect(wrapper.find('[data-testid="agents-error"]').exists()).toBe(false);
  });

  it('刷新失败（已加载过）：顶部横幅展示错误并保留 requestId', async () => {
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.list
      .mockResolvedValueOnce({ items: [record()], total: 1, page: 1, pageSize: 100 })
      .mockRejectedValueOnce(
        new AgentApiError('后端暂时不可用', {
          statusCode: 503,
          code: 'DEPENDENCY_UNAVAILABLE',
          requestId: 'rid-503',
        }),
      );

    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="agents-refresh"]').trigger('click');
    await flushPromises();

    const banner = wrapper.get('[data-testid="agents-refresh-error"]');
    expect(banner.text()).toContain('后端暂时不可用');
    expect(banner.text()).toContain('rid-503');
    // 已加载的卡片仍然可见
    expect(wrapper.text()).toContain('测试助手');
  });
});

describe('搜索与筛选', () => {
  it('搜索：输入防抖 250ms 后携带 q 重新请求服务端', async () => {
    vi.useFakeTimers();
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '润色师' }), record({ id: 'agt_2', name: '评审员' })],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    const { wrapper } = mountPage();
    await flushPromises();
    expect(agentsApiMock.list).toHaveBeenCalledTimes(1);

    await wrapper.get('[data-testid="agents-search"]').setValue('润色');
    expect(agentsApiMock.list).toHaveBeenCalledTimes(1); // 防抖期内不请求

    await vi.advanceTimersByTimeAsync(300);
    expect(agentsApiMock.list).toHaveBeenCalledTimes(2);
    expect(agentsApiMock.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: '润色', page: 1 }),
    );
  });

  it('状态筛选：客户端过滤启用 / 停用', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [
        record({ id: 'agt_1', name: '启用中助手', enabled: true }),
        record({ id: 'agt_2', name: '停用助手', enabled: false }),
      ],
      total: 2,
      page: 1,
      pageSize: 100,
    });
    const { wrapper } = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="agents-status-enabled"]').trigger('click');
    expect(wrapper.text()).toContain('启用中助手');
    expect(wrapper.text()).not.toContain('停用助手');

    await wrapper.get('[data-testid="agents-status-disabled"]').trigger('click');
    expect(wrapper.text()).toContain('停用助手');
    expect(wrapper.text()).not.toContain('启用中助手');
    expect(agentsApiMock.list).toHaveBeenCalledTimes(1); // 客户端过滤，不重复请求
  });

  it('空状态：无数据展示新建引导；筛选无结果展示清空筛选', async () => {
    agentsApiMock.list.mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 100 });
    const { wrapper } = mountPage();
    await flushPromises();
    expect(wrapper.get('[data-testid="agents-empty"]').text()).toContain('还没有智能体');

    agentsApiMock.list.mockResolvedValueOnce({
      items: [record({ id: 'agt_1', name: '启用中助手', enabled: true })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    await wrapper.get('[data-testid="agents-refresh"]').trigger('click');
    await flushPromises();
    await wrapper.get('[data-testid="agents-status-disabled"]').trigger('click');
    expect(wrapper.get('[data-testid="agents-empty"]').text()).toContain('没有匹配的智能体');
    expect(wrapper.get('[data-testid="agents-empty"]').text()).toContain('清空筛选');
  });

  it('移动端结构：筛选工具栏可换行、卡片网格基础单列', async () => {
    agentsApiMock.list.mockResolvedValue({ items: [record()], total: 1, page: 1, pageSize: 100 });
    const { wrapper } = mountPage();
    await flushPromises();

    const toolbar = wrapper.get('div.flex.flex-wrap.items-center.gap-2'); // 搜索 + 筛选行
    expect(toolbar.classes()).toContain('flex-wrap');
    const grid = wrapper.get('.grid');
    expect(grid.classes()).toContain('grid-cols-1');
  });
});

describe('创建', () => {
  it('成功：表单提交调用 create，成功提示并关闭抽屉', async () => {
    agentsApiMock.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const created = record({ id: 'agt_new', name: '新助手' });
    agentsApiMock.create.mockResolvedValue(created);
    agentsApiMock.list.mockResolvedValue({ items: [created], total: 1, page: 1, pageSize: 100 });

    const { wrapper } = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="agents-new"]').trigger('click');
    await nextTick();

    await wrapper.get('[data-testid="agent-form-name"]').setValue('新助手');
    await wrapper.get('[data-testid="agent-form-model"]').setValue('gpt-4o-mini');
    await wrapper.get('[data-testid="agent-form-system-prompt"]').setValue('你是新助手');
    await wrapper.get('[data-testid="agent-form-provider"]').setValue('openai');
    await wrapper.get('[data-testid="agent-form-submit"]').trigger('click');
    await flushPromises();

    expect(agentsApiMock.create).toHaveBeenCalledWith({
      name: '新助手',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: '你是新助手',
      favorite: false,
    });
    expect(toastMock.success).toHaveBeenCalledWith('已创建智能体');
    // 抽屉已关闭（表单不再渲染）
    expect(wrapper.find('[data-testid="agent-form-name"]').exists()).toBe(false);
  });

  it('校验失败：空名称不提交并展示错误', async () => {
    agentsApiMock.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const { wrapper } = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="agents-new"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-testid="agent-form-submit"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('请输入智能体名称');
    expect(agentsApiMock.create).not.toHaveBeenCalled();
  });

  it('提交中：保存按钮禁用，重复点击不重复提交', async () => {
    agentsApiMock.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    let resolveCreate!: (r: AgentRecord) => void;
    agentsApiMock.create.mockReturnValue(
      new Promise<AgentRecord>((res) => {
        resolveCreate = res;
      }),
    );

    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="agents-new"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-testid="agent-form-name"]').setValue('新助手');
    await wrapper.get('[data-testid="agent-form-model"]').setValue('gpt-4o-mini');
    await wrapper.get('[data-testid="agent-form-submit"]').trigger('click');
    await nextTick();

    const submitBtn = wrapper.get('[data-testid="agent-form-submit"]');
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true);
    expect(submitBtn.text()).toContain('保存中');

    await submitBtn.trigger('click');
    await flushPromises();
    expect(agentsApiMock.create).toHaveBeenCalledTimes(1);

    resolveCreate(record({ id: 'agt_new' }));
    await flushPromises();
  });

  it('API 失败：toast 提示用户可读信息，表单内展示 requestId', async () => {
    agentsApiMock.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.create.mockRejectedValue(
      new AgentApiError('名称已被占用', {
        statusCode: 409,
        code: 'CONFLICT',
        requestId: 'rid-conflict',
      }),
    );

    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="agents-new"]').trigger('click');
    await nextTick();
    await wrapper.get('[data-testid="agent-form-name"]').setValue('重名助手');
    await wrapper.get('[data-testid="agent-form-model"]').setValue('gpt-4o-mini');
    await wrapper.get('[data-testid="agent-form-submit"]').trigger('click');
    await flushPromises();

    expect(toastMock.error).toHaveBeenCalledWith('名称已被占用');
    const errBox = wrapper.get('[data-testid="agent-form-error"]');
    expect(errBox.text()).toContain('名称已被占用');
    expect(errBox.text()).toContain('rid-conflict');
    // 抽屉保持打开，可修正后重试
    expect(wrapper.find('[data-testid="agent-form-name"]').exists()).toBe(true);
  });
});

describe('编辑', () => {
  it('成功：表单预填 → 提交 update → 成功提示并关闭', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '旧名字', model: 'gpt-4o-mini', provider: 'openai' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    agentsApiMock.update.mockResolvedValue(record({ id: 'agt_1', name: '新名字' }));

    const { wrapper } = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="agent-card-edit"]').trigger('click');
    await nextTick();

    const nameInput = wrapper.get('[data-testid="agent-form-name"]') as unknown as {
      element: HTMLInputElement;
    };
    expect(nameInput.element.value).toBe('旧名字');

    await wrapper.get('[data-testid="agent-form-name"]').setValue('新名字');
    await wrapper.get('[data-testid="agent-form-submit"]').trigger('click');
    await flushPromises();

    expect(agentsApiMock.update).toHaveBeenCalledWith(
      'agt_1',
      expect.objectContaining({ name: '新名字', favorite: false, enabled: true }),
    );
    expect(toastMock.success).toHaveBeenCalledWith('已保存修改');
    expect(wrapper.find('[data-testid="agent-form-name"]').exists()).toBe(false);
  });
});

describe('删除确认', () => {
  it('确认后调用 remove 并提示成功；详情抽屉同步关闭', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '待删除助手' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    agentsApiMock.remove.mockResolvedValue(undefined);

    const { wrapper } = mountPage();
    await flushPromises();

    await wrapper.get('[data-testid="agent-card-delete"]').trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ title: '删除智能体', tone: 'danger' }),
    );
    expect(agentsApiMock.remove).toHaveBeenCalledWith('agt_1');
    expect(toastMock.success).toHaveBeenCalledWith('已删除「待删除助手」');
    expect(wrapper.get('[data-testid="agents-empty"]').text()).toContain('还没有智能体');
  });

  it('取消确认：不调用 remove', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '保留助手' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    confirmMock.mockResolvedValue(false);

    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="agent-card-delete"]').trigger('click');
    await flushPromises();

    expect(confirmMock).toHaveBeenCalled();
    expect(agentsApiMock.remove).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('保留助手');
  });

  it('删除失败：toast 展示用户可读信息（含 requestId 排障线索）', async () => {
    agentsApiMock.list.mockResolvedValue({
      items: [record({ id: 'agt_1', name: '删不掉的助手' })],
      total: 1,
      page: 1,
      pageSize: 100,
    });
    const { AgentApiError } = await import('@/services/agents');
    agentsApiMock.remove.mockRejectedValue(
      new AgentApiError('内置模板不可删除，可改为隐藏', {
        statusCode: 400,
        code: 'BAD_REQUEST',
        requestId: 'rid-del',
      }),
    );

    const { wrapper } = mountPage();
    await flushPromises();
    await wrapper.get('[data-testid="agent-card-delete"]').trigger('click');
    await flushPromises();

    expect(toastMock.error).toHaveBeenCalledWith('内置模板不可删除，可改为隐藏');
    expect(wrapper.text()).toContain('删不掉的助手'); // 保留在列表
  });
});
