/**
 * Sub2API 页面测试：概览（加载 / 空态 / 失败与 requestId / 重试）、
 * tab 导航、API 凭据密钥一次性展示（不持久化）。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { QueryClient, VueQueryPlugin } from '@tanstack/vue-query';
import { createMemoryHistory, createRouter } from 'vue-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Sub2ApiPage from '@/pages/sub2api/index.vue';
import type { Sub2ApiOverview } from '@/services/sub2api';

const { sub2apiApiMock } = vi.hoisted(() => ({
  sub2apiApiMock: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    clearSettings: vi.fn(),
    testConnection: vi.fn(),
    getOverview: vi.fn(),
    listChannels: vi.fn(),
    createChannel: vi.fn(),
    updateChannel: vi.fn(),
    deleteChannel: vi.fn(),
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    testAccount: vi.fn(),
    listSubscriptions: vi.fn(),
    revokeSubscription: vi.fn(),
    listGroups: vi.fn(),
    listAllGroups: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(),
    deleteGroup: vi.fn(),
    listRoutes: vi.fn(),
    createRoute: vi.fn(),
    updateRoute: vi.fn(),
    deleteRoute: vi.fn(),
    listKeys: vi.fn(),
    createKey: vi.fn(),
    updateKey: vi.fn(),
    deleteKey: vi.fn(),
    listUsage: vi.fn(),
    getUsageStats: vi.fn(),
  },
}));

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
  return { sub2apiApi: sub2apiApiMock, Sub2ApiError };
});

function overviewFixture(overrides: Partial<Sub2ApiOverview> = {}): Sub2ApiOverview {
  return {
    configured: true,
    snapshot: {
      baseUrlMasked: 'http://***.com',
      timeoutMs: 15000,
      autoRefresh: false,
      refreshIntervalSec: 60,
      upstreamVersion: '0.1.146',
    },
    blocks: {
      version: { version: '0.1.146' },
      stats: {
        total_users: 1,
        today_new_users: 0,
        active_users: 1,
        hourly_active_users: 1,
        total_api_keys: 2,
        active_api_keys: 1,
        total_accounts: 4,
        normal_accounts: 3,
        error_accounts: 1,
        ratelimit_accounts: 0,
        overload_accounts: 0,
        total_requests: 1234,
        total_tokens: 890123,
        total_cost: 12.5,
        total_actual_cost: 11.2,
        today_requests: 88,
        today_tokens: 21000,
        today_cost: 0.42,
        today_actual_cost: 0.4,
        average_duration_ms: 850,
        uptime: 259200,
        rpm: 6,
        tpm: 1400,
        stats_updated_at: new Date().toISOString(),
        stats_stale: false,
      },
      realtime: {
        active_requests: 2,
        requests_per_minute: 5,
        average_response_time: 812,
        error_rate: 1.5,
      },
      trend: { trend: [], start_date: '2026-08-14', end_date: '2026-08-15', granularity: 'hour' },
      recentErrors: { items: [], total: 0, page: 1, page_size: 5, pages: 0 },
      models: ['claude-sonnet-4-20250514', 'gpt-4o'],
      counts: { accounts: 4, groups: 2, channels: 3 },
    },
    ...overrides,
  };
}

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/sub2api', component: Sub2ApiPage }],
  });
}

function mountPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const router = createTestRouter();
  const wrapper = mount(Sub2ApiPage, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient }] as never, router],
      stubs: { teleport: true },
    },
  });
  return { wrapper, router, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  sub2apiApiMock.getOverview.mockResolvedValue(overviewFixture());
  sub2apiApiMock.listAllGroups.mockResolvedValue([]);
  sub2apiApiMock.listKeys.mockResolvedValue({
    items: [],
    total: 0,
    page: 1,
    page_size: 20,
    pages: 0,
  });
});

afterEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
});

describe('概览', () => {
  it('加载中显示 loading，成功渲染连接状态与指标', async () => {
    const { wrapper } = mountPage();
    // 首次渲染：查询未完成
    expect(wrapper.text()).toContain('Sub2API 控制台');
    await flushPromises();

    expect(wrapper.text()).toContain('已配置');
    expect(wrapper.text()).toContain('0.1.146');
    expect(wrapper.text()).toContain('今日请求');
    expect(wrapper.text()).toContain('88');
    expect(wrapper.text()).toContain('今日费用');
    expect(wrapper.text()).toContain('$0.42');
    wrapper.unmount();
  });

  it('数据块缺失时显示「不可用」而不是伪造数据', async () => {
    sub2apiApiMock.getOverview.mockResolvedValue({
      ...overviewFixture(),
      blocks: {
        version: null,
        stats: null,
        realtime: null,
        trend: null,
        recentErrors: null,
        models: null,
        counts: { accounts: null, groups: null, channels: null },
      },
    });
    const { wrapper } = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain('已配置');
    wrapper.unmount();
  });

  it('失败：展示错误 + requestId，点击重试恢复', async () => {
    const { Sub2ApiError } = await import('@/services/sub2api');
    sub2apiApiMock.getOverview.mockRejectedValueOnce(
      new Sub2ApiError('Sub2API 连接未配置', {
        statusCode: 400,
        code: 'SUB2API_NOT_CONFIGURED',
        requestId: 'req-fail-001',
      }),
    );
    const { wrapper } = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain('Sub2API 连接未配置');
    expect(wrapper.text()).toContain('SUB2API_NOT_CONFIGURED');
    expect(wrapper.text()).toContain('req-fail-001');
    expect(wrapper.text()).toContain('400');

    // 重试成功后错误消失
    const retryBtn = wrapper.findAll('button').find((b) => b.text().trim() === '重试');
    expect(retryBtn).toBeDefined();
    await retryBtn!.trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('已配置');
    expect(wrapper.text()).not.toContain('req-fail-001');
    wrapper.unmount();
  });
});

describe('tab 导航', () => {
  it('点击「API 凭据」切换到密钥列表视图', async () => {
    sub2apiApiMock.listKeys.mockResolvedValue({
      items: [
        {
          id: 1,
          user_id: 1,
          key: 'sk-abc***xyz',
          name: '本机开发',
          group_id: null,
          status: 'active',
          quota: 1000,
          quota_used: 10,
          expires_at: null,
          last_used_at: null,
          created_at: '2026-08-15T00:00:00.000Z',
          updated_at: '2026-08-15T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      page_size: 20,
      pages: 1,
    });
    const { wrapper, router } = mountPage();
    await flushPromises();

    const keysTab = wrapper.findAll('button').find((b) => b.text() === 'API 凭据');
    expect(keysTab).toBeDefined();
    await keysTab!.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.query.tab).toBe('keys');
    expect(wrapper.text()).toContain('本机开发');
    expect(wrapper.text()).toContain('sk-abc***xyz');
    wrapper.unmount();
  });
});

describe('API 凭据密钥一次性展示', () => {
  it('创建成功后完整密钥仅显示一次，关闭后消失且不写入 localStorage', async () => {
    sub2apiApiMock.listKeys.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 20,
      pages: 0,
    });
    sub2apiApiMock.createKey.mockResolvedValue({
      id: 9,
      user_id: 1,
      key: 'sk-plain-secret-only-once',
      name: '临时凭据',
      group_id: null,
      status: 'active',
      quota: 0,
      quota_used: 0,
      expires_at: null,
      last_used_at: null,
      created_at: '2026-08-15T00:00:00.000Z',
      updated_at: '2026-08-15T00:00:00.000Z',
    });
    const { wrapper } = mountPage();
    await flushPromises();

    // 切到 API 凭据 tab
    const keysTab = wrapper.findAll('button').find((b) => b.text() === 'API 凭据');
    await keysTab!.trigger('click');
    await flushPromises();

    // 打开创建表单并提交
    const createBtn = wrapper.findAll('button').find((b) => b.text().trim() === '新建凭据');
    expect(createBtn).toBeDefined();
    await createBtn!.trigger('click');
    await flushPromises();
    const nameInput = wrapper.find('input[placeholder="例如：本机开发"]');
    await nameInput.setValue('临时凭据');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    // 默认掩码；点击显示后出现完整密钥
    const masked = wrapper.find('[data-testid="sub2api-key-masked"]');
    expect(masked.exists()).toBe(true);
    expect(wrapper.text()).not.toContain('sk-plain-secret-only-once');

    await wrapper
      .findAll('button')
      .find((b) => b.text().trim() === '显示')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="sub2api-key-plain"]').text()).toBe(
      'sk-plain-secret-only-once',
    );

    // 关闭后完整密钥从 DOM 消失
    await wrapper
      .findAll('button')
      .find((b) => b.text().trim() === '我已保存')!
      .trigger('click');
    await flushPromises();
    expect(wrapper.text()).not.toContain('sk-plain-secret-only-once');

    // 浏览器持久化中无完整密钥
    const persisted = JSON.stringify(localStorage);
    expect(persisted).not.toContain('sk-plain-secret-only-once');
    wrapper.unmount();
  });
});
