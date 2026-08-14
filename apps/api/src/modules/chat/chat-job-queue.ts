import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import { CHAT_QUEUE_NAME, CHAT_JOB_NAME, QUEUE_CONTRACT } from '@personal-os/queue-contract';
import type { ChatGenerateJobData } from '@personal-os/queue-contract';
import { AiSettingsService } from '../ai/ai-settings.service.js';

/**
 * 生成队列抽象：生产环境走 BullMQ，测试注入 Fake。
 * 队列名 / Job 名 / 重试参数 / 清理参数直接消费共享契约 @personal-os/queue-contract
 * （单一事实来源，不再镜像常量；一致性见 apps/api/test/queue-contract.spec.ts）。
 */
export abstract class ChatJobQueue {
  abstract enqueue(payload: ChatGenerateJobData): Promise<string>;
  abstract cancel(jobId: string): Promise<boolean>;
}

/** 兼容导出：API 业务侧引用负载类型 */
export type ChatGeneratePayload = ChatGenerateJobData;

const QUEUE_NAME = CHAT_QUEUE_NAME;
const CHAT_ENTRY = QUEUE_CONTRACT.chatGeneration;

/**
 * BullMQ 实现：使用平台线提供的 Redis（仅个人使用，单队列）。
 * Redis 不可用时抛出明确错误，由调用方转为 503 语义的 500。
 *
 * 入队选项（attempts/backoff/removeOnComplete/removeOnFail）直接来自
 * 共享契约 QUEUE_CONTRACT.chatGeneration（无镜像）；
 * jobId = runId：BullMQ 对同 jobId 去重，天然幂等。
 * 注：BullMQ v5+ 已移除入队侧 timeout 选项，超时由 worker 侧处理器按
 * 契约 timeoutMs 强制（见 worker/src/workers/registration.ts）。
 */
@Injectable()
export class BullChatJobQueue extends ChatJobQueue {
  private readonly logger = new Logger(BullChatJobQueue.name);
  private readonly queue: Queue;

  constructor(private readonly settings: AiSettingsService) {
    super();
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    this.queue = new Queue(QUEUE_NAME, { connection: { url } });
  }

  override async enqueue(payload: ChatGenerateJobData): Promise<string> {
    // 「Web 输入 API Key 后才能使用 AI」：siliconflow 任务投递前必须已配置 key
    if (payload.provider === 'siliconflow') {
      await this.settings.assertConfigured();
    }
    const job = await this.queue.add(CHAT_JOB_NAME, payload, {
      jobId: payload.runId,
      attempts: CHAT_ENTRY.attempts,
      backoff: { type: 'exponential', delay: CHAT_ENTRY.backoffMs },
      removeOnComplete: CHAT_ENTRY.removeOnComplete,
      removeOnFail: CHAT_ENTRY.removeOnFail,
    });
    return job.id ?? payload.runId;
  }

  override async cancel(jobId: string): Promise<boolean> {
    const job = await this.queue.getJob(jobId);
    if (!job) return false;
    await job.remove();
    return true;
  }
}

/** 测试/离线环境的替身：直接记录入队负载，无外部依赖 */
@Injectable()
export class FakeChatJobQueue extends ChatJobQueue {
  readonly enqueued: ChatGenerateJobData[] = [];
  private cancelled = new Set<string>();
  failEnqueue = false;

  override async enqueue(payload: ChatGenerateJobData): Promise<string> {
    if (this.failEnqueue) throw new Error('fake queue down');
    this.enqueued.push(payload);
    return payload.runId;
  }

  override async cancel(jobId: string): Promise<boolean> {
    const exists = this.enqueued.some((p) => p.runId === jobId);
    if (exists) this.cancelled.add(jobId);
    return exists;
  }

  isCancelled(jobId: string): boolean {
    return this.cancelled.has(jobId);
  }

  reset(): void {
    this.enqueued.length = 0;
    this.cancelled.clear();
    this.failEnqueue = false;
  }
}
