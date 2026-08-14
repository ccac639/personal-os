/**
 * Sub2API 渠道视图测试：列表 / 筛选 / 分页 / 创建（防重复提交）/ 编辑 /
 * 启用禁用与删除（二次确认）/ 失败重试（requestId）。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ChannelsView from '@/features/sub2api/components/channels-view.vue';
import type { Sub2ApiChannel } from '@/services/sub2api';

const { sub2apiApiMock } = vi.hoisted(() => ({
  sub2apiApiMock: {
    listChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    listAllGroups: vi.fn(),
  },
}));

const { confirmMock } = vi.hoisted(() => ({ confirmMock: vi.fn() }));

vi.mock('@/services/sub2api', () => {
  class Sub2ApiError extends Error {
    readonly statusCode?: number;
    readonly code?: string;
    readonly requestId?: string;
    constructor(
      message: string,
      info: { statusCode?: number; code?: string; requestId?: string } = {},
    ) {
      super(message);
      this.name = 'Sub2ApiError';
      this.statusCode = info.statusCode;
      this.code = info.code;
      this.requestId = info.requestId;
    }
  }
  return {
    sub2apiApi: sub2apiApiMock,
    Sub2ApiError,
  };
});

vi.mock('@/app/confirm', () => ({ confirm: confirmMock }));

/** 按文本查找按钮（VTU 不支持 :has-text 选择器） */
function buttonByText(wrapper: ReturnType<typeof mountView>['wrapper'], text: string) {
  return wrapper.findAll('button').find((b) => b.text().trim() === text);
}

function channel(overrides: Partial<Sub2ApiChannel> = {}): Sub2ApiChannel {
  return {
    id: 1,
    name: 'Claude 直连',
    description: '官方 Anthropic 渠道',
    status: 'active',
    billing_model_source: 'group',
    restrict_models: false,
    group_ids: [1],
    model_pricing: [],
    model_mapping: {},
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function page(items: Sub2ApiChannel[], total: number, page = 1, pages = 1) {
  return { items, total, page, page_size: 10, pages };
}

function mountView() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const wrapper = mount(ChannelsView, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }] as never],
      stubs: { teleport: true },
    },
  });
  return { wrapper, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  confirmMock.mockReset();
  confirmMock.mockResolvedValue(true);
  sub2apiApiMock.listChannels.mockResolvedValue(page([channel()], 1));
  sub2apiApiMock.listAllGroups.mockResolvedValue([]);
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('列表', () => {
  it('成功渲染渠道行', async () => {
    sub2apiApiMock.listChannels.mockResolvedValue(
      page([channel({ id: 1, name: 'Claude 直连' }), channel({ id: 2, name: 'GPT 官方' })], 2),
    );
    const { wrapper } = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('Claude 直连');
    expect(wrapper.text()).toContain('GPT 官方');
    expect(wrapper.text()).toContain('共 2 条');
    wrapper.unmount();
  });

  it('空状态：无渠道时展示引导文案', async () => {
    sub2apiApiMock.listChannels.mockResolvedValue(page([], 0));
    const { wrapper } = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('暂无渠道');
    wrapper.unmount();
  });

  it('失败：展示错误 + requestId，点击重试恢复', async () => {
    const { Sub2ApiError } = await import('@/services/sub2api');
    sub2apiApiMock.listChannels.mockRejectedValueOnce(
      new Sub2ApiError('上游限流', {
        statusCode: 429,
        code: 'SUB2API_RATE_LIMITED',
        requestId: 'req-429-1',
      }),
    );
    const { wrapper } = mountView();
    await flushPromises();
    expect(wrapper.text()).toContain('上游限流');
    expect(wrapper.text()).toContain('SUB2API_RATE_LIMITED');
    expect(wrapper.text()).toContain('req-429-1');
    expect(wrapper.text()).toContain('429');

    await buttonByText(wrapper, '重试')!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('Claude 直连');
    wrapper.unmount();
  });
});

describe('筛选与分页', () => {
  it('状态筛选：点击「禁用」后以 status=disabled 重新查询', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    await buttonByText(wrapper, '禁用')!.trigger('click');
    await flushPromises();
    const lastCall = sub2apiApiMock.listChannels.mock.calls.at(-1)![0];
    expect(lastCall.status).toBe('disabled');
    expect(lastCall.page).toBe(1);
    wrapper.unmount();
  });

  it('分页：点击下一页以 page=2 查询', async () => {
    sub2apiApiMock.listChannels.mockResolvedValue(page([channel()], 15, 1, 2));
    const { wrapper } = mountView();
    await flushPromises();
    await buttonByText(wrapper, '下一页')!.trigger('click');
    await flushPromises();
    const lastCall = sub2apiApiMock.listChannels.mock.calls.at(-1)![0];
    expect(lastCall.page).toBe(2);
    wrapper.unmount();
  });

  it('搜索：回车后以 search 参数查询', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    const input = wrapper.find('input[type="search"]');
    await input.setValue('GPT');
    await input.trigger('keydown.enter');
    await flushPromises();
    const lastCall = sub2apiApiMock.listChannels.mock.calls.at(-1)![0];
    expect(lastCall.search).toBe('GPT');
    expect(lastCall.page).toBe(1);
    wrapper.unmount();
  });
});

describe('创建 / 编辑 / 禁用 / 删除', () => {
  it('创建：提交表单调用 createChannel，成功关闭弹窗', async () => {
    sub2apiApiMock.createChannel.mockResolvedValue(channel({ id: 9, name: '新渠道' }));
    const { wrapper } = mountView();
    await flushPromises();

    await buttonByText(wrapper, '新建渠道')!.trigger('click');
    await flushPromises();
    const nameInput = wrapper.find('input[placeholder*="Claude 直连"]');
    await nameInput.setValue('新渠道');
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(sub2apiApiMock.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ name: '新渠道' }),
    );
    // 弹窗关闭
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('防重复提交：pending 时提交按钮禁用，二次提交不重复调用', async () => {
    let resolveCreate!: (value: Sub2ApiChannel) => void;
    sub2apiApiMock.createChannel.mockImplementation(
      () => new Promise<Sub2ApiChannel>((resolve) => (resolveCreate = resolve)),
    );
    const { wrapper } = mountView();
    await flushPromises();

    await buttonByText(wrapper, '新建渠道')!.trigger('click');
    await flushPromises();
    await wrapper.find('input[placeholder*="Claude 直连"]').setValue('慢渠道');
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(sub2apiApiMock.createChannel).toHaveBeenCalledTimes(1);
    // 提交中：按钮禁用（防重复提交）
    const submitBtn = buttonByText(wrapper, '提交中…');
    expect(submitBtn).toBeDefined();
    expect(submitBtn!.attributes('disabled')).toBeDefined();
    // 再次提交被阻止
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();
    expect(sub2apiApiMock.createChannel).toHaveBeenCalledTimes(1);

    resolveCreate(channel({ id: 10, name: '慢渠道' }));
    await flushPromises();
    wrapper.unmount();
  });

  it('编辑：点击编辑 → 弹窗带原值 → 提交调用 updateChannel', async () => {
    sub2apiApiMock.updateChannel.mockResolvedValue(channel({ id: 1, name: '改名渠道' }));
    const { wrapper } = mountView();
    await flushPromises();

    await wrapper.find('button[aria-label="编辑渠道"]').trigger('click');
    await flushPromises();
    const nameInput = wrapper.find('input[placeholder*="Claude 直连"]');
    expect((nameInput.element as HTMLInputElement).value).toBe('Claude 直连');
    await nameInput.setValue('改名渠道');
    await wrapper.find('[role="dialog"] form').trigger('submit');
    await flushPromises();

    expect(sub2apiApiMock.updateChannel).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ name: '改名渠道' }),
    );
    wrapper.unmount();
  });

  it('禁用：确认后调用 updateChannel(status=disabled)', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    await wrapper.find('button[aria-label="禁用渠道"]').trigger('click');
    await flushPromises();
    expect(confirmMock).toHaveBeenCalled();
    expect(sub2apiApiMock.updateChannel).toHaveBeenCalledWith(1, { status: 'disabled' });
    wrapper.unmount();
  });

  it('禁用：取消确认时不调用更新', async () => {
    confirmMock.mockResolvedValue(false);
    const { wrapper } = mountView();
    await flushPromises();
    await wrapper.find('button[aria-label="禁用渠道"]').trigger('click');
    await flushPromises();
    expect(sub2apiApiMock.updateChannel).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('删除：确认后调用 deleteChannel；取消不调用', async () => {
    const { wrapper } = mountView();
    await flushPromises();
    await wrapper.find('button[aria-label="删除渠道"]').trigger('click');
    await flushPromises();
    expect(sub2apiApiMock.deleteChannel).toHaveBeenCalledWith(1);

    confirmMock.mockResolvedValue(false);
    await wrapper.find('button[aria-label="删除渠道"]').trigger('click');
    await flushPromises();
    expect(sub2apiApiMock.deleteChannel).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
});
