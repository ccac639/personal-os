/**
 * Worker 装配与生命周期测试：
 * - 多 worker 注册（queue 名 / 并发 / 事件装配 / backoffStrategy）
 * - 初始化失败策略（all / partial，覆盖 factory 创建失败）
 * - shutdown 全局 grace 预算：pause → 并行等待在途（共享 deadline）→
 *   超预算 cancelActive（abort 在途）→ 统一 force close → closables → Redis → Mongo
 */
import { describe, expect, it, vi } from 'vitest';
import type { Worker } from 'bullmq';

import { QUEUE_CONTRACT } from '@personal-os/queue-contract';
import {
  createWorkflowWorker,
  createChatWorker,
  makeBackoffStrategy,
  type WorkerHandle,
} from '../src/workers/registration.js';
import {
  startWorkers,
  shutdown,
  WorkerStartupError,
  withTimeout,
  type WorkerFactory,
} from '../src/workers/manager.js';
import { LocalDeterministicAdapter } from '../src/jobs/workflows/adapter.js';
import type { WorkerRunStore, RunRecord } from '../src/jobs/workflows/run-store.js';
import { MemoryChatStore } from '../src/jobs/chat/chat-store.js';
import { DeterministicMockAdapter } from '../src/providers/deterministic-mock.adapter.js';
import { ChatCompletionService } from '../src/jobs/chat/chat-completion.service.js';
import { WorkerError } from '../src/errors/worker-errors.js';

const nullLogger = { info: () => undefined, warn: () => undefined, error: () => undefined };

/** 指向本机未监听端口，retryStrategy 立即放弃，避免测试挂起 */
const deadConnection = {
  host: '127.0.0.1',
  port: 6399,
  maxRetriesPerRequest: null,
  retryStrategy: () => null as number | null,
};

const emptyRunStore: WorkerRunStore = {
  getRunById: async (): Promise<RunRecord | null> => null,
  getWorkflowById: async () => null,
  markRunning: async () => undefined,
  markAttempts: async () => undefined,
  completeRun: async () => undefined,
  markFailed: async () => undefined,
};

function makeWorkflowHandle(): WorkerHandle {
  return createWorkflowWorker({
    store: emptyRunStore,
    adapter: new LocalDeterministicAdapter({
      loadWorkflow: async () => null,
      isRunCancelled: async () => false,
    }),
    logger: nullLogger,
    connection: deadConnection,
  });
}

function makeChatHandle(): WorkerHandle {
  const store = new MemoryChatStore();
  const service = new ChatCompletionService(store, new DeterministicMockAdapter());
  return createChatWorker({ service, logger: nullLogger, connection: deadConnection });
}

describe('worker 注册', () => {
  it('createWorkflowWorker：queue 名与并发来自契约', () => {
    const handle = makeWorkflowHandle();
    expect(handle.queue).toBe(QUEUE_CONTRACT.workflowRuns.queue);
    expect(handle.worker.name).toBe(QUEUE_CONTRACT.workflowRuns.queue);
    expect(handle.worker.opts.concurrency).toBe(QUEUE_CONTRACT.workflowRuns.concurrency);
  });

  it('createChatWorker：queue 名与并发来自契约，可覆盖并发', () => {
    const store = new MemoryChatStore();
    const service = new ChatCompletionService(store, new DeterministicMockAdapter());
    const handle = createChatWorker({
      service,
      logger: nullLogger,
      connection: deadConnection,
      concurrency: 5,
    });
    expect(handle.queue).toBe(QUEUE_CONTRACT.chatGeneration.queue);
    expect(handle.worker.name).toBe(QUEUE_CONTRACT.chatGeneration.queue);
    expect(handle.worker.opts.concurrency).toBe(5);
  });

  it('两个 worker 可同时注册（不冲突）', () => {
    const wf = makeWorkflowHandle();
    const chat = makeChatHandle();
    expect(new Set([wf.queue, chat.queue]).size).toBe(2);
  });

  it('未连接 Redis 的 worker：close() 可调用（不抛错）', async () => {
    const handle = makeWorkflowHandle();
    await expect(
      Promise.race([handle.close(true), new Promise((r) => setTimeout(() => r('timeout'), 2000))]),
    ).resolves.not.toThrow();
  });

  it('worker 装配了 backoffStrategy（429 retry-after 生效的基础）', () => {
    const handle = makeWorkflowHandle();
    const strategy = (handle.worker.opts as { settings?: { backoffStrategy?: unknown } }).settings
      ?.backoffStrategy;
    expect(typeof strategy).toBe('function');
  });

  it('WorkerHandle 暴露 pause/resume/cancelActive/close（背压控制面完整）', () => {
    const handle = makeWorkflowHandle();
    expect(typeof handle.pause).toBe('function');
    expect(typeof handle.resume).toBe('function');
    expect(typeof handle.cancelActive).toBe('function');
    expect(typeof handle.close).toBe('function');
  });
});

describe('makeBackoffStrategy（429 retry-after 生效）', () => {
  const strategy = makeBackoffStrategy(1_000);

  it('WorkerError 携带 retryAfterMs → 使用该值（clamp 上下限）', () => {
    expect(strategy(1, 'custom', WorkerError.rateLimit('429', 5_000))).toBe(5_000);
    // 小于下限 → 提升到下限
    expect(strategy(1, 'custom', WorkerError.rateLimit('429', 100))).toBe(1_000);
    // 大于上限 → 压到上限
    expect(strategy(1, 'custom', WorkerError.rateLimit('429', 300_000))).toBe(60_000);
  });

  it('无 retry-after → 指数退避（1s / 2s / 4s），受上限封顶', () => {
    expect(strategy(1, 'exponential', undefined)).toBe(1_000);
    expect(strategy(2, 'exponential', undefined)).toBe(2_000);
    expect(strategy(3, 'exponential', undefined)).toBe(4_000);
    expect(strategy(10, 'exponential', undefined)).toBe(60_000); // 512s 被压到 60s
  });

  it('普通 Error（无 retryAfterMs）→ 指数退避', () => {
    expect(strategy(2, 'exponential', new Error('boom'))).toBe(2_000);
  });
});

describe('startWorkers 多 worker 装配（factories 形态）', () => {
  function fakeFactory(
    queue: string,
    opts: { ready?: boolean; createThrows?: boolean; closeDelayMs?: number } = {},
  ): {
    factory: WorkerFactory;
    state: { queue: string; closed: number; forceClosed: boolean; created: number };
  } {
    const state = { queue, closed: 0, forceClosed: false, created: 0 };
    const handle = {
      queue,
      worker: {} as Worker,
      waitUntilReady:
        opts.ready === false
          ? () => Promise.reject(new Error(`redis down: ${queue}`))
          : () => Promise.resolve(),
      pause: async () => undefined,
      resume: async () => undefined,
      cancelActive: () => undefined,
      close: (force = false) => {
        state.closed += 1;
        if (force) state.forceClosed = true;
        return opts.closeDelayMs
          ? new Promise<void>((r) => setTimeout(r, opts.closeDelayMs))
          : Promise.resolve();
      },
    };
    const factory: WorkerFactory = {
      queue,
      create: () => {
        state.created += 1;
        if (opts.createThrows) throw new Error(`factory down: ${queue}`);
        return handle;
      },
    };
    return { factory, state };
  }

  it('全部就绪：返回全部 worker', async () => {
    const a = fakeFactory('workflow-runs');
    const b = fakeFactory('chat-generation');
    const handles = await startWorkers({
      logger: nullLogger,
      factories: [a.factory, b.factory],
      initTimeoutMs: 100,
    });
    expect(handles).toHaveLength(2);
    expect(handles.map((h) => h.queue)).toEqual(['workflow-runs', 'chat-generation']);
  });

  it('all 策略：任一失败 → 抛 WorkerStartupError 并关闭全部已创建 handle', async () => {
    const good = fakeFactory('workflow-runs');
    const bad = fakeFactory('chat-generation', { ready: false });
    await expect(
      startWorkers({
        logger: nullLogger,
        factories: [good.factory, bad.factory],
        initTimeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(WorkerStartupError);
    expect(good.state.closed).toBeGreaterThan(0); // 已就绪的也被关闭
    expect(bad.state.closed).toBeGreaterThan(0); // 失败的也被关闭（all 关闭全部）
  });

  it('partial 策略：waitUntilReady 失败 worker 被关闭，健康 worker 继续', async () => {
    const good = fakeFactory('workflow-runs');
    const bad = fakeFactory('chat-generation', { ready: false });
    const handles = await startWorkers({
      logger: nullLogger,
      factories: [good.factory, bad.factory],
      initTimeoutMs: 100,
      failurePolicy: 'partial',
    });
    expect(handles.map((h) => h.queue)).toEqual(['workflow-runs']);
    expect(bad.state.closed).toBeGreaterThan(0);
    expect(good.state.closed).toBe(0);
  });

  it('partial 策略覆盖 factory 创建失败：创建抛错队列被跳过，健康 worker 继续', async () => {
    const good = fakeFactory('workflow-runs');
    const bad = fakeFactory('chat-generation', { createThrows: true });
    const handles = await startWorkers({
      logger: nullLogger,
      factories: [good.factory, bad.factory],
      initTimeoutMs: 100,
      failurePolicy: 'partial',
    });
    expect(handles.map((h) => h.queue)).toEqual(['workflow-runs']);
    expect(bad.state.created).toBe(1); // 创建尝试过
    expect(bad.state.closed).toBe(0); // 无 handle 可关
    expect(good.state.closed).toBe(0);
  });

  it('all 策略覆盖 factory 创建失败：抛 WorkerStartupError，已创建 handle 被关闭', async () => {
    const good = fakeFactory('workflow-runs');
    const bad = fakeFactory('chat-generation', { createThrows: true });
    await expect(
      startWorkers({
        logger: nullLogger,
        factories: [good.factory, bad.factory],
        initTimeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(WorkerStartupError);
    expect(good.state.closed).toBeGreaterThan(0);
  });

  it('初始化超时视为失败', async () => {
    const slow = fakeFactory('chat-generation', { closeDelayMs: 0 });
    const hanging: WorkerFactory = {
      queue: 'slow-queue',
      create: () => ({
        queue: 'slow-queue',
        worker: {} as Worker,
        waitUntilReady: () => new Promise<void>(() => undefined),
        close: async () => undefined,
      }),
    };
    const handles = await startWorkers({
      logger: nullLogger,
      factories: [slow.factory, hanging],
      initTimeoutMs: 50,
      failurePolicy: 'partial',
    });
    expect(handles.map((h) => h.queue)).toEqual(['chat-generation']);
  });
});

describe('shutdown 优雅退出', () => {
  function fakeHandleWithClose(queue: string, order: string[], opts: { hangGrace?: boolean } = {}) {
    const state = { closed: 0, force: false, cancelled: false, paused: false };
    const handle = {
      queue,
      worker: {} as Worker,
      waitUntilReady: async () => undefined,
      pause: () => {
        state.paused = true;
        return opts.hangGrace ? new Promise<void>(() => undefined) : Promise.resolve();
      },
      cancelActive: () => {
        state.cancelled = true;
      },
      close: (force = false) => {
        state.closed += 1;
        state.force = force;
        order.push(queue);
        return Promise.resolve();
      },
    };
    return { handle, state };
  }

  it('顺序：pause → worker 全部关闭 → closables → redis.quit → mongo.disconnect', async () => {
    const order: string[] = [];
    const a = fakeHandleWithClose('workflow-runs', order);
    const b = fakeHandleWithClose('chat-generation', order);
    const secret = {
      name: 'secret-reader',
      close: vi.fn().mockImplementation(async () => order.push('secret')),
    };
    const redis = { quit: vi.fn().mockImplementation(async () => order.push('redis')) };
    const mongo = { disconnect: vi.fn().mockImplementation(async () => order.push('mongo')) };

    await shutdown({
      logger: nullLogger,
      handles: [a.handle, b.handle],
      closables: [secret],
      redis,
      mongo,
      graceMs: 500,
    });

    expect(a.state.paused).toBe(true);
    expect(b.state.paused).toBe(true);
    expect(a.state.closed).toBe(1);
    expect(b.state.closed).toBe(1);
    expect(a.state.force).toBe(true);
    expect(a.state.cancelled).toBe(false);
    expect(secret.close).toHaveBeenCalledOnce();
    expect(redis.quit).toHaveBeenCalledOnce();
    expect(mongo.disconnect).toHaveBeenCalledOnce();
    expect(order).toEqual(['workflow-runs', 'chat-generation', 'secret', 'redis', 'mongo']);
  });

  it('多个 worker 并行关闭共享同一全局 grace 预算（总时长 ≈ graceMs，而非 N×graceMs）', async () => {
    const order: string[] = [];
    // 两个 worker 的在途任务都超过 grace（30ms）→ 到 deadline 后统一 abort + force close
    const a = fakeHandleWithClose('workflow-runs', order, { hangGrace: true });
    const b = fakeHandleWithClose('chat-generation', order, { hangGrace: true });

    const started = Date.now();
    await shutdown({ logger: nullLogger, handles: [a.handle, b.handle], graceMs: 30 });
    const elapsed = Date.now() - started;

    // 全局预算：两个 worker 并行等待，到 deadline 后 cancelActive + close(true) 各一次
    expect(a.state.closed).toBe(1);
    expect(b.state.closed).toBe(1);
    expect(a.state.force).toBe(true);
    expect(b.state.force).toBe(true);
    expect(a.state.cancelled).toBe(true);
    expect(b.state.cancelled).toBe(true);
    // 总时长接近单个 grace（30ms）+ force 开销，远小于 2×grace
    expect(elapsed).toBeLessThan(200);
  });

  it('优雅关闭超时 → abort 在途任务并强制关闭 worker', async () => {
    const hanging = {
      queue: 'chat-generation',
      worker: {} as Worker,
      waitUntilReady: async () => undefined,
      pause: vi.fn(() => new Promise<void>(() => undefined)),
      cancelActive: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const redis = { quit: vi.fn().mockResolvedValue(undefined) };

    await shutdown({ logger: nullLogger, handles: [hanging], redis, graceMs: 50 });

    expect(hanging.pause).toHaveBeenCalledOnce();
    expect(hanging.cancelActive).toHaveBeenCalledOnce();
    expect(hanging.close).toHaveBeenCalledWith(true);
    expect(redis.quit).toHaveBeenCalledOnce();
  });

  it('redis.quit 失败不阻断整体关闭', async () => {
    const handle = fakeHandleWithClose('workflow-runs', []);
    await shutdown({
      logger: nullLogger,
      handles: [handle.handle],
      redis: { quit: async () => Promise.reject(new Error('redis gone')) },
      mongo: { disconnect: async () => undefined },
      graceMs: 100,
    });
    expect(handle.state.closed).toBe(1);
  });
});

describe('withTimeout', () => {
  it('超时拒绝并携带消息', async () => {
    await expect(withTimeout(new Promise(() => undefined), 20, 'too slow')).rejects.toThrow(
      'too slow',
    );
  });

  it('正常完成优先返回', async () => {
    await expect(withTimeout(Promise.resolve(42), 200, 'nope')).resolves.toBe(42);
  });
});
