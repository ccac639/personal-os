/**
 * Provider 错误分类（将上游 HTTP/SDK 错误映射为 WorkerError）
 *
 * 采用 duck-typing 而非 import openai（保持本模块零运行时依赖，api 侧
 * 一致性测试可直接引用）：
 * - status === 429 → rate-limit（可重试，携带 retry-after）
 * - 4xx（401/403/404/422 等）→ config（密钥/模型/请求配置错误，不重试）
 * - 5xx → retryable（上游瞬时故障）
 * - APIConnectionError / APITimeoutError / AbortError → retryable
 * - 未知 → retryable（默认，attempts 上限兜底）
 */
import { WorkerError, errorMessage } from '../errors/worker-errors.js';

export interface ProviderErrorContext {
  provider: string;
  model?: string;
}

interface HttpErrorLike {
  status?: number;
  name?: string;
  message?: string;
  headers?: Record<string, string | string[] | undefined> | Headers;
}

function asErrorLike(err: unknown): HttpErrorLike | null {
  if (err && typeof err === 'object') return err as HttpErrorLike;
  return null;
}

/** 连接/超时类错误（OpenAI SDK 命名，网络层同样适用） */
function isConnectionLike(err: HttpErrorLike | null): boolean {
  if (!err) return false;
  return (
    err.name === 'APIConnectionError' ||
    err.name === 'APIConnectionTimeoutError' ||
    err.name === 'APITimeoutError' ||
    err.name === 'AbortError' ||
    err.name === 'TimeoutError'
  );
}

/** 读取 retry-after 头（秒 → ms）；支持 Headers 与普通对象两种形态 */
export function retryAfterMs(err: HttpErrorLike | null): number | undefined {
  const headers = err?.headers;
  if (!headers) return undefined;
  let header: string | string[] | undefined;
  if (typeof (headers as Headers).get === 'function') {
    header = (headers as Headers).get('retry-after') ?? undefined;
  } else {
    header = (headers as Record<string, string | string[] | undefined>)['retry-after'];
  }
  const value = Array.isArray(header) ? header[0] : header;
  if (value === undefined || value === null) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  return undefined;
}

/** 将任意 Provider 错误分类为 WorkerError（WorkerError 原样透传） */
export function classifyProviderError(err: unknown, context: ProviderErrorContext): WorkerError {
  if (err instanceof WorkerError) return err;
  const e = asErrorLike(err);

  if (e && typeof e.status === 'number') {
    if (e.status === 429) {
      return WorkerError.rateLimit(
        `${context.provider} 请求被限流（429）${context.model ? `：${context.model}` : ''}`,
        retryAfterMs(e),
        { cause: err },
      );
    }
    if (e.status >= 400 && e.status < 500) {
      return WorkerError.config(
        `${context.provider} 请求被拒绝（HTTP ${e.status}）：请检查 API Key / 模型配置`,
        { cause: err },
      );
    }
    if (e.status >= 500) {
      return WorkerError.retryable(`${context.provider} 服务端错误（HTTP ${e.status}）`, {
        cause: err,
      });
    }
  }

  if (isConnectionLike(e)) {
    return WorkerError.retryable(`${context.provider} 网络连接/超时错误`, { cause: err });
  }

  return WorkerError.retryable(`${context.provider} 请求失败：${errorMessage(err).slice(0, 500)}`, {
    cause: err,
  });
}
