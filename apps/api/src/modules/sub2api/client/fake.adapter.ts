/**
 * Sub2ApiAdapter 测试替身：内存态 fake，用于后端测试（不触网）。
 *
 * - 与真实客户端同接口（见 adapter.ts），路由级行为可预设；
 * - 支持按上游路径注入错误（401 / 403 / 429 / 5xx / 超时 / 网络错误），
 *   覆盖服务层错误映射与降级逻辑；
 * - 列表返回内存数据 + 分页切片，模拟上游 PaginatedResponse。
 */
import {
  errUpstreamTimeout,
  errUpstreamUnreachable,
  mapUpstreamHttpError,
} from '../errors/sub2api.errors.js';
import type { Sub2ApiAdapter, Sub2ApiListParams } from './adapter.js';
import type {
  Sub2ApiAccount,
  Sub2ApiAccountTestResult,
  Sub2ApiApiKey,
  Sub2ApiChannel,
  Sub2ApiCompositeRoute,
  Sub2ApiDashboardStats,
  Sub2ApiGroup,
  Sub2ApiOpsErrorLog,
  Sub2ApiPage,
  Sub2ApiRealtimeMetrics,
  Sub2ApiSubscription,
  Sub2ApiTrendResponse,
  Sub2ApiUsageLog,
  Sub2ApiUsageStats,
  Sub2ApiVersion,
} from '../types/sub2api.contract.js';

export interface FakeUpstreamError {
  kind: 'http' | 'timeout' | 'network';
  status?: number;
  message?: string;
}

export class FakeSub2ApiAdapter implements Sub2ApiAdapter {
  version: Sub2ApiVersion = { version: '0.1.146' };
  stats: Sub2ApiDashboardStats = {
    total_users: 1,
    today_new_users: 0,
    active_users: 1,
    hourly_active_users: 1,
    total_api_keys: 3,
    active_api_keys: 2,
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
    uptime: 3600 * 24 * 3,
    rpm: 6,
    tpm: 1400,
    stats_updated_at: new Date().toISOString(),
    stats_stale: false,
  };
  realtime: Sub2ApiRealtimeMetrics = {
    active_requests: 2,
    requests_per_minute: 5,
    average_response_time: 812,
    error_rate: 1.5,
  };
  trend: Sub2ApiTrendResponse = {
    trend: [
      {
        date: '2026-08-09',
        requests: 10,
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        total_tokens: 1500,
        cost: 0.01,
        actual_cost: 0.01,
      },
      {
        date: '2026-08-10',
        requests: 20,
        input_tokens: 2000,
        output_tokens: 1000,
        cache_creation_tokens: 0,
        cache_read_tokens: 0,
        total_tokens: 3000,
        cost: 0.02,
        actual_cost: 0.02,
      },
    ],
    start_date: '2026-08-09',
    end_date: '2026-08-15',
    granularity: 'day',
  };
  recentErrors: Sub2ApiOpsErrorLog[] = [
    {
      id: 1,
      created_at: new Date().toISOString(),
      phase: 'upstream',
      type: 'upstream_http_error',
      error_owner: 'provider',
      error_source: 'upstream_http',
      severity: 'error',
      status_code: 429,
      platform: 'anthropic',
      model: 'claude-sonnet-4',
      resolved: false,
      request_id: 'req_err_1',
      client_request_id: 'cl_req_1',
      message: 'upstream rate limited',
      user_email: 'local@personal-os',
      account_name: 'acc-1',
      group_name: 'claude',
    },
  ];
  models: string[] = ['claude-sonnet-4-20250514', 'gpt-4o', 'gemini-2.5-pro'];
  channels: Sub2ApiChannel[] = [];
  accounts: Sub2ApiAccount[] = [];
  subscriptions: Sub2ApiSubscription[] = [];
  groups: Sub2ApiGroup[] = [];
  routes: Sub2ApiCompositeRoute[] = [];
  apiKeys: Sub2ApiApiKey[] = [];
  usageLogs: Sub2ApiUsageLog[] = [];

  /** 按「方法名 → 错误」预设失败 */
  errors: Record<string, FakeUpstreamError> = {};

  private fail(method: string): never {
    const err = this.errors[method];
    if (!err) throw new Error(`[fake] unexpected call to ${method}`);
    if (err.kind === 'timeout') throw errUpstreamTimeout();
    if (err.kind === 'network') throw errUpstreamUnreachable(err.message ?? 'ECONNREFUSED');
    // 与真实 Sub2ApiClient.request() 一致：上游 HTTP 错误映射为稳定 HttpException
    throw mapUpstreamHttpError(err.status ?? 500, err.message ?? `HTTP ${err.status}`);
  }

  // ---------- 概览 ----------

  async getVersion(): Promise<Sub2ApiVersion> {
    if (this.errors.getVersion) this.fail('getVersion');
    return this.version;
  }

  async getDashboardStats(): Promise<Sub2ApiDashboardStats> {
    if (this.errors.getDashboardStats) this.fail('getDashboardStats');
    return this.stats;
  }

  async getRealtimeMetrics(): Promise<Sub2ApiRealtimeMetrics> {
    if (this.errors.getRealtimeMetrics) this.fail('getRealtimeMetrics');
    return this.realtime;
  }

  async getUsageTrend(): Promise<Sub2ApiTrendResponse> {
    if (this.errors.getUsageTrend) this.fail('getUsageTrend');
    return this.trend;
  }

  async getRecentErrors(): Promise<Sub2ApiPage<Sub2ApiOpsErrorLog>> {
    if (this.errors.getRecentErrors) this.fail('getRecentErrors');
    return this.page(this.recentErrors, { page: 1, page_size: 5 });
  }

  async listModels(): Promise<string[]> {
    if (this.errors.listModels) this.fail('listModels');
    return this.models;
  }

  async countAccounts(): Promise<number> {
    return this.accounts.length;
  }

  async countGroups(): Promise<number> {
    return this.groups.length;
  }

  async countChannels(): Promise<number> {
    return this.channels.length;
  }

  // ---------- 渠道 ----------

  async listChannels(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiChannel>> {
    if (this.errors.listChannels) this.fail('listChannels');
    return this.page(this.channels, params);
  }

  async createChannel(input: Record<string, unknown>): Promise<Sub2ApiChannel> {
    if (this.errors.createChannel) this.fail('createChannel');
    const channel: Sub2ApiChannel = {
      id: nextId(this.channels),
      name: String(input.name ?? ''),
      description: String(input.description ?? ''),
      status: String(input.status ?? 'active'),
      billing_model_source: String(input.billing_model_source ?? 'requested'),
      restrict_models: Boolean(input.restrict_models),
      group_ids: Array.isArray(input.group_ids) ? (input.group_ids as number[]) : [],
      model_pricing: [],
      model_mapping: (input.model_mapping as Record<string, Record<string, string>>) ?? {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.channels.push(channel);
    return channel;
  }

  async updateChannel(id: number, input: Record<string, unknown>): Promise<Sub2ApiChannel> {
    if (this.errors.updateChannel) this.fail('updateChannel');
    const channel = this.channels.find((c) => c.id === id);
    if (!channel) throw Object.assign(new Error('not found'), { status: 404 });
    return Object.assign(channel, input, { id });
  }

  async deleteChannel(id: number): Promise<void> {
    if (this.errors.deleteChannel) this.fail('deleteChannel');
    this.channels = this.channels.filter((c) => c.id !== id);
  }

  // ---------- 账号 ----------

  async listAccounts(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiAccount>> {
    if (this.errors.listAccounts) this.fail('listAccounts');
    return this.page(this.accounts, params);
  }

  async createAccount(input: Record<string, unknown>): Promise<Sub2ApiAccount> {
    if (this.errors.createAccount) this.fail('createAccount');
    const account: Sub2ApiAccount = {
      id: nextId(this.accounts),
      name: String(input.name ?? ''),
      platform: String(input.platform ?? 'anthropic') as Sub2ApiAccount['platform'],
      type: String(input.type ?? 'apikey') as Sub2ApiAccount['type'],
      credentials_status: { has_api_key: true },
      proxy_id: null,
      concurrency: 1,
      priority: 0,
      status: 'active',
      error_message: null,
      last_used_at: null,
      expires_at: null,
      auto_pause_on_expired: false,
      schedulable: true,
      rate_limited_at: null,
      overload_until: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.accounts.push(account);
    return account;
  }

  async updateAccount(id: number, input: Record<string, unknown>): Promise<Sub2ApiAccount> {
    if (this.errors.updateAccount) this.fail('updateAccount');
    const account = this.accounts.find((a) => a.id === id);
    if (!account) throw Object.assign(new Error('not found'), { status: 404 });
    return Object.assign(account, input, { id });
  }

  async deleteAccount(id: number): Promise<void> {
    if (this.errors.deleteAccount) this.fail('deleteAccount');
    this.accounts = this.accounts.filter((a) => a.id !== id);
  }

  async testAccount(id: number): Promise<Sub2ApiAccountTestResult> {
    if (this.errors.testAccount) this.fail('testAccount');
    if (!this.accounts.some((a) => a.id === id)) {
      throw Object.assign(new Error('account not found'), { status: 404 });
    }
    return { success: true, message: '连接成功', latency_ms: 320 };
  }

  // ---------- 订阅 ----------

  async listSubscriptions(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiSubscription>> {
    if (this.errors.listSubscriptions) this.fail('listSubscriptions');
    return this.page(this.subscriptions, params);
  }

  async revokeSubscription(id: number): Promise<void> {
    if (this.errors.revokeSubscription) this.fail('revokeSubscription');
    const sub = this.subscriptions.find((s) => s.id === id);
    if (!sub) throw Object.assign(new Error('not found'), { status: 404 });
    sub.status = 'revoked';
  }

  // ---------- 分组 ----------

  async listGroups(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiGroup>> {
    if (this.errors.listGroups) this.fail('listGroups');
    return this.page(this.groups, params);
  }

  async listAllGroups(): Promise<Sub2ApiGroup[]> {
    if (this.errors.listAllGroups) this.fail('listAllGroups');
    return this.groups;
  }

  async createGroup(input: Record<string, unknown>): Promise<Sub2ApiGroup> {
    if (this.errors.createGroup) this.fail('createGroup');
    const group: Sub2ApiGroup = {
      id: nextId(this.groups),
      name: String(input.name ?? ''),
      description: String(input.description ?? '') || null,
      platform: String(input.platform ?? 'anthropic') as Sub2ApiGroup['platform'],
      rate_multiplier: Number(input.rate_multiplier ?? 1),
      is_exclusive: Boolean(input.is_exclusive),
      status: 'active',
      subscription_type: String(input.subscription_type ?? 'standard'),
      daily_limit_usd: null,
      weekly_limit_usd: null,
      monthly_limit_usd: null,
      sort_order: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.groups.push(group);
    return group;
  }

  async updateGroup(id: number, input: Record<string, unknown>): Promise<Sub2ApiGroup> {
    if (this.errors.updateGroup) this.fail('updateGroup');
    const group = this.groups.find((g) => g.id === id);
    if (!group) throw Object.assign(new Error('not found'), { status: 404 });
    return Object.assign(group, input, { id });
  }

  async deleteGroup(id: number): Promise<void> {
    if (this.errors.deleteGroup) this.fail('deleteGroup');
    this.groups = this.groups.filter((g) => g.id !== id);
  }

  async listCompositeRoutes(): Promise<Sub2ApiCompositeRoute[]> {
    if (this.errors.listCompositeRoutes) this.fail('listCompositeRoutes');
    return this.routes;
  }

  async createCompositeRoute(
    groupId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute> {
    if (this.errors.createCompositeRoute) this.fail('createCompositeRoute');
    const route: Sub2ApiCompositeRoute = {
      id: nextId(this.routes),
      group_id: groupId,
      public_model: String(input.public_model ?? ''),
      match_type: String(input.match_type ?? 'exact') as 'exact' | 'prefix',
      target_platform: String(
        input.target_platform ?? 'anthropic',
      ) as Sub2ApiCompositeRoute['target_platform'],
      upstream_model: String(input.upstream_model ?? ''),
      endpoint: String(input.endpoint ?? 'any') as Sub2ApiCompositeRoute['endpoint'],
      priority: Number(input.priority ?? 0),
      enabled: input.enabled === undefined ? true : Boolean(input.enabled),
      notes: String(input.notes ?? ''),
    };
    this.routes.push(route);
    return route;
  }

  async updateCompositeRoute(
    groupId: number,
    routeId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute> {
    if (this.errors.updateCompositeRoute) this.fail('updateCompositeRoute');
    const route = this.routes.find((r) => r.id === routeId && r.group_id === groupId);
    if (!route) throw Object.assign(new Error('not found'), { status: 404 });
    return Object.assign(route, input, { id: routeId, group_id: groupId });
  }

  async deleteCompositeRoute(groupId: number, routeId: number): Promise<void> {
    if (this.errors.deleteCompositeRoute) this.fail('deleteCompositeRoute');
    this.routes = this.routes.filter((r) => !(r.id === routeId && r.group_id === groupId));
  }

  // ---------- API 凭据 ----------

  async listApiKeys(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiApiKey>> {
    if (this.errors.listApiKeys) this.fail('listApiKeys');
    return this.page(this.apiKeys, params);
  }

  async createApiKey(input: Record<string, unknown>): Promise<Sub2ApiApiKey> {
    if (this.errors.createApiKey) this.fail('createApiKey');
    const keyValue = String(input.custom_key ?? 'sk-test-secret-key');
    const apiKey: Sub2ApiApiKey = {
      id: nextId(this.apiKeys),
      user_id: 1,
      key: keyValue,
      name: String(input.name ?? ''),
      group_id: (input.group_id as number | null | undefined) ?? null,
      status: 'active',
      quota: Number(input.quota ?? 0),
      quota_used: 0,
      expires_at: null,
      last_used_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.apiKeys.push(apiKey);
    return apiKey;
  }

  async updateApiKey(id: number, input: Record<string, unknown>): Promise<Sub2ApiApiKey> {
    if (this.errors.updateApiKey) this.fail('updateApiKey');
    const apiKey = this.apiKeys.find((k) => k.id === id);
    if (!apiKey) throw Object.assign(new Error('not found'), { status: 404 });
    return Object.assign(apiKey, input, { id });
  }

  async deleteApiKey(id: number): Promise<void> {
    if (this.errors.deleteApiKey) this.fail('deleteApiKey');
    this.apiKeys = this.apiKeys.filter((k) => k.id !== id);
  }

  // ---------- 请求日志 ----------

  async listUsage(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiUsageLog>> {
    if (this.errors.listUsage) this.fail('listUsage');
    return this.page(this.usageLogs, params);
  }

  async getUsageStats(): Promise<Sub2ApiUsageStats> {
    if (this.errors.getUsageStats) this.fail('getUsageStats');
    return {
      total_requests: 1234,
      total_input_tokens: 500000,
      total_output_tokens: 390123,
      total_cache_tokens: 0,
      total_tokens: 890123,
      total_cost: 12.5,
      total_actual_cost: 11.2,
      average_duration_ms: 850,
    };
  }

  // ---------- 内部 ----------

  private page<T>(items: T[], params: Sub2ApiListParams): Sub2ApiPage<T> {
    const page = params.page >= 1 ? params.page : 1;
    const pageSize = params.page_size >= 1 ? params.page_size : 20;
    const start = (page - 1) * pageSize;
    const slice = items.slice(start, start + pageSize);
    return {
      items: slice,
      total: items.length,
      page,
      page_size: pageSize,
      pages: Math.ceil(items.length / pageSize) || 0,
    };
  }
}

function nextId<T extends { id: number }>(items: T[]): number {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}
