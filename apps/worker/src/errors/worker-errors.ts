/**
 * Worker 统一错误类型
 *
 * 分类语义（与队列重试策略绑定）：
 * - retryable：基础设施/上游瞬时错误 → 抛给 BullMQ 重试（指数退避 / retry-after）
 * - non-retryable：输入损坏（缺字段/非法 payload/非法 history）→ 抛 UnrecoverableError，
 *   BullMQ 标记 failed 且不再重试（保留在 failed 集合可观察，绝不记为 completed）
 * - rate-limit：上游限流 → 可重试（携带 retryAfterMs，被 backoffStrategy 消费）
 * - config：配置错误（缺 API Key / 密钥无效 / 模型不存在）→ 抛 UnrecoverableError，
 *   只执行一次，等用户修复配置
 *
 * 未知错误默认按 retryable 处理（避免静默丢失任务），由 attempts 上限兜底。
 */
import { UnrecoverableError } from 'bullmq';

export type WorkerErrorKind = 'retryable' | 'non-retryable' | 'rate-limit' | 'config';

export interface WorkerErrorOptions {
  cause?: unknown;
  /** 限流建议等待时间 ms（仅 rate-limit 使用，被 backoffStrategy 消费） */
  retryAfterMs?: number;
}

export class WorkerError extends Error {
  readonly kind: WorkerErrorKind;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  override readonly cause?: unknown;

  constructor(kind: WorkerErrorKind, message: string, options: WorkerErrorOptions = {}) {
    super(message);
    this.name = 'WorkerError';
    this.kind = kind;
    this.retryable = kind === 'retryable' || kind === 'rate-limit';
    this.retryAfterMs = options.retryAfterMs;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  static retryable(message: string, options: WorkerErrorOptions = {}): WorkerError {
    return new WorkerError('retryable', message, options);
  }

  static nonRetryable(message: string, options: WorkerErrorOptions = {}): WorkerError {
    return new WorkerError('non-retryable', message, options);
  }

  static rateLimit(
    message: string,
    retryAfterMs?: number,
    options: WorkerErrorOptions = {},
  ): WorkerError {
    return new WorkerError('rate-limit', message, { ...options, retryAfterMs });
  }

  static config(message: string, options: WorkerErrorOptions = {}): WorkerError {
    return new WorkerError('config', message, options);
  }

  /** 统一包装：未知错误按 fallbackKind 分类（默认 retryable） */
  static from(err: unknown, fallbackKind: WorkerErrorKind = 'retryable'): WorkerError {
    if (err instanceof WorkerError) return err;
    const message = errorMessage(err);
    return new WorkerError(fallbackKind, message, { cause: err });
  }
}

/** 是否应触发 BullMQ 重试（非 WorkerError 的未知错误按可重试处理） */
export function isRetryableError(err: unknown): boolean {
  if (err instanceof WorkerError) return err.retryable;
  return true;
}

/**
 * 统一错误 → BullMQ 抛出的映射：
 * - retryable / rate-limit / 未知 → 原样抛出（BullMQ 重试）
 * - non-retryable / config → 包装为 UnrecoverableError（job 进入 failed 集合，
 *   只执行一次，不重试、不记为 completed）
 */
export function toBullMqError(err: unknown): Error {
  if (err instanceof WorkerError && !err.retryable) {
    return new UnrecoverableError(err.message);
  }
  return err instanceof Error ? err : new Error(errorMessage(err));
}

/**
 * 计算重试延迟（供 BullMQ settings.backoffStrategy 使用，可测试）：
 * - err 携带 retryAfterMs（429 retry-after 头）→ 使用该值并 clamp 到 [min, max]
 * - 无 retry-after → 指数退避：backoffMs * 2^(attemptsMade-1)，同样受 max 封顶
 */
export function retryDelayMs(
  attemptsMade: number,
  err: unknown,
  opts: { backoffMs: number; minMs?: number; maxMs?: number },
): number {
  const minMs = opts.minMs ?? 1_000;
  const maxMs = opts.maxMs ?? 60_000;
  const after = err instanceof WorkerError ? err.retryAfterMs : undefined;
  if (after !== undefined && Number.isFinite(after) && after > 0) {
    return Math.min(Math.max(Math.round(after), minMs), maxMs);
  }
  const exponential = opts.backoffMs * 2 ** Math.max(0, attemptsMade - 1);
  return Math.min(Math.max(Math.round(exponential), minMs), maxMs);
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}
