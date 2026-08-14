/**
 * Chat 功能域 —— 后端 AI 对话客户端
 *
 * 契约来源（apps/api/src，非猜测字段）：
 * - 统一响应包装（common/interceptors/transform.interceptor.ts）：
 *   成功：{ requestId, timestamp, path, statusCode, code: 'OK', message: 'OK', data }
 *   错误：{ requestId, timestamp, path, statusCode, code, message, fields? }（HTTP 非 2xx，
 *   message 已经后端脱敏，永不包含密钥/堆栈/环境变量）
 * - 对话端点 POST /api/ai/chat（modules/ai/dto/ai.dto.ts）：
 *   请求 AiChatDto：{ messages: [{ role: 'system'|'user'|'assistant', content }], model?, temperature?, maxTokens? }
 *   响应 AiChatResponseDto：{ content, model }
 *
 * 安全约定：
 * - 前端永不持有、永不发送 API Key（Key 仅存后端 Redis，见 ai-settings.service）
 * - 错误提示只透传后端已脱敏的 message；不落浏览器日志、不入 localStorage
 * - 请求体只包含对话文本与模型参数
 */
import { apiFetch } from '@/services';

/** 与后端 AiChatDto.ChatMessageDto 对齐的对话轮次 */
export interface ChatApiTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 与后端 AiChatDto 对齐的对话补全请求 */
export interface ChatCompletionParams {
  messages: ChatApiTurn[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

/** 与后端 AiChatResponseDto 对齐的对话补全结果 */
export interface ChatCompletionResult {
  content: string;
  model: string;
}

/** 后端统一成功响应包装（transform.interceptor.ts） */
export interface ChatApiEnvelope<T> {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  data: T;
}

/** 后端统一错误体（all-exceptions.filter.ts） */
export interface ChatApiErrorBody {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  fields?: Array<{ field: string; errors: string[] }>;
}

export type ChatApiErrorKind =
  | 'aborted' // 用户主动取消（AbortSignal）
  | 'timeout' // 请求超时
  | 'http' // 后端返回非 2xx（含未配置 Key / 提供方错误等业务错误）
  | 'network' // 网络层失败（后端不可达）
  | 'invalid' // 响应结构非法（缺少/类型错误的字段）
  | 'empty'; // 模型返回空回复

/** 归一化后的聊天 API 错误（UI / store 只依赖 kind 与 message） */
export class ChatApiError extends Error {
  override readonly name = 'ChatApiError';
  readonly kind: ChatApiErrorKind;
  /** HTTP 状态码（kind === 'http' 时） */
  readonly status?: number;
  /** 后端业务错误码（如 AI_KEY_NOT_CONFIGURED） */
  readonly code?: string;
  override readonly cause?: unknown;

  constructor(
    kind: ChatApiErrorKind,
    message: string,
    options: { status?: number; code?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.kind = kind;
    this.status = options.status;
    this.code = options.code;
    this.cause = options.cause;
  }
}

/** 是否为「用户主动取消」（区别于失败：取消静默收尾，不标记错误） */
export function isChatAbortError(err: unknown): boolean {
  return err instanceof ChatApiError && err.kind === 'aborted';
}

/** 底层 HTTP 客户端最小接口（测试注入 fake，不触真实网络） */
export interface ChatRawResponse<T> {
  data: T;
  response: { ok: boolean; status: number };
}

export interface ChatRawRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export interface ChatRawClient {
  raw<T = unknown>(url: string, options?: ChatRawRequestOptions): Promise<ChatRawResponse<T>>;
}

/** ofetch 单例适配（VITE_API_URL ?? '/api'，vite dev 代理到后端 8081） */
function ofetchRawClient(): ChatRawClient {
  return {
    raw: async (url, options) => {
      // ofetch 1.5.1：FetchResponse extends Response（ok/status 在响应体上），
      // 解析后的数据在 _data（区别于 ofetch 2.x 的 data）
      const res = await apiFetch.raw(url, options as never);
      const data = (res as unknown as { _data?: unknown })._data;
      return {
        data: data as never,
        response: { ok: res.ok, status: res.status },
      };
    },
  };
}

/** 对话补全客户端接口（ChatReplyService 的传输层抽象） */
export interface ChatApiClient {
  complete(
    params: ChatCompletionParams,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<ChatCompletionResult>;
}

export interface HttpChatApiClientOptions {
  /** 单次请求超时（毫秒，默认 30_000；0 表示不超时） */
  timeoutMs?: number;
  /** 底层 HTTP 客户端（默认 ofetch 单例；测试注入 fake） */
  raw?: ChatRawClient;
}

/**
 * 真实后端实现：POST /api/ai/chat，支持 AbortSignal、超时与错误归一化。
 * 超时/取消统一走 AbortController；取消由调用方 signal 触发，超时由内部计时触发。
 */
export class HttpChatApiClient implements ChatApiClient {
  private readonly raw: ChatRawClient;
  private readonly timeoutMs: number;

  constructor(options: HttpChatApiClientOptions = {}) {
    this.raw = options.raw ?? ofetchRawClient();
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  async complete(
    params: ChatCompletionParams,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<ChatCompletionResult> {
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    const controller = new AbortController();
    let timedOut = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const onOuterAbort = (): void => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    if (timeoutMs > 0 && !controller.signal.aborted) {
      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
    }

    try {
      const res = await this.raw.raw<unknown>('/ai/chat', {
        method: 'POST',
        body: {
          messages: params.messages,
          ...(params.model ? { model: params.model } : {}),
          ...(params.temperature !== undefined ? { temperature: params.temperature } : {}),
          ...(params.maxTokens !== undefined ? { maxTokens: params.maxTokens } : {}),
        },
        signal: controller.signal,
      });

      if (!res.response.ok) throw this.toHttpError(res);
      return this.toResult(res.data);
    } catch (err) {
      if (isAbortSignalError(err)) {
        if (timedOut) {
          throw new ChatApiError('timeout', `请求超时（超过 ${timeoutMs}ms），请重试`, {
            cause: err,
          });
        }
        throw new ChatApiError('aborted', '请求已取消', { cause: err });
      }
      if (err instanceof ChatApiError) throw err;
      throw new ChatApiError('network', '无法连接后端服务，请确认服务已启动', { cause: err });
    } finally {
      if (timer !== null) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onOuterAbort);
    }
  }

  private toHttpError(res: ChatRawResponse<unknown>): ChatApiError {
    const body = res.data as Partial<ChatApiErrorBody> | undefined;
    const status = res.response.status;
    const code = typeof body?.code === 'string' ? body.code : undefined;
    const message =
      typeof body?.message === 'string' && body.message.trim() && body.message !== 'OK'
        ? body.message
        : `服务请求失败（HTTP ${status}）`;
    return new ChatApiError('http', message, { status, code });
  }

  private toResult(data: unknown): ChatCompletionResult {
    // 优先解包统一响应包装；兼容直接返回结果体（防御后端未包装的部署形态）
    const unwrapped = isChatApiEnvelope(data) ? data.data : data;
    if (!unwrapped || typeof unwrapped !== 'object') {
      throw new ChatApiError('invalid', '服务返回了无法识别的响应');
    }
    const content = (unwrapped as { content?: unknown }).content;
    if (typeof content !== 'string') {
      throw new ChatApiError('invalid', '服务返回缺少回复内容');
    }
    if (content.trim() === '') {
      throw new ChatApiError('empty', '模型返回了空回复，请重试');
    }
    const model =
      typeof (unwrapped as { model?: unknown }).model === 'string'
        ? (unwrapped as { model: string }).model
        : '';
    return { content, model };
  }
}

function isChatApiEnvelope(value: unknown): value is ChatApiEnvelope<unknown> {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && 'data' in v;
}

function isAbortSignalError(err: unknown): boolean {
  // DOMException（AbortError）在部分运行时（jsdom/Node）不继承 Error，按 name 检测更稳
  if ((err as { name?: unknown } | undefined)?.name === 'AbortError') return true;
  // ofetch 包装取消错误时把原始 AbortError 放在 cause
  const cause = (err as { cause?: unknown } | undefined)?.cause;
  return (cause as { name?: unknown } | undefined)?.name === 'AbortError';
}
