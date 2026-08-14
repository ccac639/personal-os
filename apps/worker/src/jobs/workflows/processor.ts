/**
 * BullMQ `workflow-runs` 队列常量与 Worker 处理器
 *
 * - 队列名与 api 端 workflow.queue.ts 保持一致（镜像常量，见
 *   apps/api/test/queue-contract.spec.ts）
 * - 处理器职责：接收 runId → 加载运行与工作流 → 经 Adapter 执行 →
 *   结果落库（结构化日志 / 失败可恢复状态）
 * - 错误语义：
 *   · 非法负载（缺 runId）→ 抛不可重试错误，job 留在 failed 集合（不重试、不静默）
 *   · 业务失败（workflow 执行失败 / 工作流不存在）→ 落库 failed（不重试）
 *   · 基础设施错误（DB / Redis 抖动 / adapter 抛错）→ 落库 failed + 抛错，
 *     由 BullMQ 指数退避重试
 * - 日志上下文统一包含 queue / jobId / runId，不含提示词全文与密钥
 * - 单个 job 的异常不会影响 Worker 进程（BullMQ 内建隔离）
 */
import type { Job, Processor } from 'bullmq';

import type { WorkflowExecutionAdapter, AdapterExecuteResult } from './adapter.js';
import type { WorkerRunStore } from './run-store.js';
import { WORKFLOW_RUN_QUEUE, WORKFLOW_RUN_JOB } from '@personal-os/queue-contract';
import {
  isRetryableError,
  errorMessage,
  WorkerError,
  toBullMqError,
} from '../../errors/worker-errors.js';

export { WORKFLOW_RUN_QUEUE, WORKFLOW_RUN_JOB };

export interface WorkflowRunJobData {
  runId: string;
}

export interface WorkflowRunProcessorDeps {
  store: WorkerRunStore;
  adapter: WorkflowExecutionAdapter;
  logger?: LoggerLike;
}

export interface ProcessResult {
  status: 'success' | 'failed' | 'cancelled' | 'skipped';
  runId: string;
}

/** 创建 workflow-run 处理器（依赖注入，便于测试）；signal 透传 adapter 实现协作式中止 */
export function createWorkflowRunProcessor(deps: WorkflowRunProcessorDeps): Processor {
  const logger = deps.logger ?? nullLogger;

  return async (
    job: Job<WorkflowRunJobData>,
    _token?: string,
    signal?: AbortSignal,
  ): Promise<ProcessResult> => {
    const data = job.data;
    const base = {
      queue: WORKFLOW_RUN_QUEUE,
      jobId: job.id,
      runId: data?.runId,
    };

    // 非法负载（队列投毒防护）：runId 缺失无处落库，抛不可重试错误，
    // 让 BullMQ 把 job 留在 failed 集合可见（不进入正常完成，避免静默吞掉脏数据）
    if (!data || typeof data.runId !== 'string' || data.runId.length === 0) {
      logger.warn(
        { ...base, err: `缺少 runId（${job.id ?? 'unknown'}）` },
        'workflow-run invalid job',
      );
      throw WorkerError.nonRetryable(`workflow-run job 缺少 runId（job ${job.id ?? 'unknown'}）`);
    }

    try {
      const { runId } = data;

      // 1. 加载运行记录
      const run = await deps.store.getRunById(runId);
      if (!run) {
        throw new Error(`运行记录不存在：${runId}`);
      }
      // 已取消 / 已成功：无需再次执行（重复消费保护）
      if (run.status === 'cancelled' || run.status === 'success') {
        logger.info({ ...base, status: run.status }, 'workflow-run skipped');
        return { status: 'skipped', runId };
      }

      // 2. 加载工作流
      const workflow = await deps.store.getWorkflowById(run.workflowId);
      if (!workflow) {
        // 业务失败：不重试
        await deps.store.markFailed(runId, `工作流不存在：${run.workflowId}`);
        logger.warn({ ...base, workflowId: run.workflowId }, 'workflow missing, run failed');
        return { status: 'failed', runId };
      }

      // 3. 标记 running + 记录尝试次数
      const startedAt = new Date().toISOString();
      await deps.store.markRunning(runId, startedAt);
      await deps.store.markAttempts(runId, job.attemptsMade + 1);
      logger.info(
        { ...base, workflowId: workflow.id, attempt: job.attemptsMade + 1 },
        'workflow-run started',
      );

      // 4. 执行（执行输入 = 脱敏后的 inputSummary；signal 透传 adapter/engine）
      let result: AdapterExecuteResult;
      try {
        result = await deps.adapter.execute(
          {
            runId,
            snapshot: workflow,
            params: { variables: run.inputSummary },
            runConfig: workflow.runConfig,
          },
          signal,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        // 基础设施错误：落库失败状态 + 抛错触发 BullMQ 重试
        await deps.store.markFailed(runId, `执行异常：${message}`).catch(() => undefined);
        logger.error({ ...base, err: message }, 'workflow-run infra error');
        throw e;
      }

      // 5. 结果落库（业务失败不重试）
      const finishedAt = new Date().toISOString();
      await deps.store.completeRun(runId, {
        status: result.status,
        outputSummary: result.outputSummary,
        nodeResults: result.nodeResults,
        logs: result.logs,
        handledNodes: result.handledNodes,
        failedNodeId: result.failedNodeId,
        error: result.error,
        durationMs: result.durationMs,
        finishedAt,
      });

      logger.info(
        {
          ...base,
          status: result.status,
          durationMs: result.durationMs,
          nodes: result.nodeResults.length,
        },
        'workflow-run finished',
      );
      return { status: result.status, runId };
    } catch (err) {
      // 可重试 → 上抛（BullMQ backoffStrategy 重试）；不可重试（输入/配置损坏）
      // → 包装为 UnrecoverableError 上抛，job 进入 failed 集合只执行一次
      if (isRetryableError(err)) throw err;
      logger.warn(
        { ...base, err: errorMessage(err) },
        'workflow-run unrecoverable, will not retry',
      );
      throw toBullMqError(err);
    }
  };
}

export interface LoggerLike {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
  error(obj: Record<string, unknown>, msg: string): void;
}

const nullLogger: LoggerLike = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};
