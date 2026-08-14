/**
 * Sub2API 真实 HTTP 适配器。
 *
 * 安全设计：
 * - 所有上游路径来自本文件内部固定模板（白名单），构造后再次校验，
 *   客户端无法注入任意路径 / 任意 URL（SSRF 第二道闸）；
 * - Authorization: Bearer <token> 只在请求头发送，绝不写入日志或错误信息；
 * - 请求超时（AbortSignal.timeout）与响应体大小上限（2MB）双重保护；
 * - redirect: 'error' 禁止跟随重定向，防止被 3xx 带往外部主机；
 * - 上游错误统一映射为稳定错误码（401/403/404/409/429/5xx/超时/不可达）；
 * - 响应信封 { code, message, data }：code !== 0 视为业务错误。
 */
import { Inject, Injectable } from '@nestjs/common';

import {
  errInvalidPath,
  errUpstreamBusiness,
  errUpstreamTimeout,
  errUpstreamTooLarge,
  errUpstreamUnreachable,
  mapUpstreamHttpError,
  sanitizeUpstreamMessage,
} from '../errors/sub2api.errors.js';
import { Sub2ApiSettingsService } from '../sub2api.settings.service.js';
import type {
  Sub2ApiAccount,
  Sub2ApiAccountTestResult,
  Sub2ApiApiKey,
  Sub2ApiChannel,
  Sub2ApiCompositeRoute,
  Sub2ApiDashboardStats,
  Sub2ApiEnvelope,
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
import type { Sub2ApiAdapter, Sub2ApiListParams } from './adapter.js';
import { buildUpstreamUrl } from './url-validation.js';

/** fetch 注入点（测试替换为 fake） */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export const SUB2API_FETCH = Symbol('SUB2API_FETCH');

/** 响应体大小上限：2MB（请求日志 / 账号列表等大响应截断保护） */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/** 默认分页大小（上游分页参数必带，禁止无限拉取） */
export const DEFAULT_PAGE_SIZE = 20;

/** 本适配器允许访问的上游路径前缀白名单（全部来自内部模板） */
export const ALLOWED_PATH_PREFIXES: readonly string[] = [
  '/admin/system/version',
  '/admin/dashboard/stats',
  '/admin/dashboard/realtime',
  '/admin/dashboard/trend',
  '/admin/ops/request-errors',
  '/admin/channels',
  '/admin/accounts',
  '/admin/subscriptions',
  '/admin/groups',
  '/keys',
  '/models',
  '/usage',
];

export function isAllowedPath(path: string): boolean {
  // 精确匹配或以允许前缀 + / 数字 id 结尾（id 由 ParseIntPipe 校验过的数字）
  return ALLOWED_PATH_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

@Injectable()
export class Sub2ApiClient implements Sub2ApiAdapter {
  constructor(
    private readonly settings: Sub2ApiSettingsService,
    @Inject(SUB2API_FETCH) private readonly fetchImpl: FetchLike,
  ) {}

  // ---------- 概览 ----------

  async getVersion(): Promise<Sub2ApiVersion> {
    return this.request<Sub2ApiVersion>('/admin/system/version');
  }

  async getDashboardStats(): Promise<Sub2ApiDashboardStats> {
    return this.request<Sub2ApiDashboardStats>('/admin/dashboard/stats');
  }

  async getRealtimeMetrics(): Promise<Sub2ApiRealtimeMetrics> {
    return this.request<Sub2ApiRealtimeMetrics>('/admin/dashboard/realtime');
  }

  async getUsageTrend(params: {
    start_date?: string;
    end_date?: string;
    granularity?: 'day' | 'hour';
  }): Promise<Sub2ApiTrendResponse> {
    return this.request<Sub2ApiTrendResponse>('/admin/dashboard/trend', {
      query: { ...params, timezone: 'Asia/Shanghai' },
    });
  }

  async getRecentErrors(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiOpsErrorLog>> {
    return this.request<Sub2ApiPage<Sub2ApiOpsErrorLog>>('/admin/ops/request-errors', {
      query: this.normalizeListParams(params),
    });
  }

  async listModels(): Promise<string[]> {
    const data = await this.request<{ data?: Array<{ id?: string }> }>('/models');
    return (data.data ?? []).map((m) => m.id ?? '').filter(Boolean);
  }

  async countAccounts(): Promise<number> {
    return this.count('/admin/accounts');
  }

  async countGroups(): Promise<number> {
    return this.count('/admin/groups');
  }

  async countChannels(): Promise<number> {
    return this.count('/admin/channels');
  }

  // ---------- 渠道 ----------

  async listChannels(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiChannel>> {
    return this.request<Sub2ApiPage<Sub2ApiChannel>>('/admin/channels', {
      query: this.normalizeListParams(params),
    });
  }

  async createChannel(input: Record<string, unknown>): Promise<Sub2ApiChannel> {
    return this.request<Sub2ApiChannel>('/admin/channels', { method: 'POST', body: input });
  }

  async updateChannel(id: number, input: Record<string, unknown>): Promise<Sub2ApiChannel> {
    return this.request<Sub2ApiChannel>(`/admin/channels/${id}`, { method: 'PUT', body: input });
  }

  async deleteChannel(id: number): Promise<void> {
    await this.request<unknown>(`/admin/channels/${id}`, { method: 'DELETE' });
  }

  // ---------- 账号（订阅账号） ----------

  async listAccounts(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiAccount>> {
    return this.request<Sub2ApiPage<Sub2ApiAccount>>('/admin/accounts', {
      query: this.normalizeListParams(params),
    });
  }

  async createAccount(input: Record<string, unknown>): Promise<Sub2ApiAccount> {
    return this.request<Sub2ApiAccount>('/admin/accounts', { method: 'POST', body: input });
  }

  async updateAccount(id: number, input: Record<string, unknown>): Promise<Sub2ApiAccount> {
    return this.request<Sub2ApiAccount>(`/admin/accounts/${id}`, { method: 'PUT', body: input });
  }

  async deleteAccount(id: number): Promise<void> {
    await this.request<unknown>(`/admin/accounts/${id}`, { method: 'DELETE' });
  }

  async testAccount(id: number): Promise<Sub2ApiAccountTestResult> {
    return this.request<Sub2ApiAccountTestResult>(`/admin/accounts/${id}/test`, { method: 'POST' });
  }

  // ---------- 订阅 ----------

  async listSubscriptions(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiSubscription>> {
    return this.request<Sub2ApiPage<Sub2ApiSubscription>>('/admin/subscriptions', {
      query: this.normalizeListParams(params),
    });
  }

  async revokeSubscription(id: number): Promise<void> {
    await this.request<unknown>(`/admin/subscriptions/${id}/revoke`, { method: 'POST' });
  }

  // ---------- 模型分组 / 路由 ----------

  async listGroups(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiGroup>> {
    return this.request<Sub2ApiPage<Sub2ApiGroup>>('/admin/groups', {
      query: this.normalizeListParams(params),
    });
  }

  async listAllGroups(): Promise<Sub2ApiGroup[]> {
    return this.request<Sub2ApiGroup[]>('/admin/groups/all', {
      query: { include_inactive: true },
    });
  }

  async createGroup(input: Record<string, unknown>): Promise<Sub2ApiGroup> {
    return this.request<Sub2ApiGroup>('/admin/groups', { method: 'POST', body: input });
  }

  async updateGroup(id: number, input: Record<string, unknown>): Promise<Sub2ApiGroup> {
    return this.request<Sub2ApiGroup>(`/admin/groups/${id}`, { method: 'PUT', body: input });
  }

  async deleteGroup(id: number): Promise<void> {
    await this.request<unknown>(`/admin/groups/${id}`, { method: 'DELETE' });
  }

  async listCompositeRoutes(groupId: number): Promise<Sub2ApiCompositeRoute[]> {
    return this.request<Sub2ApiCompositeRoute[]>(`/admin/groups/${groupId}/composite-routes`);
  }

  async createCompositeRoute(
    groupId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute> {
    return this.request<Sub2ApiCompositeRoute>(`/admin/groups/${groupId}/composite-routes`, {
      method: 'POST',
      body: input,
    });
  }

  async updateCompositeRoute(
    groupId: number,
    routeId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute> {
    return this.request<Sub2ApiCompositeRoute>(
      `/admin/groups/${groupId}/composite-routes/${routeId}`,
      { method: 'PUT', body: input },
    );
  }

  async deleteCompositeRoute(groupId: number, routeId: number): Promise<void> {
    await this.request<unknown>(`/admin/groups/${groupId}/composite-routes/${routeId}`, {
      method: 'DELETE',
    });
  }

  // ---------- API 凭据 ----------

  async listApiKeys(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiApiKey>> {
    return this.request<Sub2ApiPage<Sub2ApiApiKey>>('/keys', {
      query: this.normalizeListParams(params),
    });
  }

  async createApiKey(input: Record<string, unknown>): Promise<Sub2ApiApiKey> {
    return this.request<Sub2ApiApiKey>('/keys', { method: 'POST', body: input });
  }

  async updateApiKey(id: number, input: Record<string, unknown>): Promise<Sub2ApiApiKey> {
    return this.request<Sub2ApiApiKey>(`/keys/${id}`, { method: 'PUT', body: input });
  }

  async deleteApiKey(id: number): Promise<void> {
    await this.request<unknown>(`/keys/${id}`, { method: 'DELETE' });
  }

  // ---------- 请求日志 ----------

  async listUsage(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiUsageLog>> {
    return this.request<Sub2ApiPage<Sub2ApiUsageLog>>('/usage', {
      query: this.normalizeListParams(params),
    });
  }

  async getUsageStats(
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<Sub2ApiUsageStats> {
    return this.request<Sub2ApiUsageStats>('/usage/stats', {
      query: { ...params, timezone: 'Asia/Shanghai' },
    });
  }

  // ---------- 内部 ----------

  /** 计数：page_size=1 只取 total，避免拉取实体数据 */
  private async count(path: string): Promise<number> {
    const page = await this.request<Sub2ApiPage<unknown>>(path, {
      query: { page: 1, page_size: 1 },
    });
    return typeof page.total === 'number' ? page.total : 0;
  }

  /** 归一化分页参数：page/page_size 必带；timezone 固定为控制台时区 */
  private normalizeListParams(
    params: Sub2ApiListParams,
  ): Record<string, string | number | boolean> {
    const out: Record<string, string | number | boolean> = {
      page: params.page >= 1 ? Math.trunc(params.page) : 1,
      page_size:
        params.page_size >= 1 && params.page_size <= 100
          ? Math.trunc(params.page_size)
          : DEFAULT_PAGE_SIZE,
      timezone: 'Asia/Shanghai',
    };
    for (const key of [
      'search',
      'status',
      'platform',
      'model',
      'start_date',
      'end_date',
      'sort_by',
      'sort_order',
    ] as const) {
      const value = params[key];
      if (value !== undefined && value !== '') out[key] = value;
    }
    return out;
  }

  private async request<T>(
    apiPath: string,
    init: { method?: string; body?: Record<string, unknown>; query?: Record<string, unknown> } = {},
  ): Promise<T> {
    if (!isAllowedPath(apiPath)) {
      throw errInvalidPath();
    }
    const { baseUrl, apiToken, timeoutMs } = await this.settings.assertConfig();
    const url = buildUpstreamUrl(baseUrl, apiPath);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${apiToken}`,
      Accept: 'application/json',
    };
    let body: string | undefined;
    if (init.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.body);
    }
    const search = init.query
      ? `?${new URLSearchParams(serializeQuery(init.query)).toString()}`
      : '';

    let response: Response;
    try {
      response = await this.fetchImpl(`${url}${search}`, {
        method: init.method ?? 'GET',
        headers,
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
        throw errUpstreamTimeout();
      }
      const message = err instanceof Error ? err.message : '网络错误';
      throw errUpstreamUnreachable(message);
    }

    const text = await safeReadText(response);
    if (text.length > MAX_RESPONSE_BYTES) {
      throw errUpstreamTooLarge();
    }

    if (!response.ok) {
      throw mapUpstreamHttpError(response.status, parseErrorText(text));
    }

    const parsed = parseEnvelope(text);
    if (parsed === null) {
      throw errUpstreamBusiness('Sub2API 返回非 JSON 响应');
    }
    if (parsed.code !== 0) {
      throw errUpstreamBusiness(parsed.message);
    }
    return parsed.data as T;
  }
}

function serializeQuery(query: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

/** 读响应文本（错误体也可能非 JSON；吞掉读取异常，交给上层按状态码兜底） */
async function safeReadText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

/** 错误响应体：优先取上游 message 字段，脱敏后返回 */
function parseErrorText(text: string): string {
  if (!text) return '';
  try {
    const parsed = JSON.parse(text) as { message?: unknown; error?: { message?: unknown } };
    const message =
      typeof parsed.message === 'string'
        ? parsed.message
        : typeof parsed.error?.message === 'string'
          ? parsed.error.message
          : '';
    return sanitizeUpstreamMessage(message);
  } catch {
    return sanitizeUpstreamMessage(text.slice(0, 300));
  }
}

/** 成功响应信封解析；非 JSON 返回 null */
function parseEnvelope(text: string): Sub2ApiEnvelope<unknown> | null {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (typeof parsed.code === 'number' && 'data' in parsed) {
      return parsed as unknown as Sub2ApiEnvelope<unknown>;
    }
    // 极少数端点（/v1/models）返回裸 OpenAI 结构：包装为成功信封
    if (Array.isArray(parsed.data) || typeof parsed.data === 'object') {
      return { code: 0, message: 'OK', data: parsed };
    }
    return null;
  } catch {
    return null;
  }
}
