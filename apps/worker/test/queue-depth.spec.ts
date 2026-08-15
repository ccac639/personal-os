import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { QueueDepthSampler } from '../src/metrics/queue-depth.js';

/** fake Queue：只实现 getJobCounts/name/close，避免真实 Redis 连接 */
function fakeQueue(name: string, counts: () => Promise<Record<string, number>>) {
  return {
    name,
    getJobCounts: vi.fn(counts),
    close: vi.fn(async () => undefined),
  };
}

function logger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('QueueDepthSampler（单元，fake queue）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('start 立即采样一次并输出 depth + metrics 快照日志', async () => {
    const q = fakeQueue('chat-generation', async () => ({
      waiting: 2,
      active: 1,
      completed: 5,
      failed: 0,
      delayed: 0,
    }));
    const log = logger();
    const sampler = new QueueDepthSampler({
      queueNames: ['chat-generation'],
      connection: {} as never,
      intervalMs: 30_000,
      logger: log,
      metricsSnapshot: () => ({ started: { 'chat-generation': 3 } }),
      queues: [q] as never,
    });

    sampler.start();
    await vi.advanceTimersByTimeAsync(0); // flush 首次采样

    expect(q.getJobCounts).toHaveBeenCalledTimes(1);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({
        depth: expect.objectContaining({
          'chat-generation': expect.objectContaining({ waiting: 2, active: 1 }),
        }),
        metrics: expect.objectContaining({ started: { 'chat-generation': 3 } }),
      }),
      'queue-depth 周期采样摘要',
    );

    await sampler.dispose();
    expect(q.close).toHaveBeenCalled();
  });

  it('周期采样：intervalMs 到达后再次采集', async () => {
    const q = fakeQueue('q', async () => ({
      waiting: 1,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }));
    const log = logger();
    const sampler = new QueueDepthSampler({
      queueNames: ['q'],
      connection: {} as never,
      intervalMs: 10_000,
      logger: log,
      queues: [q] as never,
    });

    sampler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(q.getJobCounts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(q.getJobCounts).toHaveBeenCalledTimes(2);

    await sampler.dispose();
  });

  it('Redis 不可用时单次采样失败打 warn 日志，不中断后续采样', async () => {
    let calls = 0;
    const q = fakeQueue('q', async () => {
      calls += 1;
      if (calls === 1) throw new Error('ECONNREFUSED');
      return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
    });
    const log = logger();
    const sampler = new QueueDepthSampler({
      queueNames: ['q'],
      connection: {} as never,
      intervalMs: 10_000,
      logger: log,
      queues: [q] as never,
    });

    sampler.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ queue: 'q', err: 'ECONNREFUSED' }),
      expect.stringContaining('采样失败'),
    );

    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toBe(2);
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ depth: expect.objectContaining({ q: expect.anything() }) }),
      'queue-depth 周期采样摘要',
    );

    await sampler.dispose();
  });

  it('dispose 幂等：重复调用不重复关闭', async () => {
    const q = fakeQueue('q', async () => ({
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }));
    const log = logger();
    const sampler = new QueueDepthSampler({
      queueNames: ['q'],
      connection: {} as never,
      intervalMs: 10_000,
      logger: log,
      queues: [q] as never,
    });

    await sampler.dispose();
    await sampler.dispose();
    expect(q.close).toHaveBeenCalledTimes(1);
  });
});
