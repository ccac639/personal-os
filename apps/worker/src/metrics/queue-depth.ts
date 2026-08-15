/**
 * 队列深度采样器：周期调用 BullMQ Queue.getJobCounts() 采集
 * waiting/active/completed/failed/delayed 计数，输出结构化日志字段。
 *
 * - 独立异步循环：不阻塞 job 执行（红线：指标/日志不引入同步阻塞）
 * - Redis 不可用/超时容错：单次失败打 warn 日志后继续（不中断采样）
 * - dispose() 清理定时器（shutdown 时调用，避免悬挂）
 */
import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';

export interface QueueDepthSamplerOptions {
  queueNames: string[];
  connection: Redis | { host: string; port: number };
  /** 采样间隔 ms（默认 30_000） */
  intervalMs?: number;
  /** 日志器（pino 兼容） */
  logger: {
    info(obj: Record<string, unknown>, msg: string): void;
    warn(obj: Record<string, unknown>, msg: string): void;
    error(obj: Record<string, unknown>, msg: string): void;
  };
  /** 周期摘要附带 metrics 快照（可选；队列深度 + 指标一次输出） */
  metricsSnapshot?: () => object;
  /** 内部队列实例（测试注入 fake；缺省按 queueNames 构造） */
  queues?: Queue[];
}

export class QueueDepthSampler {
  private readonly queues: Queue[];
  private timer: NodeJS.Timeout | null = null;
  private disposed = false;
  private readonly intervalMs: number;

  constructor(private readonly options: QueueDepthSamplerOptions) {
    this.intervalMs = options.intervalMs ?? 30_000;
    this.queues =
      options.queues ??
      options.queueNames.map(
        (name) =>
          new Queue(name, {
            connection: options.connection,
          }),
      );
  }

  /** 启动采样循环（幂等：重复调用不叠加定时器）。 */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.sampleOnce();
    }, this.intervalMs);
    // 启动即采一次，避免首窗空白
    void this.sampleOnce();
    this.options.logger.info({ intervalMs: this.intervalMs }, 'queue-depth sampler started');
  }

  private async sampleOnce(): Promise<void> {
    const counts: Record<string, unknown> = {};
    let failed = 0;
    for (const queue of this.queues) {
      try {
        const jobCounts = await queue.getJobCounts();
        counts[queue.name] = jobCounts;
      } catch (err) {
        failed += 1;
        this.options.logger.warn(
          { queue: queue.name, err: err instanceof Error ? err.message : String(err) },
          'queue-depth 采样失败（Redis 暂不可用）',
        );
      }
    }
    if (failed > 0 && failed === this.queues.length) {
      return; // 全部失败：仅告警日志已输出，不重复输出空摘要
    }
    const payload: Record<string, unknown> = { depth: counts };
    if (this.options.metricsSnapshot) {
      payload.metrics = this.options.metricsSnapshot();
    }
    this.options.logger.info(payload, 'queue-depth 周期采样摘要');
  }

  /** 停止采样并关闭 Queue 连接（幂等）。 */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    await Promise.allSettled(this.queues.map((queue) => queue.close()));
    this.options.logger.info({}, 'queue-depth sampler disposed');
  }
}
