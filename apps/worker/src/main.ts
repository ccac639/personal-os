/**
 * Personal OS Worker 启动入口（workflow-runs + chat-generation 双线）
 *
 * 生命周期（可测试部分见 src/workers/manager.ts / src/config.ts）：
 * 1. 校验环境配置（非法 → 打印问题并退出，由进程管理器重启）
 * 2. 连接 MongoDB → 创建 Redis
 * 3. 装配 workflow-runs 与 chat-generation 两个 Worker（并发见 QUEUE_CONTRACT）
 * 4. 多 worker 初始化：任一失败按 WORKER_FAILURE_POLICY 处理
 *    （all=全部关闭退出；partial=继续运行健康 worker；factory 创建失败同样覆盖）
 * 5. 优雅退出：SIGINT/SIGTERM → 停止接单并等待在途任务（全局 grace 上限）→
 *    超预算 abort 在途 + force close → SecretReader → Redis → Mongo
 * 6. 进程级兜底：uncaughtException / unhandledRejection → 记录后有序退出，
 *    由进程管理器重启（不继续运行，避免状态损坏）
 */
import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { pino } from 'pino';

import {
  SILICONFLOW_API_KEY_REDIS_KEY,
  WORKFLOW_RUN_QUEUE,
  CHAT_QUEUE_NAME,
} from '@personal-os/queue-contract';
import { loadWorkerConfig, WorkerConfigError } from './config.js';
import { errorMessage } from './errors/worker-errors.js';
import { LocalDeterministicAdapter, MongoWorkerRunStore } from './jobs/workflows/index.js';
import { MongoChatStore } from './jobs/chat/chat-store.mongo.js';
import { ChatCompletionService } from './jobs/chat/chat-completion.service.js';
import { resolveAdapter } from './jobs/chat/chat.worker.js';
import { RedisSecretReader } from './secrets/secret-reader.js';
import {
  createWorkflowWorker,
  createChatWorker,
  type WorkerHandle,
} from './workers/registration.js';
import { shutdown, startWorkers } from './workers/manager.js';
import { WorkerMetrics } from './metrics/worker-metrics.js';
import { QueueDepthSampler } from './metrics/queue-depth.js';

const { config, issues } = loadWorkerConfig();
if (issues.length > 0) {
  // 配置非法：不尝试连接任何资源，直接退出（进程管理器负责重启）

  console.error(new WorkerConfigError(issues).message);
  process.exit(1);
}

const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { singleLine: true, translateTime: 'SYS:HH:MM:ss' },
  },
});

let redis: Redis | null = null;
let secretReader: RedisSecretReader | null = null;
let handles: WorkerHandle[] = [];
let shuttingDown = false;
let depthSampler: QueueDepthSampler | null = null;

// 轻量指标（worker-local，pino 日志字段采集；见 metrics/worker-metrics.ts）
const metrics = new WorkerMetrics();

async function main(): Promise<void> {
  logger.info(
    {
      mongoUri: redactUri(config.mongoUri),
      redisUrl: redactUri(config.redisUrl),
      chatAdapter: config.chatAdapter,
      failurePolicy: config.failurePolicy,
    },
    'Personal OS Worker 启动',
  );

  // 1. 连接 MongoDB（失败快速退出，由进程管理器重试）
  await mongoose.connect(config.mongoUri, {
    serverSelectionTimeoutMS: config.mongoConnectTimeoutMs,
  });
  logger.info('MongoDB 已连接');

  // 2. Redis（BullMQ 连接 + SecretReader 共享；maxRetriesPerRequest=null 为 BullMQ 必需）
  redis = new Redis(config.redisUrl, {
    maxRetriesPerRequest: null,
    connectTimeout: config.redisConnectTimeoutMs,
  });
  redis.on('error', (err) => logger.error({ err: err.message }, 'Redis 连接错误'));
  secretReader = new RedisSecretReader(redis);

  // 3. 装配 workflow-runs worker
  const workflowStore = new MongoWorkerRunStore();
  const workflowAdapter = new LocalDeterministicAdapter({
    loadWorkflow: async (id) => workflowStore.getWorkflowById(id),
    isRunCancelled: async (runId) => {
      const run = await workflowStore.getRunById(runId);
      return run?.status === 'cancelled';
    },
  });

  // 4. 装配 chat-generation worker（API Key 经 SecretReader 从共享 Redis 读取，
  //    不入队/不落日志；resolveAdapter 不再创建隐藏 Redis 连接）
  const chatStore = new MongoChatStore();
  const chatAdapter = resolveAdapter(process.env, {
    getApiKey: () => secretReader!.get(SILICONFLOW_API_KEY_REDIS_KEY),
  });
  const chatService = new ChatCompletionService(chatStore, chatAdapter);

  // 5. 多 worker 就绪（失败策略见 startWorkers；factory 创建失败同样被覆盖）
  handles = await startWorkers({
    logger,
    factories: [
      {
        queue: WORKFLOW_RUN_QUEUE,
        create: () =>
          createWorkflowWorker({
            store: workflowStore,
            adapter: workflowAdapter,
            logger,
            connection: redis!,
            concurrency: config.workflowConcurrency,
            metrics,
          }),
      },
      {
        queue: CHAT_QUEUE_NAME,
        create: () =>
          createChatWorker({
            service: chatService,
            logger,
            connection: redis!,
            concurrency: config.chatConcurrency,
            metrics,
          }),
      },
    ],
    initTimeoutMs: config.workerInitTimeoutMs,
    failurePolicy: config.failurePolicy,
  });

  // 6. 队列深度采样（周期结构化日志：depth + metrics 快照；shutdown 时 dispose）
  depthSampler = new QueueDepthSampler({
    queueNames: [WORKFLOW_RUN_QUEUE, CHAT_QUEUE_NAME],
    connection: redis,
    intervalMs: config.metricsIntervalMs,
    logger,
    metricsSnapshot: () => metrics.snapshot(),
  });
  depthSampler.start();

  // 7. 进程级兜底：记录后有序退出（不继续运行，避免状态损坏）
  process.on('uncaughtException', (err) => {
    logger.fatal({ err: err.message }, '未捕获异常，进入有序退出');
    void runShutdown(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: errorMessage(reason) }, '未处理的 Promise 拒绝，进入有序退出');
    void runShutdown(1);
  });

  // 7. 优雅退出信号
  process.on('SIGINT', () => void runShutdown(0, 'SIGINT'));
  process.on('SIGTERM', () => void runShutdown(0, 'SIGTERM'));

  logger.info(
    { queues: handles.map((h) => h.queue) },
    'Personal OS Worker 启动完成（workflow-runs + chat-generation）',
  );
}

async function runShutdown(exitCode: number, signal?: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  if (signal) logger.info({ signal }, '收到退出信号，开始优雅关闭');
  try {
    await shutdown({
      logger,
      handles,
      graceMs: config.shutdownGraceMs,
      closables: [
        ...(secretReader ? [{ name: 'secret-reader', close: () => secretReader!.close() }] : []),
        ...(depthSampler
          ? [{ name: 'queue-depth-sampler', close: () => depthSampler!.dispose() }]
          : []),
      ],
      redis: redis ?? undefined,
      mongo: mongoose,
    });
  } catch (err) {
    logger.error({ err: errorMessage(err) }, '关闭过程中出现异常');
  }
  process.exit(exitCode);
}

main().catch(async (err: unknown) => {
  logger.error({ err: errorMessage(err) }, 'Worker 启动失败');
  await runShutdown(1);
});

/** 连接串脱敏：去掉可能的凭据（user:pass@），避免日志泄露 */
function redactUri(uri: string): string {
  try {
    const parsed = new URL(uri);
    if (parsed.username) {
      parsed.username = '***';
      parsed.password = '***';
    }
    return parsed.toString();
  } catch {
    return uri.replace(/\/\/[^@/]+@/, '//***:***@');
  }
}
