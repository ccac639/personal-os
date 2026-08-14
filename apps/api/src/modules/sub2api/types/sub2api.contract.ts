/**
 * Sub2API（Wei-Shaw/sub2api）管理端契约类型。
 *
 * 来源：官方仓库 frontend/src/types/index.ts 与 frontend/src/api/admin/*.ts
 * （Wei-Shaw/sub2api main 分支，2026-08-15 核对）。
 * - 响应信封：{ code: 0, message, data }，code === 0 表示成功；
 * - 分页响应：{ items, total, page, page_size, pages }；
 * - 认证：Authorization: Bearer <token>；
 * - 管理端点统一挂在 /api/v1/admin/* 下。
 *
 * 本文件只声明「本模块实际使用」的字段子集；上游新增字段不会破坏解析
 * （多余字段原样透传，绝不虚构字段名）。
 */

/** 上游响应信封（code === 0 为成功） */
export interface Sub2ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

/** 上游分页响应 */
export interface Sub2ApiPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

/** 上游分页请求参数（列表接口必须显式携带，禁止一次拉取无限数据） */
export interface Sub2ApiPageParams {
  page: number;
  page_size: number;
  [key: string]: string | number | boolean | undefined;
}

// ---------- 系统 ----------

export interface Sub2ApiVersion {
  version: string;
}

// ---------- 概览 / Dashboard ----------

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
  /** 错误率（上游口径，单位百分比） */
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

// ---------- 请求日志 / Usage ----------

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
  [key: string]: unknown;
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
  [key: string]: unknown;
}

// ---------- 最近错误 / Ops ----------

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
  api_key_name?: string;
  account_name: string;
  group_name: string;
  client_ip?: string | null;
  request_path?: string;
  stream?: boolean;
  requested_model?: string;
  upstream_model?: string;
  [key: string]: unknown;
}

// ---------- 渠道 / Channel ----------

export interface Sub2ApiChannelModelPricing {
  platform: string;
  models: string[];
  billing_mode: string;
  input_price: number | null;
  output_price: number | null;
  cache_write_price: number | null;
  cache_read_price: number | null;
  image_input_price: number | null;
  image_output_price: number | null;
  per_request_price: number | null;
  [key: string]: unknown;
}

export interface Sub2ApiChannel {
  id: number;
  name: string;
  description: string;
  /** 'active' | 'disabled' */
  status: string;
  billing_model_source: string;
  restrict_models: boolean;
  group_ids: number[];
  model_pricing: Sub2ApiChannelModelPricing[];
  /** platform → { 上游模型: 对外模型 } */
  model_mapping: Record<string, Record<string, string>>;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

// ---------- 账号（订阅账号）/ Account ----------

export type Sub2ApiAccountPlatform = 'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok';
export type Sub2ApiAccountType =
  'oauth' | 'setup-token' | 'apikey' | 'upstream' | 'bedrock' | 'service_account';

export interface Sub2ApiAccount {
  id: number;
  name: string;
  notes?: string | null;
  platform: Sub2ApiAccountPlatform;
  type: Sub2ApiAccountType;
  /** 后端已脱敏：真实凭据不会出现在响应中，仅通过 credentials_status 暴露存在性 */
  credentials?: Record<string, unknown>;
  credentials_status?: Record<string, boolean>;
  proxy_id: number | null;
  concurrency: number;
  current_concurrency?: number;
  priority: number;
  rate_multiplier?: number;
  /** 'active' | 'inactive' | 'error' */
  status: string;
  error_message: string | null;
  last_used_at: string | null;
  expires_at: number | null;
  auto_pause_on_expired: boolean;
  created_at: string;
  updated_at: string;
  group_ids?: number[];
  groups?: Array<{ id: number; name: string }>;
  schedulable: boolean;
  rate_limited_at: string | null;
  overload_until: string | null;
  [key: string]: unknown;
}

export interface Sub2ApiAccountTestResult {
  success: boolean;
  message: string;
  latency_ms?: number;
}

// ---------- 模型分组 / Group ----------

export type Sub2ApiGroupPlatform =
  'anthropic' | 'openai' | 'gemini' | 'antigravity' | 'grok' | 'composite';

export interface Sub2ApiGroup {
  id: number;
  name: string;
  description: string | null;
  platform: Sub2ApiGroupPlatform;
  rate_multiplier: number;
  is_exclusive: boolean;
  /** 'active' | 'inactive' */
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
  [key: string]: unknown;
}

// ---------- 模型路由 / Composite Route ----------

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
  target_platform: Exclude<Sub2ApiGroupPlatform, 'composite'>;
  upstream_model: string;
  endpoint: Sub2ApiRouteEndpoint;
  priority: number;
  enabled: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

// ---------- API 凭据 / ApiKey ----------

export interface Sub2ApiApiKey {
  id: number;
  user_id: number;
  /** 服务端返回的 key（列表/查询时通常为完整值；本模块对外一律掩码，仅创建响应返回明文一次） */
  key: string;
  name: string;
  group_id: number | null;
  /** 'active' | 'inactive' | 'quota_exhausted' | 'expired' */
  status: string;
  quota: number;
  quota_used: number;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
  group?: { id: number; name: string } | null;
  [key: string]: unknown;
}

// ---------- 订阅 / Subscription ----------

export interface Sub2ApiSubscription {
  id: number;
  user_id: number;
  group_id: number;
  /** 'active' | 'expired' | 'revoked' | 'suspended' */
  status: string;
  starts_at: string;
  daily_usage_usd: number;
  weekly_usage_usd: number;
  monthly_usage_usd: number;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  user?: { id: number; email: string } | null;
  group?: { id: number; name: string; platform?: string } | null;
  [key: string]: unknown;
}
