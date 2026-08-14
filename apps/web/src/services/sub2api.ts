/**
 * Sub2API 控制台 —— Personal OS API 客户端
 *
 * 安全边界（与 apps/api/src/modules/sub2api/ 契约一致）：
 * - 前端只与 Personal OS API 通信，绝不直连 Sub2API；
 * - 管理端凭据（Bearer token）只保存在后端 Redis，前端永不持有；
 * - 完整 API Key 仅「创建成功」响应返回一次，展示后不持久化；
 * - 错误统一携带 code / statusCode / requestId，供排障与脱敏提示。
 *
 * 契约来源：apps/api/src/modules/sub2api/（controller + dto + service + types）。
 * 上游字段为 snake_case（Sub2API 官方契约），本文件原样透传。
 */
import type { FetchOptions } from 'ofetch';

import { apiFetch } from './index';

/* ---------- 后端统一响应包装 ---------- */

export interface ApiEnvelope<T> {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  data: T;
}

interface ApiErrorBody {
  requestId?: string;
  timestamp?: string;
  path?: string;
  statusCode?: number;
  code?: string;
  message?: string;
  fields?: unknown[];
}

/** Sub2API 调用失败：保留服务端 code / statusCode / requestId */
export class Sub2ApiError extends Error {
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

type ApiRequestOptions = FetchOptions<'json'>;

async function request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  let envelope: ApiEnvelope<T>;
  try {
    envelope = await apiFetch<ApiEnvelope<T>>(path, options);
  } catch (err) {
    throw normalizeFetchError(err);
  }
  return envelope.data;
}

/** ofetch 失败（错误响应体 / 网络层）→ Sub2ApiError */
function normalizeFetchError(err: unknown): Sub2ApiError {
  const raw = err as { data?: unknown; status?: number };
  const body = raw.data as ApiErrorBody | undefined;
  if (body && typeof body === 'object' && body !== null) {
    const status = body.statusCode ?? raw.status;
    return new Sub2ApiError(
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : `请求失败（HTTP ${status ?? '未知'}）`,
      { statusCode: status, code: body.code, requestId: body.requestId },
    );
  }
  return new Sub2ApiError('无法连接服务，请确认后端已启动后重试', { statusCode: raw.status });
}

/** 过滤 undefined 查询参数 */
function toQuery(params: Sub2ApiListQuery): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  const entries: Array<[string, string | number | undefined]> = [
    ['page', params.page],
    ['pageSize', params.pageSize],
    ['search', params.search],
    ['status', params.status],
    ['platform', params.platform],
    ['model', params.model],
    ['startDate', params.startDate],
    ['endDate', params.endDate],
    ['sortBy', params.sortBy],
    ['sortOrder', params.sortOrder],
  ];
  for (const [key, value] of entries) {
    if (value !== undefined && value !== '') out[key] = value;
  }
  return out;
}

/* ---------- 契约类型（与后端 service/adapter 返回一致） ---------- */

export interface Sub2ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface Sub2ApiSettingsSnapshot {
  configured: boolean;
  baseUrlMasked: string | null;
  timeoutMs: number;
  autoRefresh: boolean;
  refreshIntervalSec: number;
  upstreamVersion: string | null;
}

export interface Sub2ApiTestResult {
  ok: boolean;
  version: string;
  latencyMs: number;
  checkedAt: string;
}

export interface Sub2ApiOverview {
  configured: boolean;
  snapshot: {
    baseUrlMasked: string | null;
    timeoutMs: number;
    autoRefresh: boolean;
    refreshIntervalSec: number;
    upstreamVersion: string | null;
  };
  blocks: {
    version: { version: string } | null;
    stats: Sub2ApiDashboardStats | null;
    realtime: Sub2ApiRealtimeMetrics | null;
    trend: Sub2ApiTrendResponse | null;
    recentErrors: Sub2ApiPage<Sub2ApiOpsErrorLog> | null;
    models: string[] | null;
    counts: { accounts: number | null; groups: number | null; channels: number | null };
  };
}

export interface Sub2ApiDashboardStats {
  total_users: number;
  today_new_users: number;
  active_users: number;
  hourly_active_users: number;
  total_api_keys: number;
  active_api_keys: number;
  total_accounts: number;
  normal_accounts: number;
  error_accounts: number;
  ratelimit_accounts: number;
  overload_accounts: number;
  total_requests: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  today_requests: number;
  today_tokens: number;
  today_cost: number;
  today_actual_cost: number;
  average_duration_ms: number;
  uptime: number;
  rpm: number;
  tpm: number;
  stats_updated_at: string;
  stats_stale: boolean;
}

export interface Sub2ApiRealtimeMetrics {
  active_requests: number;
  requests_per_minute: number;
  average_response_time: number;
  error_rate: number;
}

export interface Sub2ApiTrendDataPoint {
  date: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  total_tokens: number;
  cost: number;
  actual_cost: number;
}

export interface Sub2ApiTrendResponse {
  trend: Sub2ApiTrendDataPoint[];
  start_date: string;
  end_date: string;
  granularity: string;
}

export interface Sub2ApiOpsErrorLog {
  id: number;
  created_at: string;
  phase: string;
  type: string;
  error_owner: string;
  error_source: string;
  severity: string;
  status_code: number;
  platform: string;
  model: string;
  resolved: boolean;
  request_id: string;
  client_request_id: string;
  message: string;
  user_email: string;
  account_name: string;
  group_name: string;
  request_path?: string;
}

export interface Sub2ApiChannel {
  id: number;
  name: string;
  description: string;
  status: string;
  billing_model_source: string;
  restrict_models: boolean;
  group_ids: number[];
  model_pricing: Sub2ApiChannelModelPricing[];
  model_mapping: Record<string, Record<string, string>>;
  created_at: string;
  updated_at: string;
}

export interface Sub2ApiChannelModelPricing {
  platform: string;
  models: string[];
  billing_mode: string;
  input_price: number | null;
  output_price: number | null;
}

export type Sub2ApiAccountPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok';
export type Sub2ApiAccountType =
  'oauth' | 'setup-token' | 'apikey' | 'upstream' | 'bedrock' | 'service_account';

export interface Sub2ApiAccount {
  id: number;
  name: string;
  notes?: string | null;
  platform: Sub2ApiAccountPlatform;
  type: Sub2ApiAccountType;
  credentials_status?: Record<string, boolean>;
  proxy_id: number | null;
  concurrency: number;
  current_concurrency?: number;
  priority: number;
  rate_multiplier?: number;
  status: string;
  error_message: string | null;
  last_used_at: string | null;
  expires_at: number | null;
  auto_pause_on_expired: boolean;
  created_at: string;
  updated_at: string;
  group_ids?: number[];
  groups?: Array<{ id: number; name: string }>;
}

export interface Sub2ApiAccountTestResult {
  success: boolean;
  message: string;
  latency_ms?: number;
}

export interface Sub2ApiSubscription {
  id: number;
  user_id: number;
  group_id: number;
  status: string;
  starts_at: string;
  daily_usage_usd: number;
  weekly_usage_usd: number;
  monthly_usage_usd: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  group?: { id: number; name: string; platform?: string } | null;
}

export interface Sub2ApiGroup {
  id: number;
  name: string;
  description: string | null;
  platform: string;
  rate_multiplier: number;
  is_exclusive: boolean;
  status: string;
  subscription_type: string;
  daily_limit_usd: number | null;
  weekly_limit_usd: number | null;
  monthly_limit_usd: number | null;
  sort_order: number;
  model_routing?: Record<string, number[]> | null;
  model_routing_enabled?: boolean;
  account_count?: number;
  active_account_count?: number;
  rate_limited_account_count?: number;
  created_at: string;
  updated_at: string;
}

export type Sub2ApiRouteEndpoint =
  | 'any'
  | 'messages'
  | 'count_tokens'
  | 'responses'
  | 'chat_completions'
  | 'embeddings'
  | 'images'
  | 'gemini';

export interface Sub2ApiCompositeRoute {
  id: number;
  group_id: number;
  public_model: string;
  match_type: 'exact' | 'prefix';
  target_platform: string;
  upstream_model: string;
  endpoint: Sub2ApiRouteEndpoint;
  priority: number;
  enabled: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface Sub2ApiApiKey {
  id: number;
  user_id: number;
  /** 列表/更新响应为掩码值；仅创建响应包含一次明文 */
  key: string;
  name: string;
  group_id: number | null;
  status: string;
  quota: number;
  quota_used: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  group?: { id: number; name: string } | null;
}

export interface Sub2ApiUsageLog {
  id: number;
  user_id: number;
  api_key_id: number;
  account_id: number | null;
  request_id: string;
  model: string;
  upstream_model?: string | null;
  group_id: number | null;
  subscription_id: number | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  actual_cost: number;
  billing_type: number;
  request_type?: string;
  stream: boolean;
  duration_ms: number | null;
  first_token_ms: number | null;
  created_at: string;
}

export interface Sub2ApiUsageStats {
  total_requests: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_tokens: number;
  total_tokens: number;
  total_cost: number;
  total_actual_cost: number;
  average_duration_ms: number;
}

/* ---------- 列表查询参数 ---------- */

export interface Sub2ApiListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  platform?: string;
  model?: string;
  startDate?: string;
  endDate?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/* ---------- 输入 DTO（与后端 dto 一致） ---------- */

export interface SaveSub2ApiSettingsInput {
  baseUrl?: string;
  apiToken?: string;
  timeoutMs?: number;
  autoRefresh?: boolean;
  refreshIntervalSec?: number;
}

export interface ChannelInput {
  name: string;
  description?: string;
  status?: string;
  group_ids?: number[];
  restrict_models?: boolean;
  model_mapping?: Record<string, Record<string, string>>;
  billing_model_source?: string;
}

export interface AccountInput {
  name: string;
  platform: Sub2ApiAccountPlatform;
  type?: Sub2ApiAccountType;
  notes?: string;
  status?: string;
  group_ids?: number[];
  priority?: number;
  concurrency?: number;
  rate_multiplier?: number;
  credentials?: Record<string, unknown>;
}

export interface GroupInput {
  name: string;
  description?: string;
  platform?: string;
  status?: string;
  rate_multiplier?: number;
  is_exclusive?: boolean;
  subscription_type?: string;
  model_routing?: Record<string, number[]>;
  model_routing_enabled?: boolean;
  sort_order?: number;
}

export interface CompositeRouteInput {
  public_model: string;
  match_type?: 'exact' | 'prefix';
  target_platform: string;
  upstream_model?: string;
  endpoint?: Sub2ApiRouteEndpoint;
  priority?: number;
  enabled?: boolean;
  notes?: string;
}

export interface ApiKeyCreateInput {
  name: string;
  group_id?: number | null;
  custom_key?: string;
  quota?: number;
  expires_in_days?: number;
  ip_whitelist?: string[];
  ip_blacklist?: string[];
}

export interface ApiKeyUpdateInput {
  name?: string;
  group_id?: number | null;
  status?: string;
  quota?: number;
}

/* ---------- API 方法 ---------- */

export const sub2apiApi = {
  // 设置
  getSettings(): Promise<Sub2ApiSettingsSnapshot> {
    return request<Sub2ApiSettingsSnapshot>('/sub2api/settings');
  },
  saveSettings(input: SaveSub2ApiSettingsInput): Promise<Sub2ApiSettingsSnapshot> {
    return request<Sub2ApiSettingsSnapshot>('/sub2api/settings', { method: 'PUT', body: input });
  },
  clearSettings(): Promise<void> {
    return request<void>('/sub2api/settings', { method: 'DELETE' });
  },
  testConnection(): Promise<Sub2ApiTestResult> {
    return request<Sub2ApiTestResult>('/sub2api/test', { method: 'POST' });
  },

  // 概览
  getOverview(): Promise<Sub2ApiOverview> {
    return request<Sub2ApiOverview>('/sub2api/overview');
  },

  // 渠道
  listChannels(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiChannel>> {
    return request<Sub2ApiPage<Sub2ApiChannel>>('/sub2api/channels', { query: toQuery(query) });
  },
  createChannel(input: ChannelInput): Promise<Sub2ApiChannel> {
    return request<Sub2ApiChannel>('/sub2api/channels', { method: 'POST', body: input });
  },
  updateChannel(id: number, input: Partial<ChannelInput>): Promise<Sub2ApiChannel> {
    return request<Sub2ApiChannel>(`/sub2api/channels/${id}`, { method: 'PUT', body: input });
  },
  deleteChannel(id: number): Promise<void> {
    return request<void>(`/sub2api/channels/${id}`, { method: 'DELETE' });
  },

  // 账号（订阅账号）
  listAccounts(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiAccount>> {
    return request<Sub2ApiPage<Sub2ApiAccount>>('/sub2api/accounts', { query: toQuery(query) });
  },
  createAccount(input: AccountInput): Promise<Sub2ApiAccount> {
    return request<Sub2ApiAccount>('/sub2api/accounts', { method: 'POST', body: input });
  },
  updateAccount(id: number, input: Partial<AccountInput>): Promise<Sub2ApiAccount> {
    return request<Sub2ApiAccount>(`/sub2api/accounts/${id}`, { method: 'PUT', body: input });
  },
  deleteAccount(id: number): Promise<void> {
    return request<void>(`/sub2api/accounts/${id}`, { method: 'DELETE' });
  },
  testAccount(id: number): Promise<Sub2ApiAccountTestResult> {
    return request<Sub2ApiAccountTestResult>(`/sub2api/accounts/${id}/test`, { method: 'POST' });
  },

  // 订阅
  listSubscriptions(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiSubscription>> {
    return request<Sub2ApiPage<Sub2ApiSubscription>>('/sub2api/subscriptions', {
      query: toQuery(query),
    });
  },
  revokeSubscription(id: number): Promise<void> {
    return request<void>(`/sub2api/subscriptions/${id}/revoke`, { method: 'POST' });
  },

  // 模型分组 / 路由
  listGroups(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiGroup>> {
    return request<Sub2ApiPage<Sub2ApiGroup>>('/sub2api/groups', { query: toQuery(query) });
  },
  listAllGroups(): Promise<Sub2ApiGroup[]> {
    return request<Sub2ApiGroup[]>('/sub2api/groups/all');
  },
  createGroup(input: GroupInput): Promise<Sub2ApiGroup> {
    return request<Sub2ApiGroup>('/sub2api/groups', { method: 'POST', body: input });
  },
  updateGroup(id: number, input: Partial<GroupInput>): Promise<Sub2ApiGroup> {
    return request<Sub2ApiGroup>(`/sub2api/groups/${id}`, { method: 'PUT', body: input });
  },
  deleteGroup(id: number): Promise<void> {
    return request<void>(`/sub2api/groups/${id}`, { method: 'DELETE' });
  },
  listRoutes(groupId: number): Promise<Sub2ApiCompositeRoute[]> {
    return request<Sub2ApiCompositeRoute[]>(`/sub2api/groups/${groupId}/routes`);
  },
  createRoute(groupId: number, input: CompositeRouteInput): Promise<Sub2ApiCompositeRoute> {
    return request<Sub2ApiCompositeRoute>(`/sub2api/groups/${groupId}/routes`, {
      method: 'POST',
      body: input,
    });
  },
  updateRoute(
    groupId: number,
    routeId: number,
    input: Partial<CompositeRouteInput>,
  ): Promise<Sub2ApiCompositeRoute> {
    return request<Sub2ApiCompositeRoute>(`/sub2api/groups/${groupId}/routes/${routeId}`, {
      method: 'PUT',
      body: input,
    });
  },
  deleteRoute(groupId: number, routeId: number): Promise<void> {
    return request<void>(`/sub2api/groups/${groupId}/routes/${routeId}`, { method: 'DELETE' });
  },

  // API 凭据
  listKeys(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiApiKey>> {
    return request<Sub2ApiPage<Sub2ApiApiKey>>('/sub2api/keys', { query: toQuery(query) });
  },
  createKey(input: ApiKeyCreateInput): Promise<Sub2ApiApiKey> {
    return request<Sub2ApiApiKey>('/sub2api/keys', { method: 'POST', body: input });
  },
  updateKey(id: number, input: ApiKeyUpdateInput): Promise<Sub2ApiApiKey> {
    return request<Sub2ApiApiKey>(`/sub2api/keys/${id}`, { method: 'PUT', body: input });
  },
  deleteKey(id: number): Promise<void> {
    return request<void>(`/sub2api/keys/${id}`, { method: 'DELETE' });
  },

  // 请求日志
  listUsage(query: Sub2ApiListQuery = {}): Promise<Sub2ApiPage<Sub2ApiUsageLog>> {
    return request<Sub2ApiPage<Sub2ApiUsageLog>>('/sub2api/usage', { query: toQuery(query) });
  },
  getUsageStats(query: Sub2ApiListQuery = {}): Promise<Sub2ApiUsageStats> {
    return request<Sub2ApiUsageStats>('/sub2api/usage/stats', { query: toQuery(query) });
  },
};
