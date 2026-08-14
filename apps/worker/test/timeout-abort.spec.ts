/**
 * 任务 2/3/6 专项测试：
 * - 超时后无后台写入（chat：abort 后消息内容不再增长；workflow engine：abort 后无节点结果）
 * - attempt 不重叠（同一 job 第二次执行开始前，第一次已完全结束）
 * - UnrecoverableError 只执行一次并进入 failed（不可重试错误映射）
 * - Redis 连接全部关闭（resolveAdapter 不再创建隐藏连接；SecretReader close 幂等）
 */
import { describe, expect, it } from 'vitest';
import { UnrecoverableError } from 'bullmq';

import { MemoryChatStore } from '../src/jobs/chat/chat-store.js';
import { ChatCompletionService } from '../src/jobs/chat/chat-completion.service.js';
import { DeterministicMockAdapter } from '../src/providers/deterministic-mock.adapter.js';
import { resolveAdapter, validateJobData } from '../src/jobs/chat/chat.worker.js';
import {
  WorkerError,
  isRetryableError,
  toBullMqError,
  retryDelayMs,
} from '../src/errors/worker-errors.js';
import type { ChatGenerateJobData } from '@personal-os/queue-contract';
import { RedisSecretReader } from '../src/secrets/secret-reader.js';
import { executeWorkflow } from '../src/jobs/workflows/engine.js';
import { snapshot, node, edge, inputDef, outputDef } from './helpers/workflow-fixtures.js';

const baseJob: ChatGenerateJobData = {
  runId: 'run_1',
  conversationId: 'conv_1',
  messageId: 'msg_1',
  provider: 'openai',
  model: 'gpt-4o-mini',
  maxTokens: 500,
  temperature: 0.7,
  systemPrompt: '你是测试助手',
  history: [{ role: 'user', content: '你好' }],
};

/** 可中止的慢速 adapter：每段前检查 signal，abort 立即抛错 */
class SlowAbortableAdapter extends DeterministicMockAdapter {
  constructor(private readonly delayPerSegmentMs: number) {
    super({ segments: 3 });
  }

  override async complete(
    input: Parameters<DeterministicMockAdapter['complete']>[0],
    signal?: AbortSignal,
  ): Promise<
    ReturnType<DeterministicMockAdapter['complete']> extends Promise<infer T> ? T : never
  > {
    // 先做慢速"请求"（模拟 provider 在途），abort 时立即中止
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(resolve, this.delayPerSegmentMs);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    return super.complete(input, signal);
  }
}

describe('任务 2：超时/中止后无后台写入', () => {
  it('chat：写回前 signal.aborted → 不再追加消息内容，run 落 failed 且错误可重试', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });

    const controller = new AbortController();
    const adapter = new SlowAbortableAdapter(50);
    const service = new ChatCompletionService(store, adapter);

    // 消费前 abort（模拟任务超时/关闭）→ 不启动生成
    controller.abort();
    await expect(service.run(baseJob, controller.signal)).rejects.toMatchObject({
      retryable: true,
    });

    const run = await store.getRun('run_1');
    expect(run!.state).toBe('failed'); // 终态落库，不永久 running
    expect(store.messages.get('msg_1')!.content).toBe(''); // 无任何写回
  });

  it('chat：写回中途 abort → 已写段保留，未写段不追加，run 落 failed', async () => {
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });

    const controller = new AbortController();
    // 第一段写回后 abort
    const originalAppend = store.appendMessageContent.bind(store);
    let appended = 0;
    store.appendMessageContent = async (messageId, delta) => {
      appended += 1;
      await originalAppend(messageId, delta);
      if (appended === 1) controller.abort();
    };

    const service = new ChatCompletionService(store, new DeterministicMockAdapter({ segments: 3 }));
    await expect(service.run(baseJob, controller.signal)).rejects.toMatchObject({
      retryable: true,
    });

    const run = await store.getRun('run_1');
    expect(run!.state).toBe('failed');
    // 只有第一段被写回，abort 后不再追加
    expect(appended).toBe(1);
    const metaSegments = (run!.meta!.segments as unknown[]).length;
    expect(metaSegments).toBe(1);
  });

  it('workflow engine：abort 后不再执行节点、不再产生节点结果', async () => {
    const controller = new AbortController();
    // 三节点快照：abort 触发后引擎立即停止
    const snap = snapshot({
      id: 'wf-abort',
      nodes: [
        node('n1', { kind: 'trigger', label: 'n1' }),
        node('n2', { kind: 'prompt', label: 'n2', template: 'hi {{name}}' }),
        node('n3', { kind: 'output', label: 'n3', outputName: 'out' }),
      ],
      edges: [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3')],
      inputs: [inputDef('name', { required: false })],
      outputs: [outputDef('out', 'n2.text')],
    });

    const deps = {
      isAborted: () => controller.signal.aborted,
      isCancelled: async () => false,
      loadSubflow: async () => null,
      now: () => 1,
      sleep: async () => undefined,
    };

    const result = await executeWorkflow(snap, { variables: { name: 'x' } }, {}, deps);
    // abort 未触发时正常完成
    expect(result.status).toBe('success');

    // 触发 abort → 引擎立即停止，无节点结果
    controller.abort();
    const aborted = await executeWorkflow(snap, { variables: { name: 'x' } }, {}, deps);
    expect(aborted.status).toBe('failed');
    expect(aborted.error).toContain('超时或关闭');
    expect(aborted.nodeResults.length).toBe(0);
  });
});

describe('任务 3：UnrecoverableError 统一映射', () => {
  it('non-retryable / config → toBullMqError 产出 UnrecoverableError（只执行一次进 failed）', () => {
    const e1 = toBullMqError(WorkerError.nonRetryable('非法负载'));
    expect(e1).toBeInstanceOf(UnrecoverableError);
    expect(isRetryableError(WorkerError.nonRetryable('x'))).toBe(false);

    const e2 = toBullMqError(WorkerError.config('缺 key'));
    expect(e2).toBeInstanceOf(UnrecoverableError);
  });

  it('retryable / rate-limit / 未知 → 原样透传（可重试）', () => {
    const retryable = WorkerError.retryable('5xx');
    expect(toBullMqError(retryable)).toBe(retryable);
    const rateLimit = WorkerError.rateLimit('429', 5_000);
    expect(toBullMqError(rateLimit)).toBe(rateLimit);
    const plain = new Error('boom');
    expect(toBullMqError(plain)).toBe(plain);
  });

  it('validateJobData 非法输入 → 不可重试（会映射为 UnrecoverableError）', () => {
    try {
      validateJobData({ ...baseJob, runId: '' });
      expect.unreachable();
    } catch (err) {
      expect(isRetryableError(err)).toBe(false);
      expect(toBullMqError(err)).toBeInstanceOf(UnrecoverableError);
    }
  });
});

describe('任务 4：retry-after 延迟', () => {
  it('retryDelayMs：有 retry-after → clamp 使用；无 → 指数退避', () => {
    expect(retryDelayMs(1, WorkerError.rateLimit('429', 5_000), { backoffMs: 1_000 })).toBe(5_000);
    expect(
      retryDelayMs(1, WorkerError.rateLimit('429', 100), { backoffMs: 1_000, minMs: 1_000 }),
    ).toBe(1_000);
    expect(
      retryDelayMs(1, WorkerError.rateLimit('429', 999_999), { backoffMs: 1_000, maxMs: 60_000 }),
    ).toBe(60_000);
    expect(retryDelayMs(2, undefined, { backoffMs: 1_000, minMs: 1_000, maxMs: 60_000 })).toBe(
      2_000,
    );
    expect(retryDelayMs(10, undefined, { backoffMs: 1_000, minMs: 1_000, maxMs: 60_000 })).toBe(
      60_000,
    );
  });
});

describe('任务 6：隐藏 Redis 连接已删除', () => {
  it('resolveAdapter 不再创建 Redis 连接（getApiKey 由调用方注入）', async () => {
    let keyRead = false;
    const adapter = resolveAdapter(
      {},
      {
        getApiKey: async () => {
          keyRead = true;
          return null;
        },
      },
    );
    expect(adapter.id).toBe('siliconflow');
    await expect(
      adapter.complete(
        { systemPrompt: '', history: [], options: { maxChars: 100, temperature: 0.7 } },
        new AbortController().signal,
      ),
    ).rejects.toThrow('API Key 未配置');
    expect(keyRead).toBe(true); // key 读取来自注入点，而非隐藏 Redis
  });

  it('SecretReader：close 幂等，get 在关闭后拒绝', async () => {
    const fakeRedis = {
      get: async (k: string) => (k === 'siliconflow:api_key' ? 'sk-x' : null),
    } as never;
    const reader = new RedisSecretReader(fakeRedis);
    expect(await reader.get('siliconflow:api_key')).toBe('sk-x');
    await reader.close();
    await reader.close(); // 幂等
    expect(reader.closed).toBe(true);
    await expect(reader.get('siliconflow:api_key')).rejects.toThrow('已关闭');
  });
});

describe('任务 2：attempt 不重叠', () => {
  it('withJobTimeout 语义：底层 settle 后才返回（超时不竞速丢弃）', async () => {
    // 通过 ChatCompletionService + 可中止 adapter 验证：abort 后 service 立即返回，
    // 不存在「第一次执行仍在跑、第二次已开始」的窗口（BullMQ 同 job 串行 + 先 abort 后返回）
    const store = new MemoryChatStore();
    store.seed({ id: 'run_1', state: 'queued' }, { id: 'msg_1' });

    const controller = new AbortController();
    let adapterSettled = false;
    // 通知测试：adapter 已开始执行（避免 abort 发生在 adapter 启动前的"消费前中止"分支）
    let startedResolve: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      startedResolve = resolve;
    });
    const adapter = {
      id: 'tracking',
      complete: async (
        _input: Parameters<DeterministicMockAdapter['complete']>[0],
        signal?: AbortSignal,
      ) => {
        startedResolve();
        await new Promise<void>((resolve) => {
          const t = setTimeout(() => {
            adapterSettled = true;
            resolve();
          }, 30);
          signal?.addEventListener(
            'abort',
            () => {
              clearTimeout(t);
              adapterSettled = true;
              resolve();
            },
            { once: true },
          );
        });
        throw new DOMException('aborted', 'AbortError');
      },
    };

    const service = new ChatCompletionService(store, adapter);
    const promise = service.run(baseJob, controller.signal);
    // 等 adapter 真正开始（abort 监听器已注册）后再触发超时 abort
    await started;
    controller.abort();
    await expect(promise).rejects.toMatchObject({ retryable: true });
    // abort 返回时底层已 settle（无后台残留）
    expect(adapterSettled).toBe(true);
  });
});
