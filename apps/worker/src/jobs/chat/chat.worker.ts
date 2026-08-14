import type { Job } from 'bullmq';

import { CHAT_QUEUE_NAME } from '@personal-os/queue-contract';
import type { ChatGenerateJobData } from '@personal-os/queue-contract';
import { GENERATION_LIMITS } from '../../providers/ai-completion.js';
import type { AICompletionAdapter } from '../../providers/ai-completion.js';
import { DeterministicMockAdapter } from '../../providers/deterministic-mock.adapter.js';
import { SiliconFlowCompletionAdapter } from '../../providers/siliconflow.adapter.js';
import type { ChatCompletionService } from './chat-completion.service.js';
import { redactSensitive } from './chat-security.js';
import {
  WorkerError,
  errorMessage,
  isRetryableError,
  toBullMqError,
} from '../../errors/worker-errors.js';
import type { LoggerLike } from '../workflows/processor.js';

/** 输入校验：字段齐全 + 纯文本 + 长度上限（防脏数据入队）；非法输入不可重试 */
export function validateJobData(data: ChatGenerateJobData): void {
  const required = ['runId', 'conversationId', 'messageId', 'provider', 'model'] as const;
  for (const key of required) {
    const value = data[key];
    if (typeof value !== 'string' || value.length === 0) {
      throw WorkerError.nonRetryable(`chat-generate 任务缺少必填字段: ${key}`);
    }
  }
  if (
    !Number.isFinite(data.maxTokens) ||
    data.maxTokens < 1 ||
    data.maxTokens > GENERATION_LIMITS.MAX_OUTPUT_CHARS
  ) {
    throw WorkerError.nonRetryable(`chat-generate 任务 maxTokens 非法: ${String(data.maxTokens)}`);
  }
  if (!Array.isArray(data.history) || data.history.length > 20) {
    throw WorkerError.nonRetryable('chat-generate 任务 history 非法（超过 20 条或非数组）');
  }
  for (const entry of data.history) {
    if (
      !entry ||
      (entry.role !== 'user' && entry.role !== 'assistant' && entry.role !== 'system') ||
      typeof entry.content !== 'string'
    ) {
      throw WorkerError.nonRetryable('chat-generate 任务 history 条目非法');
    }
  }
}

export interface ChatProcessorDeps {
  service: ChatCompletionService;
  logger?: LoggerLike;
}

/**
 * BullMQ 处理器：校验 → 执行（分段写回）→ 分类错误
 * - 可重试错误（限流/5xx/网络/超时）→ 上抛，BullMQ 按 backoffStrategy 重试
 * - 不可重试错误（非法负载/配置错误）→ 包装为 UnrecoverableError 上抛，
 *   BullMQ 标记 failed 且只执行一次（保留在 failed 集合可观察）
 * - 业务终态（生成完成/取消）→ 正常完成
 * - 日志仅含 queue / jobId / runId / attempt，不含提示词与密钥
 */
export function createChatProcessor(
  deps: ChatProcessorDeps,
): (job: Job<ChatGenerateJobData>, token?: string, signal?: AbortSignal) => Promise<void> {
  const logger = deps.logger ?? nullLogger;

  return async (
    job: Job<ChatGenerateJobData>,
    _token?: string,
    signal?: AbortSignal,
  ): Promise<void> => {
    const ctx = { queue: CHAT_QUEUE_NAME, jobId: job.id, runId: job.data?.runId };
    logger.info({ ...ctx, attempt: job.attemptsMade + 1 }, 'chat-generate started');
    try {
      validateJobData(job.data);
      await deps.service.run(job.data, signal);
      logger.info(ctx, 'chat-generate finished');
    } catch (err) {
      const message = redactSensitive(errorMessage(err)).slice(0, 500);
      if (isRetryableError(err)) {
        logger.warn(
          { ...ctx, err: message, attempt: job.attemptsMade + 1 },
          'chat-generate retryable failure',
        );
        throw err;
      }
      // 输入损坏 / 配置损坏：只执行一次，job 进入 failed 集合（可观察、不重试）
      logger.warn(
        { ...ctx, err: message },
        'chat-generate unrecoverable failure（不重试，job 进入 failed 集合）',
      );
      throw toBullMqError(err);
    }
  };
}

/** SiliconFlow key 在 Redis 中的键名（与共享契约一致） */
export { SILICONFLOW_API_KEY_REDIS_KEY } from '@personal-os/queue-contract';

/**
 * 按环境变量选择适配器：默认 siliconflow，deterministic-mock 可显式切回（测试/离线）。
 * API Key 读取由调用方注入（main.ts 通过 SecretReader 从共享 Redis 读取），
 * 本函数不再创建任何 Redis 连接（隐藏连接已删除，见任务 6）。
 */
export function resolveAdapter(
  env: NodeJS.ProcessEnv = process.env,
  deps: { getApiKey?: () => Promise<string | null> } = {},
): AICompletionAdapter {
  const name = (env.CHAT_ADAPTER ?? 'siliconflow').trim();
  if (name === 'siliconflow' || name === 'sf') {
    return new SiliconFlowCompletionAdapter({
      getApiKey:
        deps.getApiKey ??
        (async () => {
          throw WorkerError.config('SiliconFlow API Key 读取器未注入（worker 启动装配错误）');
        }),
    });
  }
  if (name === 'deterministic-mock' || name === 'mock') {
    return new DeterministicMockAdapter();
  }
  throw WorkerError.config(
    `Chat adapter "${name}" 未实现：可选 siliconflow | deterministic-mock（mock）`,
  );
}

const nullLogger: LoggerLike = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
