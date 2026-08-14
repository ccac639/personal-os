import { describe, expect, it } from 'vitest';

import { MetricsService } from '../src/common/metrics/metrics.service.js';

describe('MetricsService（单元）', () => {
  it('初始快照为零值', () => {
    const metrics = new MetricsService();
    const s = metrics.snapshot();
    expect(s.requests).toBe(0);
    expect(s.avgDurationMs).toBe(0);
    expect(Object.keys(s.byStatus)).toHaveLength(0);
  });

  it('记录请求 → 计数/状态分布/均值正确', () => {
    const metrics = new MetricsService();
    metrics.record(200, 10);
    metrics.record(200, 30);
    metrics.record(404, 20);
    metrics.record(429, 5);

    const s = metrics.snapshot();
    expect(s.requests).toBe(4);
    expect(s.byStatus[200]).toBe(2);
    expect(s.byStatus[404]).toBe(1);
    expect(s.byStatus[429]).toBe(1);
    expect(s.totalDurationMs).toBe(65);
    expect(s.avgDurationMs).toBe(16); // 65 / 4 = 16.25 → round 16
  });

  it('延迟直方图分桶（<= 阈值入桶，超出归 over）', () => {
    const metrics = new MetricsService();
    metrics.record(200, 5); // <= 10
    metrics.record(200, 10); // <= 10
    metrics.record(200, 120); // 100 < 120 <= 250
    metrics.record(200, 9999); // over

    const s = metrics.snapshot();
    expect(s.latencyBuckets['10']).toBe(2);
    expect(s.latencyBuckets['250']).toBe(1);
    expect(s.latencyBuckets['over']).toBe(1);
  });

  it('记录不泄露请求细节（仅计数与聚合）', () => {
    const metrics = new MetricsService();
    metrics.record(200, 42);
    const s = metrics.snapshot();
    expect(JSON.stringify(s)).not.toContain('apiKey');
    expect(JSON.stringify(s)).not.toContain('token');
  });
});
