/**
 * 队列契约（单一事实来源）
 *
 * 契约本体已迁移到共享包 `@personal-os/queue-contract`（API 与 Worker 直接
 * 消费同一常量，见 apps/api/test/queue-contract.spec.ts）。本文件仅做转发，
 * 并保留 worker 侧适配边界（BullMQ JobsOptions 在 worker 侧生成）。
 */
import type { JobsOptions } from 'bullmq';

import {
  QUEUE_CONTRACT,
  WORKFLOW_RUN_QUEUE,
  WORKFLOW_RUN_JOB,
  CHAT_QUEUE_NAME,
  CHAT_JOB_NAME,
  SILICONFLOW_API_KEY_REDIS_KEY,
  RETRY_AFTER_MIN_MS,
  RETRY_AFTER_MAX_MS,
} from '@personal-os/queue-contract';
import type { QueueContractEntry } from '@personal-os/queue-contract';

export {
  QUEUE_CONTRACT,
  WORKFLOW_RUN_QUEUE,
  WORKFLOW_RUN_JOB,
  CHAT_QUEUE_NAME,
  CHAT_JOB_NAME,
  SILICONFLOW_API_KEY_REDIS_KEY,
  RETRY_AFTER_MIN_MS,
  RETRY_AFTER_MAX_MS,
};
export type {
  QueueContractEntry,
  ChatGenerateJobData,
  WorkflowRunJobData,
} from '@personal-os/queue-contract';

/**
 * 入队侧统一选项（api 端 Queue.add 使用；两端共享同一契约源）。
 * 注意：BullMQ v5+ 已移除按 job 的 timeout 选项，此处不返回 timeout——
 * 超时由 worker 侧处理器按契约 timeoutMs 强制（见 workers/registration.ts）。
 */
export function toEnqueueOptions(
  entry: QueueContractEntry,
): Pick<JobsOptions, 'attempts' | 'backoff' | 'removeOnComplete' | 'removeOnFail'> {
  return {
    attempts: entry.attempts,
    backoff: { type: 'exponential', delay: entry.backoffMs },
    removeOnComplete: entry.removeOnComplete,
    removeOnFail: entry.removeOnFail,
  };
}
