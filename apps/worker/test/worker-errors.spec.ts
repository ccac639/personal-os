/**
 * Worker 错误分类测试：retryable / non-retryable / rate-limit / config
 *
 * 使用 OpenAI SDK 真实错误类 + 模拟 HTTP 错误对象（duck-typing 路径）。
 */
import { describe, expect, it } from 'vitest';
import OpenAI from 'openai';

import { WorkerError, isRetryableError } from '../src/errors/worker-errors.js';
import { classifyProviderError, retryAfterMs } from '../src/providers/errors.js';

function apiError(status: number, headers: Record<string, string> = {}): OpenAI.APIError {
  // openai v7 的 APIError 构造器内部会调用 headers?.get()，必须传 Headers 实例
  return new OpenAI.APIError(
    status,
    { message: `http ${status}` },
    `http ${status}`,
    new Headers(headers),
  );
}

describe('WorkerError', () => {
  it('分类与可重试性', () => {
    expect(WorkerError.retryable('x').retryable).toBe(true);
    expect(WorkerError.nonRetryable('x').retryable).toBe(false);
    expect(WorkerError.rateLimit('x').retryable).toBe(true);
    expect(WorkerError.config('x').retryable).toBe(false);
    expect(WorkerError.retryable('x').kind).toBe('retryable');
    expect(WorkerError.rateLimit('x').kind).toBe('rate-limit');
    expect(WorkerError.config('x').kind).toBe('config');
    expect(WorkerError.nonRetryable('x').kind).toBe('non-retryable');
  });

  it('isRetryableError：WorkerError 按分类，未知错误默认可重试', () => {
    expect(isRetryableError(WorkerError.retryable('r'))).toBe(true);
    expect(isRetryableError(WorkerError.rateLimit('r'))).toBe(true);
    expect(isRetryableError(WorkerError.config('c'))).toBe(false);
    expect(isRetryableError(WorkerError.nonRetryable('n'))).toBe(false);
    expect(isRetryableError(new Error('unknown'))).toBe(true);
    expect(isRetryableError('string error')).toBe(true);
  });

  it('cause 保留与错误消息提取', () => {
    const cause = new Error('root');
    const wrapped = WorkerError.from(cause);
    expect(wrapped.cause).toBe(cause);
    expect(wrapped.message).toBe('root');
  });
});

describe('classifyProviderError', () => {
  const ctx = { provider: 'siliconflow', model: 'm1' };

  it('429 → rate-limit（可重试），retry-after 头转 ms', () => {
    const err = classifyProviderError(
      new OpenAI.RateLimitError(
        429,
        { message: 'slow down' },
        'slow down',
        new Headers({ 'retry-after': '5' }),
      ),
      ctx,
    );
    expect(err.kind).toBe('rate-limit');
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(5_000);

    const duck = classifyProviderError(apiError(429, { 'retry-after': '7' }), ctx);
    expect(duck.kind).toBe('rate-limit');
    expect(duck.retryable).toBe(true);
    expect(duck.retryAfterMs).toBe(7_000);
  });

  it('4xx（401/403/404/422）→ config（不可重试）', () => {
    for (const status of [401, 403, 404, 422]) {
      const err = classifyProviderError(apiError(status), ctx);
      expect(err.kind, `status=${status}`).toBe('config');
      expect(err.retryable).toBe(false);
    }
  });

  it('5xx（500/502/503/504）→ retryable', () => {
    for (const status of [500, 502, 503, 504]) {
      const err = classifyProviderError(apiError(status), ctx);
      expect(err.kind, `status=${status}`).toBe('retryable');
      expect(err.retryable).toBe(true);
    }
  });

  it('网络/超时（APIConnectionTimeoutError / 连接错误）→ retryable', () => {
    // openai v7 已移除 APITimeoutError，超时类错误为 APIConnectionTimeoutError
    const timeout = classifyProviderError(
      new OpenAI.APIConnectionTimeoutError({ message: 'timed out' }),
      ctx,
    );
    expect(timeout.kind).toBe('retryable');

    const connection = classifyProviderError(
      new OpenAI.APIConnectionError({ message: 'connect ECONNREFUSED' }),
      ctx,
    );
    expect(connection.kind).toBe('retryable');
  });

  it('未知错误 → 默认 retryable（attempts 上限兜底）', () => {
    const err = classifyProviderError(new Error('weird failure'), ctx);
    expect(err.kind).toBe('retryable');
    expect(err.message).toContain('weird failure');
  });

  it('WorkerError 原样透传', () => {
    const original = WorkerError.config('already classified');
    expect(classifyProviderError(original, ctx)).toBe(original);
  });
});

describe('retryAfterMs', () => {
  it('读取 retry-after（秒→ms）；缺失/非法返回 undefined', () => {
    expect(retryAfterMs({ status: 429, headers: { 'retry-after': '3' } })).toBe(3_000);
    expect(retryAfterMs({ status: 429, headers: { 'retry-after': 'abc' } })).toBeUndefined();
    expect(retryAfterMs({ status: 429 })).toBeUndefined();
    expect(retryAfterMs(null)).toBeUndefined();
  });
});
