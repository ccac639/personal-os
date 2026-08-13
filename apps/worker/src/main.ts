/**
 * Personal OS Worker 启动入口（workflows 执行线）
 *
 * - 连接 MongoDB（workflows / workflow_runs 集合）
 * - 注册 BullMQ `workflow-runs` Worker（LocalDeterministicAdapter）
 * - 进程级兜底：未捕获异常仅记录日志并继续运行，不因单个任务崩溃整个进程
 * - 优雅退出：SIGINT/SIGTERM 时关闭 Worker 与连接
 */
import mongoose from 'mongoose';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';

import {
  WORKFLOW_RUN_QUEUE,
  createWorkflowRunProcessor,
  LocalDeterministicAdapter,
  MongoWorkerRunStore,
} from './jobs/workflows/index.js';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
  },
});

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/personal_os';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

async function main(): Promise<void> {
  // 1. 连接 MongoDB（失败快速退出，由进程管理器重试）
  await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  logger.info('MongoDB 已连接（workflows 执行线）');

  const store = new MongoWorkerRunStore();
  const adapter = new LocalDeterministicAdapter({
    loadWorkflow: async (id) => store.getWorkflowById(id),
    isRunCancelled: async (runId) => {
      const run = await store.getRunById(runId);
      return run?.status === 'cancelled';
    },
  });

  // 2. 注册 BullMQ Worker
  const redis = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const worker = new Worker(WORKFLOW_RUN_QUEUE, createWorkflowRunProcessor({ store, adapter, logger }), {
    connection: redis,
    concurrency: 4,
  });

  worker.on('ready', () => logger.info(`BullMQ Worker 就绪：${WORKFLOW_RUN_QUEUE}`));
  worker.on('error', (err) => logger.error({ err: err.message }, 'BullMQ Worker 错误'));
  worker.on('failed', (job, err) => {
    logger.error(
      { jobId: job?.id, runId: job?.data?.runId, err: err.message },
      'workflow-run job 失败（进入重试/死信）',
    );
  });

  // 3. 进程级兜底：未捕获异常仅记录，不让单个任务崩溃整个进程
  process.on('unhandledRejection', (reason) => {
    logger.error({ err: String(reason) }, '未处理的 Promise 拒绝（已忽略，进程继续）');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err: err.message }, '未捕获异常（已忽略，进程继续）');
  });

  // 4. 优雅退出
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`收到 ${signal}，正在关闭…`);
    await worker.close();
    await redis.quit().catch(() => undefined);
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  logger.info('Personal OS Worker（workflows 执行线）启动完成');
}

main().catch((err: unknown) => {
  logger.error({ err: err instanceof Error ? err.message : String(err) }, 'Worker 启动失败');
  process.exit(1);
});
