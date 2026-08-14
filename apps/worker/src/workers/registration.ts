/**
 * Worker 注册：将队列处理器装配为可管理的 WorkerHandle
 *
 * - workflow-runs：LocalDeterministicAdapter 执行（并发 4）
 * - chat-generation：ChatCompletionService 执行（并发 2，见 QUEUE_CONTRACT）
 * - 统一事件日志：ready / error / completed / failed（含 queue、jobId、runId）
 * - 统一 worker 选项：concurrency / lockDuration / stalledInterval
 * - 统一重试策略：settings.backoffStrategy 消费 WorkerError.retryAfterMs（429），
 *   无 retry-after 时回退指数退避（见 errors/worker-errors.ts retryDelayMs）
 * - 统一超时：withJobTimeout 超时先 abort（signal 透传处理器 → adapter/engine 停止），
 *   等待底层任务停止后再抛错，杜绝「超时后后台继续执行」与 attempt 重叠
 */
import type { ConnectionOptions } from 'bullmq';
import { Worker } from 'bullmq';
import type { Redis } from 'ioredis';

import {
  QUEUE_CONTRACT,
  CHAT_QUEUE_NAME,
  WORKFLOW_RUN_QUEUE,
  RETRY_AFTER_MIN_MS,
  RETRY_AFTER_MAX_MS,
} from '@personal-os/queue-contract';
import type { WorkflowExecutionAdapter } from '../jobs/workflows/adapter.js';
import type { WorkerRunStore } from '../jobs/workflows/run-store.js';
import type { LoggerLike } from '../jobs/workflows/processor.js';
import { createWorkflowRunProcessor } from '../jobs/workflows/processor.js';
import type { ChatCompletionService } from '../jobs/chat/chat-completion.service.js';
import { createChatProcessor } from '../jobs/chat/chat.worker.js';
import { retryDelayMs } from '../errors/worker-errors.js';

export type WorkerConnection = ConnectionOptions | Redis;

export interface WorkerHandle {
  /** 队列名 */
  readonly queue: string;
  readonly worker: Worker;
  waitUntilReady(): Promise<void>;
  /** 优雅关闭：停止接单并等待在途任务；force=true 立即中断 */
  close(force?: boolean): Promise<void>;
}

function runIdOf(data: unknown): string | undefined {
  if (data && typeof data === 'object') {
    const runId = (data as { runId?: unknown }).runId;
    if (typeof runId === 'string') return runId;
  }
  return undefined;
}

function makeHandle(queue: string, worker: Worker, logger: LoggerLike): WorkerHandle {
  worker.on('ready', () => logger.info({ queue }, 'bullmq worker ready'));
  worker.on('error', (err) => logger.error({ queue, err: err.message }, 'bullmq worker error'));
  worker.on('completed', (job) =>
    logger.info({ queue, jobId: job.id, runId: runIdOf(job.data) }, 'bullmq job completed'),
  );
  worker.on('failed', (job, err) =>
    logger.error(
      { queue, jobId: job?.id, runId: runIdOf(job?.data), err: err.message },
      'bullmq job failed（重试耗尽或不可重试错误）',
    ),
  );
  return {
    queue,
    worker,
    waitUntilReady: () => worker.waitUntilReady(),
    close: (force = false) => worker.close(force),
  };
}

export interface CreateWorkflowWorkerOptions {
  store: WorkerRunStore;
  adapter: WorkflowExecutionAdapter;
  logger: LoggerLike;
  connection: WorkerConnection;
  /** 默认 QUEUE_CONTRACT.workflowRuns.concurrency（4） */
  concurrency?: number;
}

export function createWorkflowWorker(options: CreateWorkflowWorkerOptions): WorkerHandle {
  const entry = QUEUE_CONTRACT.workflowRuns;
  const worker = new Worker(
    WORKFLOW_RUN_QUEUE,
    withJobTimeout(
      createWorkflowRunProcessor({
        store: options.store,
        adapter: options.adapter,
        logger: options.logger,
      }),
      WORKFLOW_RUN_QUEUE,
      entry.timeoutMs,
    ),
    {
      connection: options.connection,
      concurrency: options.concurrency ?? entry.concurrency,
      lockDuration: entry.lockDurationMs,
      stalledInterval: entry.stalledIntervalMs,
      settings: { backoffStrategy: makeBackoffStrategy(entry.backoffMs) },
    },
  );
  return makeHandle(WORKFLOW_RUN_QUEUE, worker, options.logger);
}

export interface CreateChatWorkerOptions {
  service: ChatCompletionService;
  logger: LoggerLike;
  connection: WorkerConnection;
  /** 默认 QUEUE_CONTRACT.chatGeneration.concurrency（2） */
  concurrency?: number;
}

export function createChatWorker(options: CreateChatWorkerOptions): WorkerHandle {
  const entry = QUEUE_CONTRACT.chatGeneration;
  const worker = new Worker(
    CHAT_QUEUE_NAME,
    withJobTimeout(
      createChatProcessor({ service: options.service, logger: options.logger }),
      CHAT_QUEUE_NAME,
      entry.timeoutMs,
    ),
    {
      connection: options.connection,
      concurrency: options.concurrency ?? entry.concurrency,
      lockDuration: entry.lockDurationMs,
      stalledInterval: entry.stalledIntervalMs,
      settings: { backoffStrategy: makeBackoffStrategy(entry.backoffMs) },
    },
  );
  return makeHandle(CHAT_QUEUE_NAME, worker, options.logger);
}

/**
 * 429 retry-after 生效：BullMQ 每次失败后调用本策略计算重试延迟。
 * - err 为 WorkerError 且携带 retryAfterMs（429 头）→ 使用该值（clamp 上下限）；
 * - 无 retry-after → 指数退避（backoffMs * 2^(attemptsMade-1)），受上限封顶。
 */
export function makeBackoffStrategy(
  backoffMs: number,
): (attemptsMade: number, type?: string, err?: Error) => number {
  return (attemptsMade: number, _type?: string, err?: Error) =>
    retryDelayMs(attemptsMade, err, {
      backoffMs,
      minMs: RETRY_AFTER_MIN_MS,
      maxMs: RETRY_AFTER_MAX_MS,
    });
}

/**
 * 统一 job 超时（BullMQ 6 已移除入队侧 timeout 选项，由 worker 侧强制）：
 * 1. 超时到达 → 先 abort 传入的 signal（处理器/适配器/引擎协作式中止）；
 * 2. 等待底层任务真正结束（settle）——期间不再产生任何写库/节点结果；
 * 3. 底层结束后按超时语义抛可重试错误（BullMQ backoffStrategy 决定延迟）；
 * 4. BullMQ 自带 signal（worker close/锁丢失）同样联动 abort。
 *
 * 若执行器无法可靠中止（底层不响应 abort），最终仍会 settle（见 ChatCompletionService
 * / engine 的 abort 检查）；极端情况下由 BullMQ stalled 检测兜底，不会造成
 * 同一 Job 的重叠执行（BullMQ 对同一 job 串行处理）。
 */
function withJobTimeout<TJob extends { id?: string | undefined }>(
  processor: (job: TJob, token?: string, signal?: AbortSignal) => Promise<unknown>,
  queue: string,
  timeoutMs: number,
): (job: TJob, token?: string, signal?: AbortSignal) => Promise<unknown> {
  return async (job, token, signal) => {
    const controller = new AbortController();
    const onParentAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onParentAbort, { once: true });
    }

    const task = Promise.resolve().then(() => processor(job, token, controller.signal));
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await task;
    } catch (err) {
      if (timedOut) {
        // 超时：底层已被 abort 并停止（processor 已 settle 才走到这里），
        // 包装为可重试错误，由 backoffStrategy 决定重试延迟。
        const timeout = new Error(`${queue} job ${job.id ?? 'unknown'} 执行超时（${timeoutMs}ms）`);
        if (err instanceof Error) timeout.cause = err;
        throw timeout;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onParentAbort);
    }
  };
}
