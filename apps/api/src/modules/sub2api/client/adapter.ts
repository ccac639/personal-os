/**
 * Sub2API 管理端适配器接口（Web → Personal OS API → Sub2API 的最后一跳）。
 *
 * - 所有方法都只接受「业务操作参数」，不接受任意 URL / 任意路径：
 *   路径由实现方内部固定，天然禁止代理任意 URL（SSRF 防护第一道闸）；
 * - 服务层与测试只依赖本接口，真实实现与测试替身可互换；
 * - 契约字段名与官方一致（snake_case），见 types/sub2api.contract.ts。
 */
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
  Sub2ApiPageParams,
  Sub2ApiRealtimeMetrics,
  Sub2ApiSubscription,
  Sub2ApiTrendResponse,
  Sub2ApiUsageLog,
  Sub2ApiUsageStats,
  Sub2ApiVersion,
} from '../types/sub2api.contract.js';

/** 列表查询参数（page/page_size 必带；其余字段透传上游） */
export interface Sub2ApiListParams extends Sub2ApiPageParams {
  search?: string;
  status?: string;
  platform?: string;
  model?: string;
  start_date?: string;
  end_date?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface Sub2ApiOverviewBlocks {
  version: Sub2ApiVersion | null;
  stats: Sub2ApiDashboardStats | null;
  realtime: Sub2ApiRealtimeMetrics | null;
  trend: Sub2ApiTrendResponse | null;
  recentErrors: Sub2ApiPage<Sub2ApiOpsErrorLog> | null;
  models: string[] | null;
  counts: {
    accounts: number | null;
    groups: number | null;
    channels: number | null;
  };
}

export const SUB2API_ADAPTER = Symbol('SUB2API_ADAPTER');

export interface Sub2ApiAdapter {
  // ---------- 概览 ----------
  getVersion(): Promise<Sub2ApiVersion>;
  getDashboardStats(): Promise<Sub2ApiDashboardStats>;
  getRealtimeMetrics(): Promise<Sub2ApiRealtimeMetrics>;
  getUsageTrend(params: {
    start_date?: string;
    end_date?: string;
    granularity?: 'day' | 'hour';
  }): Promise<Sub2ApiTrendResponse>;
  getRecentErrors(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiOpsErrorLog>>;
  /** OpenAI 兼容 /v1/models → 对外模型 id 列表 */
  listModels(): Promise<string[]>;
  /** 计数用：page_size=1 取 total */
  countAccounts(): Promise<number>;
  countGroups(): Promise<number>;
  countChannels(): Promise<number>;

  // ---------- 渠道 ----------
  listChannels(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiChannel>>;
  createChannel(input: Record<string, unknown>): Promise<Sub2ApiChannel>;
  updateChannel(id: number, input: Record<string, unknown>): Promise<Sub2ApiChannel>;
  deleteChannel(id: number): Promise<void>;

  // ---------- 账号（订阅账号） ----------
  listAccounts(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiAccount>>;
  createAccount(input: Record<string, unknown>): Promise<Sub2ApiAccount>;
  updateAccount(id: number, input: Record<string, unknown>): Promise<Sub2ApiAccount>;
  deleteAccount(id: number): Promise<void>;
  testAccount(id: number): Promise<Sub2ApiAccountTestResult>;

  // ---------- 订阅 ----------
  listSubscriptions(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiSubscription>>;
  revokeSubscription(id: number): Promise<void>;

  // ---------- 模型分组 / 路由 ----------
  listGroups(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiGroup>>;
  listAllGroups(): Promise<Sub2ApiGroup[]>;
  createGroup(input: Record<string, unknown>): Promise<Sub2ApiGroup>;
  updateGroup(id: number, input: Record<string, unknown>): Promise<Sub2ApiGroup>;
  deleteGroup(id: number): Promise<void>;
  listCompositeRoutes(groupId: number): Promise<Sub2ApiCompositeRoute[]>;
  createCompositeRoute(
    groupId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute>;
  updateCompositeRoute(
    groupId: number,
    routeId: number,
    input: Record<string, unknown>,
  ): Promise<Sub2ApiCompositeRoute>;
  deleteCompositeRoute(groupId: number, routeId: number): Promise<void>;

  // ---------- API 凭据 ----------
  listApiKeys(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiApiKey>>;
  /** 创建成功返回含明文 key 的凭据（仅此一次；后续读取均掩码） */
  createApiKey(input: Record<string, unknown>): Promise<Sub2ApiApiKey>;
  updateApiKey(id: number, input: Record<string, unknown>): Promise<Sub2ApiApiKey>;
  deleteApiKey(id: number): Promise<void>;

  // ---------- 请求日志 ----------
  listUsage(params: Sub2ApiListParams): Promise<Sub2ApiPage<Sub2ApiUsageLog>>;
  getUsageStats(
    params: Record<string, string | number | boolean | undefined>,
  ): Promise<Sub2ApiUsageStats>;
}
