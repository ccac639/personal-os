/**
 * 运行队列：BullMQ `workflow-runs` 队列（api 入队，worker 消费）
 *
 * service 依赖 RunQueuePort 接口；测试注入内存实现即可验证入队/取消。
 * 队列名 / Job 名 / 重试参数 / 清理参数直接消费共享契约 @personal-os/queue-contract
 * （单一事实来源，不再镜像常量；一致性见 apps/api/test/queue-contract.spec.ts）。
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { WORKFLOW_RUN_QUEUE, WORKFLOW_RUN_JOB, QUEUE_CONTRACT } from '@personal-os/queue-contract';

const WORKFLOW_ENTRY = QUEUE_CONTRACT.workflowRuns;

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
        // 与 worker 侧 QUEUE_CONTRACT.workflowRuns 保持一致（单一契约源）
        // 注：BullMQ v5+ 无入队侧 timeout 选项，超时由 worker 侧处理器强制
        // backoff.type 固定为 'custom'：BullMQ 6 对内置类型（exponential/fixed）
        // 优先使用内置策略，会跳过 worker 侧 settings.backoffStrategy，导致
        // 429 retry-after 解析但不生效（见 worker/src/workers/registration.ts）
        jobId: runId,
        attempts: WORKFLOW_ENTRY.attempts,
        backoff: { type: 'custom', delay: WORKFLOW_ENTRY.backoffMs },
        removeOnComplete: WORKFLOW_ENTRY.removeOnComplete,
        removeOnFail: WORKFLOW_ENTRY.removeOnFail,
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
