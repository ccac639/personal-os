/**
 * Worker 轻量指标（内存计数，对齐 API 侧 metrics 模式，零外部依赖）：
 * - 按队列统计 job 开始/完成/失败计数
 * - job 耗时直方图（分桶，毫秒）
 * - snapshot() 输出可日志化纯对象（不泄露 job 数据/密钥）
 *
 * 定位：指标采集走 pino 结构化日志字段（周期摘要 + 事件字段），
 * 不引入 Prometheus 栈（G1=A 默认）；如需 /metrics 暴露可在其上适配。
 * 所有方法同步且为 O(1) 内存操作，不阻塞 job 执行（红线：pino 异步保持）。
 */
export type QueueName = string;

export interface WorkerMetricsSnapshot {
  started: Record<QueueName, number>;
  completed: Record<QueueName, number>;
  failed: Record<QueueName, number>;
  /** 平均耗时（ms，按队列；无样本为 0） */
  avgDurationMs: Record<QueueName, number>;
  /** 耗时直方图分桶（按队列；key 为桶上限 ms 或 'over'） */
  durationBuckets: Record<QueueName, Record<string, number>>;
}

const DURATION_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000, 10_000];

export class WorkerMetrics {
  private readonly started = new Map<QueueName, number>();
  private readonly completed = new Map<QueueName, number>();
  private readonly failed = new Map<QueueName, number>();
  private readonly totalDurationMs = new Map<QueueName, number>();
  private readonly bucketHits = new Map<QueueName, Map<string, number>>();

  jobStarted(queue: QueueName): void {
    this.started.set(queue, (this.started.get(queue) ?? 0) + 1);
  }

  jobCompleted(queue: QueueName, durationMs: number): void {
    this.completed.set(queue, (this.completed.get(queue) ?? 0) + 1);
    this.totalDurationMs.set(queue, (this.totalDurationMs.get(queue) ?? 0) + durationMs);
    const bucket = String(DURATION_BUCKETS_MS.find((b) => durationMs <= b) ?? 'over');
    const buckets = this.bucketHits.get(queue) ?? new Map<string, number>();
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    this.bucketHits.set(queue, buckets);
  }

  jobFailed(queue: QueueName): void {
    this.failed.set(queue, (this.failed.get(queue) ?? 0) + 1);
  }

  /** 可日志化快照（纯对象，仅计数与聚合，不含 job 数据）。 */
  snapshot(): WorkerMetricsSnapshot {
    const queues = new Set([
      ...this.started.keys(),
      ...this.completed.keys(),
      ...this.failed.keys(),
    ]);
    const started: Record<QueueName, number> = {};
    const completed: Record<QueueName, number> = {};
    const failed: Record<QueueName, number> = {};
    const avgDurationMs: Record<QueueName, number> = {};
    const durationBuckets: Record<QueueName, Record<string, number>> = {};
    for (const queue of queues) {
      started[queue] = this.started.get(queue) ?? 0;
      completed[queue] = this.completed.get(queue) ?? 0;
      failed[queue] = this.failed.get(queue) ?? 0;
      const done = this.completed.get(queue) ?? 0;
      avgDurationMs[queue] =
        done > 0 ? Math.round((this.totalDurationMs.get(queue) ?? 0) / done) : 0;
      const buckets: Record<string, number> = {};
      for (const [bucket, count] of this.bucketHits.get(queue) ?? []) {
        buckets[bucket] = count;
      }
      durationBuckets[queue] = buckets;
    }
    return { started, completed, failed, avgDurationMs, durationBuckets };
  }
}
