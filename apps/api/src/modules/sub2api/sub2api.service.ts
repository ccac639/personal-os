/**
 * Sub2API 管理模块服务层：设置管理 + 上游代理编排。
 *
 * 职责边界：
 * - 校验 Base URL（协议 / 主机 / 路径），未配置抛 SUB2API_NOT_CONFIGURED；
 * - 概览聚合：各数据块独立拉取、独立降级（Promise.allSettled），
 *   单块失败不影响整页，前端对 null 块显示「不可用」而不是伪造数据；
 * - 敏感字段掩码：API Key 列表 / 详情一律掩码，仅创建响应返回明文一次；
 * - 所有上游调用走 Sub2ApiAdapter（真实 HTTP 或测试替身）。
 */
import { Inject, Injectable } from '@nestjs/common';

import type { Sub2ApiAdapter } from './client/adapter.js';
import { SUB2API_ADAPTER } from './client/adapter.js';
import { errInvalidBaseUrl, errNotConfigured } from './errors/sub2api.errors.js';
import { Sub2ApiSettingsService } from './sub2api.settings.service.js';
import { validateBaseUrl } from './client/url-validation.js';
import type {
  Sub2ApiApiKey,
  Sub2ApiDashboardStats,
  Sub2ApiOpsErrorLog,
  Sub2ApiPage,
  Sub2ApiRealtimeMetrics,
  Sub2ApiTrendResponse,
  Sub2ApiVersion,
} from './types/sub2api.contract.js';

/** 列表查询参数（与上游字段一一对应） */
export interface Sub2ApiQuery {
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
    version: Sub2ApiVersion | null;
    stats: Sub2ApiDashboardStats | null;
    realtime: Sub2ApiRealtimeMetrics | null;
    trend: Sub2ApiTrendResponse | null;
    recentErrors: Sub2ApiPage<Sub2ApiOpsErrorLog> | null;
    models: string[] | null;
    counts: { accounts: number | null; groups: number | null; channels: number | null };
  };
}

export interface Sub2ApiTestResult {
  ok: boolean;
  version: string;
  latencyMs: number;
  checkedAt: string;
}

@Injectable()
export class Sub2ApiService {
  constructor(
    private readonly settings: Sub2ApiSettingsService,
    @Inject(SUB2API_ADAPTER) private readonly adapter: Sub2ApiAdapter,
  ) {}

  // ---------- 设置 ----------

  async getSettings() {
    return this.settings.getSnapshot();
  }

  async saveSettings(input: {
    baseUrl?: string;
    apiToken?: string;
    timeoutMs?: number;
    autoRefresh?: boolean;
    refreshIntervalSec?: number;
  }): Promise<ReturnType<Sub2ApiSettingsService['getSnapshot']>> {
    if (input.baseUrl !== undefined) {
      const result = validateBaseUrl(input.baseUrl);
      if (!result.ok) throw errInvalidBaseUrl(result.reason);
    }
    await this.settings.save(input);
    return this.settings.getSnapshot();
  }

  async clearSettings(): Promise<void> {
    await this.settings.clearAll();
  }

  /** 连接测试：调用上游 /admin/system/version，成功后缓存版本 */
  async testConnection(): Promise<Sub2ApiTestResult> {
    if (!(await this.settings.isConfigured())) throw errNotConfigured();
    const startedAt = Date.now();
    const version = await this.adapter.getVersion();
    const latencyMs = Date.now() - startedAt;
    await this.settings.cacheUpstreamVersion(version.version);
    return { ok: true, version: version.version, latencyMs, checkedAt: new Date().toISOString() };
  }

  // ---------- 概览 ----------

  async getOverview(): Promise<Sub2ApiOverview> {
    if (!(await this.settings.isConfigured())) throw errNotConfigured();

    const [
      version,
      stats,
      realtime,
      trend,
      recentErrors,
      models,
      accountCount,
      groupCount,
      channelCount,
    ] = await Promise.allSettled([
      this.adapter.getVersion(),
      this.adapter.getDashboardStats(),
      this.adapter.getRealtimeMetrics(),
      this.adapter.getUsageTrend({ granularity: 'day', start_date: daysAgo(7), end_date: today() }),
      this.adapter.getRecentErrors({
        page: 1,
        page_size: 5,
        sort_by: 'created_at',
        sort_order: 'desc',
      }),
      this.adapter.listModels(),
      this.adapter.countAccounts(),
      this.adapter.countGroups(),
      this.adapter.countChannels(),
    ]);

    const snapshot = await this.settings.getSnapshot();
    return {
      configured: true,
      snapshot: {
        baseUrlMasked: snapshot.baseUrlMasked,
        timeoutMs: snapshot.timeoutMs,
        autoRefresh: snapshot.autoRefresh,
        refreshIntervalSec: snapshot.refreshIntervalSec,
        upstreamVersion: snapshot.upstreamVersion,
      },
      blocks: {
        version: settled(version),
        stats: settled(stats),
        realtime: settled(realtime),
        trend: settled(trend),
        recentErrors: settled(recentErrors),
        models: settled(models),
        counts: {
          accounts: settled(accountCount) ?? null,
          groups: settled(groupCount) ?? null,
          channels: settled(channelCount) ?? null,
        },
      },
    };
  }

  // ---------- 渠道 ----------

  async listChannels(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.listChannels(this.toListParams(query));
  }

  async createChannel(input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.createChannel(input);
  }

  async updateChannel(id: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.updateChannel(id, input);
  }

  async deleteChannel(id: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.deleteChannel(id);
  }

  // ---------- 账号（订阅账号） ----------

  async listAccounts(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.listAccounts(this.toListParams(query));
  }

  async createAccount(input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.createAccount(input);
  }

  async updateAccount(id: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.updateAccount(id, input);
  }

  async deleteAccount(id: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.deleteAccount(id);
  }

  async testAccount(id: number) {
    await this.assertConfigured();
    return this.adapter.testAccount(id);
  }

  // ---------- 订阅 ----------

  async listSubscriptions(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.listSubscriptions(this.toListParams(query));
  }

  async revokeSubscription(id: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.revokeSubscription(id);
  }

  // ---------- 模型分组 / 路由 ----------

  async listGroups(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.listGroups(this.toListParams(query));
  }

  async listAllGroups() {
    await this.assertConfigured();
    return this.adapter.listAllGroups();
  }

  async createGroup(input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.createGroup(input);
  }

  async updateGroup(id: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.updateGroup(id, input);
  }

  async deleteGroup(id: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.deleteGroup(id);
  }

  async listCompositeRoutes(groupId: number) {
    await this.assertConfigured();
    return this.adapter.listCompositeRoutes(groupId);
  }

  async createCompositeRoute(groupId: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.createCompositeRoute(groupId, input);
  }

  async updateCompositeRoute(groupId: number, routeId: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.updateCompositeRoute(groupId, routeId, input);
  }

  async deleteCompositeRoute(groupId: number, routeId: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.deleteCompositeRoute(groupId, routeId);
  }

  // ---------- API 凭据 ----------

  async listApiKeys(query: Sub2ApiQuery) {
    await this.assertConfigured();
    const page = await this.adapter.listApiKeys(this.toListParams(query));
    return { ...page, items: page.items.map(maskApiKeyItem) };
  }

  /** 创建：明文 key 仅此一次出现在响应中（前端展示后不得持久化） */
  async createApiKey(input: Record<string, unknown>) {
    await this.assertConfigured();
    return this.adapter.createApiKey(input);
  }

  async updateApiKey(id: number, input: Record<string, unknown>) {
    await this.assertConfigured();
    return maskApiKeyItem(await this.adapter.updateApiKey(id, input));
  }

  async deleteApiKey(id: number): Promise<void> {
    await this.assertConfigured();
    await this.adapter.deleteApiKey(id);
  }

  // ---------- 请求日志 ----------

  async listUsage(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.listUsage(this.toListParams(query));
  }

  async getUsageStats(query: Sub2ApiQuery) {
    await this.assertConfigured();
    return this.adapter.getUsageStats({
      start_date: query.startDate,
      end_date: query.endDate,
      model: query.model,
    });
  }

  // ---------- 内部 ----------

  /** 统一配置边界：未配置 Base URL / 凭据时返回稳定错误码 SUB2API_NOT_CONFIGURED */
  private async assertConfigured(): Promise<void> {
    if (!(await this.settings.isConfigured())) throw errNotConfigured();
  }

  private toListParams(query: Sub2ApiQuery): Parameters<Sub2ApiAdapter['listChannels']>[0] {
    const page =
      Number.isSafeInteger(query.page) && (query.page ?? 0) >= 1
        ? Math.trunc(query.page as number)
        : 1;
    const pageSize =
      Number.isSafeInteger(query.pageSize) &&
      (query.pageSize ?? 0) >= 1 &&
      (query.pageSize ?? 0) <= 100
        ? Math.trunc(query.pageSize as number)
        : 20;
    const out: Parameters<Sub2ApiAdapter['listChannels']>[0] = { page, page_size: pageSize };
    if (query.search) out.search = query.search;
    if (query.status) out.status = query.status;
    if (query.platform) out.platform = query.platform;
    if (query.model) out.model = query.model;
    if (query.sortBy) out.sort_by = query.sortBy;
    if (query.sortOrder) out.sort_order = query.sortOrder;
    if (query.startDate) out.start_date = query.startDate;
    if (query.endDate) out.end_date = query.endDate;
    return out;
  }
}

function settled<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function daysAgo(n: number): string {
  const d = new Date(Date.now() - n * 24 * 60 * 60 * 1000);
  return toDateStr(d);
}

function today(): string {
  return toDateStr(new Date());
}

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** key 掩码：保留前缀与末 4 位（sk-****abcd），避免完整密钥出现在列表/日志 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  const head = key.slice(0, 5);
  const tail = key.slice(-4);
  return `${head}****${tail}`;
}

function maskApiKeyItem<T extends Sub2ApiApiKey>(item: T): T {
  return { ...item, key: maskApiKey(item.key) };
}
