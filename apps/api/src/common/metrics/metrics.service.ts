import { Injectable } from '@nestjs/common';

/**
 * 轻量请求指标（内存计数，无外部依赖）：
 * - 请求总数 / 按状态码分布 / 总延迟 / 延迟直方图分桶
 * - 每请求由 MetricsInterceptor 更新；/api/health 响应附带快照
 * 定位：基础可观测性，不引 prometheus 栈（G3 默认）；如后续需要
 * Prometheus 暴露，可在此类之上加 /metrics 适配。
 */
export interface MetricsSnapshot {
  requests: number;
  byStatus: Record<number, number>;
  totalDurationMs: number;
  avgDurationMs: number;
  latencyBuckets: Record<string, number>;
}

const LATENCY_BUCKETS_MS = [10, 50, 100, 250, 500, 1000, 2500, 5000];

@Injectable()
export class MetricsService {
  private requests = 0;
  private readonly byStatus = new Map<number, number>();
  private totalDurationMs = 0;
  private readonly latencyBuckets = new Map<string, number>();

  /** 记录一次请求完成（状态码 + 耗时）。 */
  record(statusCode: number, durationMs: number): void {
    this.requests += 1;
    this.byStatus.set(statusCode, (this.byStatus.get(statusCode) ?? 0) + 1);
    this.totalDurationMs += durationMs;

    const bucket = LATENCY_BUCKETS_MS.find((b) => durationMs <= b) ?? 'over';
    this.latencyBuckets.set(String(bucket), (this.latencyBuckets.get(String(bucket)) ?? 0) + 1);
  }

  /** 当前指标快照（health 响应附带）。 */
  snapshot(): MetricsSnapshot {
    const byStatus: Record<number, number> = {};
    for (const [code, count] of this.byStatus) {
      byStatus[code] = count;
    }
    const latencyBuckets: Record<string, number> = {};
    for (const [bucket, count] of this.latencyBuckets) {
      latencyBuckets[bucket] = count;
    }
    return {
      requests: this.requests,
      byStatus,
      totalDurationMs: this.totalDurationMs,
      avgDurationMs: this.requests > 0 ? Math.round(this.totalDurationMs / this.requests) : 0,
      latencyBuckets,
    };
  }
}
