/**
 * Agents 管理 —— 真实后端 API 客户端
 *
 * 后端统一响应包装（apps/api/src/common/interceptors/transform.interceptor.ts）：
 *   成功：{ requestId, timestamp, path, statusCode, code: 'OK', message, data }
 *   失败：{ requestId, timestamp, path, statusCode, code, message, fields? }（HTTP 4xx/5xx）
 *
 * 本客户端负责解包 data，并把失败统一转成携带 requestId 的 {@link AgentApiError}，
 * 供上层生成用户可读提示并保留排障线索。
 *
 * 契约来源：apps/api/src/modules/agents/（controller + dto + service）。
 * 类型统一从 @personal-os/types 导入（packages/types/src/agent.ts），
 * 本文件仅保留运行时常量与 API 调用方法。
 */
import type { FetchOptions } from 'ofetch';

import type {
  Agent,
  AgentListQuery,
  AgentListResult,
  AgentProvider,
  CreateAgentPayload,
  StartAgentPayload,
  StartAgentResult,
  UpdateAgentPayload,
} from '@personal-os/types';

import { apiFetch } from './index';

/** 模型提供方（与共享类型 AGENT_PROVIDERS 一致，含 siliconflow） */
export const AGENT_PROVIDERS: readonly AgentProvider[] = [
  'openai',
  'anthropic',
  'google',
  'openrouter',
  'siliconflow',
] as const;

/* ---------- 兼容别名（共享类型已收敛，这里不再重复声明字段） ---------- */
export type AgentProviderName = AgentProvider;
export type AgentRecord = Agent;

/* ---------- 共享类型 re-export（业务层经 services 获取契约类型） ---------- */
export type {
  Agent,
  AgentKind,
  AgentListQuery,
  AgentListResult,
  AgentProvider,
  CreateAgentPayload,
  StartAgentPayload,
  StartAgentResult,
  UpdateAgentPayload,
} from '@personal-os/types';

/** 统一成功响应包装 */
export interface ApiEnvelope<T> {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  data: T;
}

/** 统一错误响应体（AllExceptionsFilter 输出） */
interface ApiErrorBody {
  requestId?: string;
  timestamp?: string;
  path?: string;
  statusCode?: number;
  code?: string;
  message?: string;
  fields?: unknown[];
}

/** API 调用失败：携带服务端 requestId / code / statusCode 供排障 */
export class AgentApiError extends Error {
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

type ApiRequestOptions = FetchOptions<'json'>;

/** 发起请求并解包统一响应；失败统一转 AgentApiError */
async function request<T>(path: string, options?: ApiRequestOptions): Promise<T> {
  let envelope: ApiEnvelope<T>;
  try {
    envelope = await apiFetch<ApiEnvelope<T>>(path, options);
  } catch (err) {
    throw normalizeFetchError(err);
  }
  return envelope.data;
}

/** 把 ofetch 失败（含错误响应体 / 网络层失败）归一为 AgentApiError */
function normalizeFetchError(err: unknown): AgentApiError {
  const raw = err as { data?: unknown; status?: number; cause?: unknown };
  const body = raw.data as ApiErrorBody | undefined;
  if (body && typeof body === 'object' && body !== null) {
    const status = body.statusCode ?? raw.status;
    return new AgentApiError(
      typeof body.message === 'string' && body.message.length > 0
        ? body.message
        : `请求失败（HTTP ${status ?? '未知'}）`,
      { statusCode: status, code: body.code, requestId: body.requestId },
    );
  }
  // 网络层失败（连接拒绝 / 超时等）：无响应体
  void raw.cause;
  return new AgentApiError('无法连接服务，请确认后端已启动后重试', { statusCode: raw.status });
}

/** 过滤 undefined 查询参数，避免把空值发给后端 */
function toQuery(query: AgentListQuery): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (query.kind !== undefined) out.kind = query.kind;
  if (query.includeHidden !== undefined) out.includeHidden = query.includeHidden;
  if (query.q !== undefined && query.q.trim() !== '') out.q = query.q.trim();
  if (query.page !== undefined) out.page = query.page;
  if (query.pageSize !== undefined) out.pageSize = query.pageSize;
  return out;
}

export const agentsApi = {
  /** 智能体列表（内置模板 + 个人变体，服务端分页 / 关键字模糊匹配） */
  list(query: AgentListQuery = {}): Promise<AgentListResult> {
    return request<AgentListResult>('/agents', { query: toQuery(query) });
  },

  /** 智能体详情 */
  get(id: string): Promise<Agent> {
    return request<Agent>(`/agents/${encodeURIComponent(id)}`);
  },

  /** 创建个人智能体变体 */
  create(payload: CreateAgentPayload): Promise<Agent> {
    return request<Agent>('/agents', { method: 'POST', body: payload });
  },

  /** 更新智能体（收藏 / 隐藏 / 启用 / 配置） */
  update(id: string, payload: UpdateAgentPayload): Promise<Agent> {
    return request<Agent>(`/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body: payload });
  },

  /** 删除个人智能体（内置模板后端会返回 400） */
  remove(id: string): Promise<void> {
    return request<void>(`/agents/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  /** 启动智能体：创建 Chat 会话并记录使用（usageCount / lastUsedAt 由服务端更新） */
  start(id: string, payload?: StartAgentPayload): Promise<StartAgentResult> {
    return request<StartAgentResult>(`/agents/${encodeURIComponent(id)}/start`, {
      method: 'POST',
      body: payload ?? {},
    });
  },
};
