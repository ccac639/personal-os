/**
 * 运行队列：BullMQ `workflow-runs` 队列（api 入队，worker 消费）
 *
 * service 依赖 RunQueuePort 接口；测试注入内存实现即可验证入队/取消。
 * 队列名与 worker/src/jobs/workflows/queue.ts 保持一致。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

export const WORKFLOW_RUN_QUEUE = 'workflow-runs';
export const WORKFLOW_RUN_JOB = 'workflow-run';

/** 队列端口（service 依赖此接口） */
export interface RunQueuePort {
  enqueue(runId: string): Promise<void>;
  remove(runId: string): Promise<void>;
}

export const RUN_QUEUE_PORT = Symbol('RUN_QUEUE_PORT');

@Injectable()
export class BullMqRunQueue implements RunQueuePort {
  private queue: Queue | null = null;

  constructor(private readonly config: ConfigService) {}

  private getQueue(): Queue {
    if (!this.queue) {
      const url = this.config.get<string>('redis.url', 'redis://localhost:6379');
      const connection = new IORedis(url, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });
      this.queue = new Queue(WORKFLOW_RUN_QUEUE, { connection });
    }
    return this.queue;
  }

  async enqueue(runId: string): Promise<void> {
    await this.getQueue().add(
      WORKFLOW_RUN_JOB,
      { runId },
      {
        jobId: runId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 500,
        removeOnFail: 1_000,
      },
    );
  }

  async remove(runId: string): Promise<void> {
    const job = await this.getQueue().getJob(runId);
    if (job) await job.remove();
  }

  /** 释放连接（应用关闭时调用） */
  async close(): Promise<void> {
    if (this.queue) {
      await this.queue.close();
      this.queue = null;
    }
  }
}
