/**
 * 失败任务台账（dead-letter 巡检替代方案，内存环形缓冲）：
 * - failed 事件（重试耗尽或不可重试）记录 队列/jobId/runId/错误/尝试次数
 * - 每队列环形淘汰（默认最多保留 100 条），内存有界
 * - list() 供巡检/测试检索；summary() 供周期日志
 *
 * 定位：BullMQ failed job 默认保留在队列 failed 集合（removeOnFail 未开启），
 * Redis 侧数据不丢；本台账提供 worker 进程内的快速巡检视图与日志摘要。
 */
export interface FailedJobRecord {
  queue: string;
  jobId: string | undefined;
  runId: string | undefined;
  error: string;
  attemptsMade: number;
  failedAt: string;
}

export interface FailedJobRegistryOptions {
  /** 每队列最大保留条数（默认 100，超限淘汰最旧） */
  maxPerQueue?: number;
  now?: () => string;
}

export class FailedJobRegistry {
  private readonly records = new Map<string, FailedJobRecord[]>();
  private readonly maxPerQueue: number;
  private readonly now: () => string;

  constructor(options: FailedJobRegistryOptions = {}) {
    this.maxPerQueue = options.maxPerQueue ?? 100;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  record(entry: Omit<FailedJobRecord, 'failedAt'>): void {
    const queue = entry.queue;
    const list = this.records.get(queue) ?? [];
    list.push({ ...entry, failedAt: this.now() });
    if (list.length > this.maxPerQueue) {
      list.splice(0, list.length - this.maxPerQueue);
    }
    this.records.set(queue, list);
  }

  /** 检索失败记录：按队列（缺省全部队列），最新在前。 */
  list(queue?: string): FailedJobRecord[] {
    const queues = queue ? [queue] : [...this.records.keys()];
    const result: FailedJobRecord[] = [];
    for (const q of queues) {
      const entries = this.records.get(q);
      if (entries) {
        result.push(...entries.slice().reverse());
      }
    }
    return result;
  }

  /** 摘要：每队列失败数与最近一条（供周期日志/巡检）。 */
  summary(): { queues: Record<string, { count: number; latest?: FailedJobRecord }> } {
    const queues: Record<string, { count: number; latest?: FailedJobRecord }> = {};
    for (const [queue, entries] of this.records) {
      queues[queue] = {
        count: entries.length,
        latest: entries[entries.length - 1],
      };
    }
    return { queues };
  }
}
