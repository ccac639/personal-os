/**
 * 队列契约（单一事实来源）
 *
 * 契约本体已迁移到共享包 `@personal-os/queue-contract`（API 与 Worker 直接
 * 消费同一常量，见 apps/api/test/queue-contract.spec.ts）。本文件仅做转发，
 * 并保留 worker 侧适配边界（BullMQ JobsOptions 在 worker 侧生成）。
 */
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
