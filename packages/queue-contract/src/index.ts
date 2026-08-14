/**
 * 队列契约（单一事实来源，API 与 Worker 共同消费）
 *
 * 本包为纯数据契约，**不依赖 BullMQ**：
 * - 队列名 / Job 名 / 重试参数 / 清理参数 / timeoutMs / Redis Key / Job Payload 类型
 * - BullMQ 的 JobsOptions 在适配边界生成（worker 侧 registration.ts、
 *   api 侧 chat-job-queue.ts / workflow.queue.ts），本包只提供纯值。
 *
 * 消费方：
 * - apps/worker（registration.ts / processor / adapter / chat.worker）
 * - apps/api（chat-job-queue.ts / workflow.queue.ts）
 * - 一致性测试 apps/api/test/queue-contract.spec.ts
 */

/** 队列契约条目（纯值，不含 BullMQ 类型） */
export interface QueueContractEntry {
  /** BullMQ 队列名 */
  queue: string;
  /** 队列内任务名 */
  job: string;
  /** 最大尝试次数（含首次） */
  attempts: number;
  /** 指数退避基础延迟 ms（无 retry-after 时回退该策略） */
  backoffMs: number;
  /** 单任务超时 ms（BullMQ 已移除入队侧 timeout，由 worker 侧处理器强制） */
  timeoutMs: number;
  /** 保留最近 N 条已完成任务 */
  removeOnComplete: number;
  /** 保留最近 N 条失败任务 */
  removeOnFail: number;
  /** worker 并发数 */
  concurrency: number;
  /** worker 锁时长 ms（应 ≥ timeoutMs，防止长任务被误判 stalled） */
  lockDurationMs: number;
  /** stalled 扫描间隔 ms */
  stalledIntervalMs: number;
}

export const QUEUE_CONTRACT = {
  workflowRuns: {
    queue: 'workflow-runs',
    job: 'workflow-run',
    attempts: 3,
    backoffMs: 1_000,
    timeoutMs: 120_000,
    removeOnComplete: 200,
    removeOnFail: 1_000,
    concurrency: 4,
    lockDurationMs: 300_000,
    stalledIntervalMs: 60_000,
  },
  chatGeneration: {
    queue: 'chat-generation',
    job: 'chat-generate',
    attempts: 3,
    backoffMs: 1_000,
    timeoutMs: 120_000,
    removeOnComplete: 200,
    removeOnFail: 1_000,
    concurrency: 2,
    lockDurationMs: 300_000,
    stalledIntervalMs: 60_000,
  },
} as const satisfies Record<string, QueueContractEntry>;

export type QueueContract = typeof QUEUE_CONTRACT;
export type QueueName = keyof QueueContract;

/** 队列别名（worker 侧复用常量，避免魔法字符串） */
export const WORKFLOW_RUN_QUEUE: string = QUEUE_CONTRACT.workflowRuns.queue;
export const WORKFLOW_RUN_JOB: string = QUEUE_CONTRACT.workflowRuns.job;
export const CHAT_QUEUE_NAME: string = QUEUE_CONTRACT.chatGeneration.queue;
export const CHAT_JOB_NAME: string = QUEUE_CONTRACT.chatGeneration.job;

/** SiliconFlow API Key 在 Redis 中的键名（api 写入 ↔ worker 读取同一键） */
export const SILICONFLOW_API_KEY_REDIS_KEY = 'siliconflow:api_key';

/**
 * 429 retry-after 延迟上下限（ms）：
 * - retry-after 头提供的值被 clamp 到 [min, max]；
 * - 无 retry-after 时的指数退避同样受 max 封顶。
 */
export const RETRY_AFTER_MIN_MS = 1_000;
export const RETRY_AFTER_MAX_MS = 60_000;

/**
 * Job Payload 类型（两端共享；严禁携带任何密钥 / ownerId）
 */

/** Chat 生成任务负载（与 worker 侧 validateJobData 必填字段对齐） */
export interface ChatGenerateJobData {
  runId: string;
  conversationId: string;
  /** worker 写回目标消息 */
  messageId: string;
  provider: string;
  model: string;
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
}

/** workflow-runs 任务负载：仅 runId（工作流快照/输入不随队列传输） */
export interface WorkflowRunJobData {
  runId: string;
}
