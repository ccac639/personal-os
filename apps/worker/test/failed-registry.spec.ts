import { describe, expect, it } from 'vitest';

import { FailedJobRegistry } from '../src/jobs/failed-registry.js';

const FIXED_NOW = '2026-08-15T00:00:00.000Z';

describe('FailedJobRegistry（单元）', () => {
  it('record 后可按队列检索（最新在前）', () => {
    const registry = new FailedJobRegistry({ now: () => FIXED_NOW });
    registry.record({
      queue: 'chat-generation',
      jobId: 'job-1',
      runId: 'run-1',
      error: 'rate limited',
      attemptsMade: 3,
    });
    registry.record({
      queue: 'chat-generation',
      jobId: 'job-2',
      runId: 'run-2',
      error: 'timeout',
      attemptsMade: 1,
    });

    const all = registry.list('chat-generation');
    expect(all).toHaveLength(2);
    expect(all[0]?.jobId).toBe('job-2'); // 最新在前
    expect(all[0]?.failedAt).toBe(FIXED_NOW);
    expect(all[1]?.jobId).toBe('job-1');
  });

  it('list 缺省返回全部队列，按队列分组合并', () => {
    const registry = new FailedJobRegistry({ now: () => FIXED_NOW });
    registry.record({
      queue: 'chat-generation',
      jobId: 'a',
      runId: undefined,
      error: 'e1',
      attemptsMade: 1,
    });
    registry.record({
      queue: 'workflow-runs',
      jobId: 'b',
      runId: undefined,
      error: 'e2',
      attemptsMade: 2,
    });

    const all = registry.list();
    expect(all).toHaveLength(2);
    expect(all.map((r) => r.queue).sort()).toEqual(['chat-generation', 'workflow-runs']);
  });

  it('环形淘汰：超 maxPerQueue 丢弃最旧', () => {
    const registry = new FailedJobRegistry({ maxPerQueue: 2, now: () => FIXED_NOW });
    for (let i = 0; i < 5; i += 1) {
      registry.record({
        queue: 'q',
        jobId: `job-${i}`,
        runId: undefined,
        error: `e${i}`,
        attemptsMade: 1,
      });
    }
    const entries = registry.list('q');
    expect(entries).toHaveLength(2);
    expect(entries[0]?.jobId).toBe('job-4');
    expect(entries[1]?.jobId).toBe('job-3');
  });

  it('summary 输出每队列计数与最近一条（供周期日志）', () => {
    const registry = new FailedJobRegistry({ now: () => FIXED_NOW });
    registry.record({ queue: 'q', jobId: 'a', runId: undefined, error: 'e1', attemptsMade: 1 });
    registry.record({ queue: 'q', jobId: 'b', runId: undefined, error: 'e2', attemptsMade: 2 });

    const summary = registry.summary();
    expect(summary.queues['q']?.count).toBe(2);
    expect(summary.queues['q']?.latest?.jobId).toBe('b');
  });

  it('记录不泄露凭据（仅错误消息与计数）', () => {
    const registry = new FailedJobRegistry({ now: () => FIXED_NOW });
    registry.record({ queue: 'q', jobId: 'a', runId: undefined, error: 'boom', attemptsMade: 1 });
    const json = JSON.stringify(registry.list());
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('token');
  });
});
