import { describe, expect, it } from 'vitest';

import {
  SiliconFlowCompletionAdapter,
  SILICONFLOW_DEFAULT_MODEL,
} from '../src/providers/siliconflow.adapter.js';
import { WorkerError } from '../src/errors/worker-errors.js';
import OpenAI from 'openai';

/** 注入 fake OpenAI 客户端，避免真实网络调用 */
function fakeClient(overrides: { content?: string; tokens?: number } = {}) {
  return {
    apiKey: '',
    chat: {
      completions: {
        create: async () => ({
          choices: [{ message: { content: overrides.content ?? '你好！这是硅基流动的回复。' } }],
          usage: { total_tokens: overrides.tokens ?? 9 },
        }),
      },
    },
  } as unknown as ConstructorParameters<typeof SiliconFlowCompletionAdapter>[0]['client'];
}

describe('SiliconFlowCompletionAdapter', () => {
  it('未配置 API Key 时抛出明确错误（任务将 failed 落库）', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => null,
      client: fakeClient(),
    });
    await expect(
      adapter.complete({
        systemPrompt: '',
        history: [{ role: 'user', content: 'hi' }],
        options: { maxChars: 500, temperature: 0.7 },
      }),
    ).rejects.toThrow('SiliconFlow API Key 未配置');
  });

  it('正常回复：分段合并等于全文，元信息正确', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => 'sk-test',
      client: fakeClient({ content: '第一句。第二句！第三句？', tokens: 12 }),
    });
    const result = await adapter.complete({
      systemPrompt: '你是助手',
      history: [{ role: 'user', content: '你好' }],
      options: { maxChars: 500, temperature: 0.7 },
    });
    expect(result.provider).toBe('siliconflow');
    expect(result.model).toBe(SILICONFLOW_DEFAULT_MODEL);
    expect(result.totalTokens).toBe(12);
    expect(result.segments.map((s) => s.text).join('')).toBe('第一句。第二句！第三句？');
    // 每段携带 index 与 tokenCount
    expect(result.segments[0].index).toBe(0);
    expect(result.segments[0].tokenCount).toBeGreaterThan(0);
  });

  it('输出长度受 maxChars 钳制', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => 'sk-test',
      client: fakeClient({ content: 'x'.repeat(300) }),
    });
    const result = await adapter.complete({
      systemPrompt: '',
      history: [],
      options: { maxChars: 100, temperature: 0.7 },
    });
    const text = result.segments.map((s) => s.text).join('');
    expect(text.length).toBeLessThanOrEqual(100);
  });

  it('分段数量不超过 MAX_SEGMENTS(5)', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => 'sk-test',
      segmentMaxChars: 10,
      client: fakeClient({ content: '一二三四五六七八九十。'.repeat(10) }),
    });
    const result = await adapter.complete({
      systemPrompt: '',
      history: [],
      options: { maxChars: 500, temperature: 0.7 },
    });
    expect(result.segments.length).toBeLessThanOrEqual(5);
  });

  it('complete 时通过 getApiKey 获取密钥（Job 数据不携带密钥）', async () => {
    let keyRead = false;
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => {
        keyRead = true;
        return 'sk-injected';
      },
      client: fakeClient(),
    });
    await adapter.complete({
      systemPrompt: '',
      history: [{ role: 'user', content: 'hi' }],
      options: { maxChars: 100, temperature: 0.7 },
    });
    expect(keyRead).toBe(true);
  });

  it('上游超时 → 按可重试错误抛出（WorkerError.retryable）', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => 'sk-test',
      timeoutMs: 50,
      client: {
        chat: {
          completions: {
            // 永不 resolve：触发 withTimeout 竞速超时
            create: () => new Promise(() => undefined),
          },
        },
      } as unknown as ConstructorParameters<typeof SiliconFlowCompletionAdapter>[0]['client'],
    });
    const err = await adapter
      .complete({
        systemPrompt: '',
        history: [{ role: 'user', content: 'hi' }],
        options: { maxChars: 100, temperature: 0.7 },
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(WorkerError);
    expect((err as WorkerError).kind).toBe('retryable');
    expect((err as WorkerError).retryable).toBe(true);
    expect((err as Error).message).toContain('超时');
  });

  it('限流（429）→ rate-limit 错误（可重试，携带 retry-after）', async () => {
    const adapter = new SiliconFlowCompletionAdapter({
      getApiKey: async () => 'sk-test',
      client: {
        chat: {
          completions: {
            create: async () => {
              throw new OpenAI.RateLimitError(
                429,
                { message: 'slow down' },
                'slow down',
                new Headers({ 'retry-after': '3' }),
              );
            },
          },
        },
      } as unknown as ConstructorParameters<typeof SiliconFlowCompletionAdapter>[0]['client'],
    });
    const err = await adapter
      .complete({
        systemPrompt: '',
        history: [{ role: 'user', content: 'hi' }],
        options: { maxChars: 100, temperature: 0.7 },
      })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(WorkerError);
    expect((err as WorkerError).kind).toBe('rate-limit');
    expect((err as WorkerError).retryable).toBe(true);
    expect((err as WorkerError).retryAfterMs).toBe(3_000);
  });
});
