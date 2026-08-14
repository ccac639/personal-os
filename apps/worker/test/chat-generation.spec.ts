import { describe, expect, it } from 'vitest';

import { DeterministicMockAdapter } from '../src/providers/deterministic-mock.adapter.js';
import { GENERATION_LIMITS, ChatGenerateJobData } from '../src/providers/ai-completion.js';
import { MemoryChatStore } from '../src/jobs/chat/chat-store.js';
import { ChatCompletionService } from '../src/jobs/chat/chat-completion.service.js';
import {
  createChatProcessor,
  resolveAdapter,
  validateJobData,
} from '../src/jobs/chat/chat.worker.js';

const baseJob: ChatGenerateJobData = {
  runId: 'run_1',
  conversationId: 'conv_1',
  messageId: 'msg_1',
  provider: 'openai',
  model: 'gpt-4o-mini',
  maxTokens: 500,
  temperature: 0.7,
  systemPrompt: '你是测试助手',
  history: [
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '你好！' },
  ],
};

describe('DeterministicMockAdapter', () => {
  it('确定性：同一输入两次输出一致', async () => {
    const adapter = new DeterministicMockAdapter();
    const a = await adapter.complete({
      systemPrompt: 'p',
      history: [{ role: 'user', content: 'q' }],
      options: { maxChars: 500, temperature: 0.7 },
    });
    const b = await adapter.complete({
      systemPrompt: 'p',
      history: [{ role: 'user', content: 'q' }],
      options: { maxChars: 500, temperature: 0.7 },
    });
    expect(a.segments).toEqual(b.segments);
  });

  it('输出长度受 maxChars 钳制（上限 2000）', async () => {
    const adapter = new DeterministicMockAdapter();
    const result = await adapter.complete({
      systemPrompt: 'p',
      history: [],
      options: { maxChars: 100, temperature: 0.7 },
    });
    const text = result.segments.map((s) => s.text).join('');
    expect(text.length).toBeLessThanOrEqual(100);

    const big = await adapter.complete({
      systemPrompt: 'p',
      history: [],
      options: { maxChars: 99999, temperature: 0.7 },
    });
    const bigText = big.segments.map((s) => s.text).join('');
    expect(bigText.length).toBeLessThanOrEqual(GENERATION_LIMITS.MAX_OUTPUT_CHARS);
  });

  it('分段数量在 3-5 之间', async () => {
    const adapter = new DeterministicMockAdapter();
    const result = await adapter.complete({
      systemPrompt: 'p',
      history: [{ role: 'user', content: 'x'.repeat(200) }],
      options: { maxChars: 2000, temperature: 0.7 },
    });
    expect(result.segments.length).toBeGreaterThanOrEqual(3);
    expect(result.segments.length).toBeLessThanOrEqual(5);
    expect(result.totalTokens).toBeGreaterThan(0);
  });
});

describe('ChatCompletionService（分段写回）', () => {
  it('成功路径：逐段写回消息与 run，终态 completed', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));

    await service.run(baseJob);

    const run = await store.getRun('run_1');
    expect(run!.state).toBe('completed');
    const meta = run!.meta!;
    expect((meta.segments as unknown[]).length).toBe(3);
    expect(meta.totalTokens).toBeGreaterThan(0);
    expect(meta.durationMs).toBeGreaterThanOrEqual(0);

    const message = store.messages.get('msg_1')!;
    expect(message.status).toBe('completed');
    expect(message.content).toContain('[mock]');
  });

  it('取消：写回前检测到 cancelling → 终态 cancelled', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    // 第一次 getRun 时（首段前）置为 cancelling
    const originalGet = store.getRun.bind(store);
    store.getRun = async (runId) => {
      const run = await originalGet(runId);
      if (run && run.state === 'queued') {
        await store.updateRun(runId, { state: 'cancelling' });
        return { ...run, state: 'cancelling' };
      }
      return run;
    };
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 4 }));

    await service.run(baseJob);

    expect((await store.getRun('run_1'))!.state).toBe('cancelled');
    expect(store.messages.get('msg_1')!.status).toBe('cancelled');
  });

  it('失败恢复：adapter 抛错 → run failed + 消息 failed + 错误脱敏 + 错误上抛', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const failingAdapter = {
      id: 'failing',
      complete: async () => {
        throw new Error('upstream 500: sk-abcdef1234567890');
      },
    };
    const service = new ChatCompletionService(store, failingAdapter);

    // 分类后的可重试错误上抛（由处理器决定是否触发 BullMQ 重试）
    await expect(service.run(baseJob)).rejects.toMatchObject({ retryable: true });

    const run = await store.getRun('run_1');
    expect(run!.state).toBe('failed');
    expect(String(run!.meta!.error)).toContain('upstream 500');
    expect(String(run!.meta!.error)).not.toContain('sk-abcdef1234567890');
    expect(store.messages.get('msg_1')!.status).toBe('failed');
  });

  it('写入中途失败：终态 failed + 错误上抛', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const originalAppend = store.appendMessageContent.bind(store);
    store.appendMessageContent = async (messageId, delta) => {
      if (delta.includes('收到历史消息')) throw new Error('mongo down');
      return originalAppend(messageId, delta);
    };
    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));

    await expect(service.run(baseJob)).rejects.toMatchObject({ retryable: true });
    expect((await store.getRun('run_1'))!.state).toBe('failed');
    expect(store.messages.get('msg_1')!.status).toBe('failed');
  });
});

describe('Chat 任务校验与处理器', () => {
  it('validateJobData：字段齐全通过', () => {
    expect(() => validateJobData(baseJob)).not.toThrow();
  });

  it('validateJobData：缺字段/非法 maxTokens/超长 history 拒绝', () => {
    expect(() => validateJobData({ ...baseJob, runId: '' })).toThrow('runId');
    expect(() => validateJobData({ ...baseJob, maxTokens: 0 })).toThrow('maxTokens');
    expect(() =>
      validateJobData({
        ...baseJob,
        history: Array.from({ length: 21 }, (_, i) => ({
          role: 'user' as const,
          content: `x${i}`,
        })),
      }),
    ).toThrow('history');
    expect(() =>
      validateJobData({ ...baseJob, history: [{ role: 'tool' as never, content: 'x' }] }),
    ).toThrow('history');
  });

  it('处理器：mock 入队数据端到端完成', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });
    const service = new ChatCompletionService(
      store,
      resolveAdapter({ CHAT_ADAPTER: 'deterministic-mock' }),
    );
    const processor = createChatProcessor({ service });
    const job = { id: 'job_1', data: baseJob } as never;

    await processor(job);

    expect((await store.getRun('run_1'))!.state).toBe('completed');
    expect(store.messages.get('msg_1')!.content.length).toBeGreaterThan(0);
  });

  it('resolveAdapter：默认 siliconflow，mock 可显式切回，未知适配器启动即失败', () => {
    expect(resolveAdapter({}).id).toBe('siliconflow');
    expect(resolveAdapter({ CHAT_ADAPTER: 'deterministic-mock' }).id).toBe('deterministic-mock');
    expect(() => resolveAdapter({ CHAT_ADAPTER: 'openai' })).toThrow('未实现');
  });
});
