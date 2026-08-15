import { describe, expect, it } from 'vitest';

import { WorkerMetrics } from '../src/metrics/worker-metrics.js';

describe('WorkerMetrics（单元）', () => {
  it('初始快照为零值（空对象，无队列）', () => {
    const metrics = new WorkerMetrics();
    expect(metrics.snapshot()).toEqual({
      started: {},
      completed: {},
      failed: {},
      avgDurationMs: {},
      durationBuckets: {},
    });
  });

  it('jobStarted/jobCompleted/jobFailed 按队列计数', () => {
    const metrics = new WorkerMetrics();
    metrics.jobStarted('chat-generation');
    metrics.jobStarted('chat-generation');
    metrics.jobCompleted('chat-generation', 120);
    metrics.jobFailed('workflow-runs');
    metrics.jobStarted('workflow-runs');

    const s = metrics.snapshot();
    expect(s.started['chat-generation']).toBe(2);
    expect(s.completed['chat-generation']).toBe(1);
    expect(s.failed['workflow-runs']).toBe(1);
    expect(s.started['workflow-runs']).toBe(1);
  });

  it('耗时直方图分桶（<= 阈值入桶，超出归 over）', () => {
    const metrics = new WorkerMetrics();
    metrics.jobCompleted('q', 40); // <= 50
    metrics.jobCompleted('q', 50); // <= 50
    metrics.jobCompleted('q', 120); // 100 < 120 <= 250
    metrics.jobCompleted('q', 99999); // 超出最大桶 10_000 → over

    const s = metrics.snapshot();
    expect(s.durationBuckets['q']?.['50']).toBe(2);
    expect(s.durationBuckets['q']?.['250']).toBe(1);
    expect(s.durationBuckets['q']?.['over']).toBe(1);
  });

  it('平均耗时按队列计算（无样本为 0）', () => {
    const metrics = new WorkerMetrics();
    metrics.jobCompleted('q', 10);
    metrics.jobCompleted('q', 30);
    metrics.jobStarted('empty');

    const s = metrics.snapshot();
    expect(s.avgDurationMs['q']).toBe(20); // (10+30)/2
    expect(s.avgDurationMs['empty']).toBe(0);
  });

  it('快照不含 job 数据/密钥字段（仅计数与聚合）', () => {
    const metrics = new WorkerMetrics();
    metrics.jobCompleted('q', 42);
    metrics.jobFailed('q');
    const json = JSON.stringify(metrics.snapshot());
    expect(json).not.toContain('apiKey');
    expect(json).not.toContain('token');
    expect(json).not.toContain('secret');
  });
});
