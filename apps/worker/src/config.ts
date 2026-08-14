/**
 * Worker 环境配置（启动前校验，非法值列出问题并拒绝启动）
 *
 * 环境变量（.env.example 有注释说明）：
 * - MONGODB_URI / REDIS_URL / LOG_LEVEL：与 api 侧一致
 * - CHAT_ADAPTER：siliconflow（默认）| deterministic-mock
 * - WORKER_FAILURE_POLICY：all（任一 worker 初始化失败即退出，默认）| partial（继续运行健康 worker）
 * - WORKER_CONCURRENCY / CHAT_CONCURRENCY：workflow / chat worker 并发数
 * - WORKER_SHUTDOWN_GRACE_MS：优雅关闭等待在途任务上限
 * - WORKER_INIT_TIMEOUT_MS：worker 就绪等待上限
 * - WORKER_REDIS_CONNECT_TIMEOUT_MS / WORKER_MONGO_CONNECT_TIMEOUT_MS：连接超时
 */
export interface WorkerConfig {
  mongoUri: string;
  redisUrl: string;
  logLevel: string;
  chatAdapter: string;
  failurePolicy: 'all' | 'partial';
  workflowConcurrency: number;
  chatConcurrency: number;
  shutdownGraceMs: number;
  workerInitTimeoutMs: number;
  redisConnectTimeoutMs: number;
  mongoConnectTimeoutMs: number;
}

export interface ConfigIssue {
  key: string;
  message: string;
}

export const DEFAULT_WORKER_CONFIG: Omit<
  WorkerConfig,
  'mongoUri' | 'redisUrl' | 'logLevel' | 'chatAdapter'
> = {
  failurePolicy: 'all',
  workflowConcurrency: 4,
  chatConcurrency: 2,
  shutdownGraceMs: 30_000,
  workerInitTimeoutMs: 20_000,
  redisConnectTimeoutMs: 10_000,
  mongoConnectTimeoutMs: 5_000,
};

export const CHAT_ADAPTERS = ['siliconflow', 'sf', 'deterministic-mock', 'mock'] as const;

function parsePositiveInt(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  issues: ConfigIssue[],
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    issues.push({ key, message: `必须是正整数（收到 "${raw}"）` });
    return fallback;
  }
  return value;
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): {
  config: WorkerConfig;
  issues: ConfigIssue[];
} {
  const issues: ConfigIssue[] = [];

  const mongoUri = (env.MONGODB_URI ?? 'mongodb://localhost:27017/personal_os').trim();
  if (!/^mongodb(\+srv)?:\/\//.test(mongoUri)) {
    issues.push({
      key: 'MONGODB_URI',
      message: '非法 MongoDB URI（应形如 mongodb://... 或 mongodb+srv://...）',
    });
  }

  const redisUrl = (env.REDIS_URL ?? 'redis://localhost:6379').trim();
  if (!/^rediss?:\/\//.test(redisUrl)) {
    issues.push({
      key: 'REDIS_URL',
      message: '非法 Redis URI（应形如 redis://... 或 rediss://...）',
    });
  }

  const logLevel = (env.LOG_LEVEL ?? 'info').trim();
  if (!['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'].includes(logLevel)) {
    issues.push({ key: 'LOG_LEVEL', message: `非法日志级别（收到 "${logLevel}"）` });
  }

  const chatAdapter = (env.CHAT_ADAPTER ?? 'siliconflow').trim();
  if (!(CHAT_ADAPTERS as readonly string[]).includes(chatAdapter)) {
    issues.push({
      key: 'CHAT_ADAPTER',
      message: `未实现的 Chat 适配器（收到 "${chatAdapter}"，可选 ${CHAT_ADAPTERS.join(' | ')}）`,
    });
  }

  const failurePolicyRaw = (env.WORKER_FAILURE_POLICY ?? 'all').trim();
  if (failurePolicyRaw !== 'all' && failurePolicyRaw !== 'partial') {
    issues.push({ key: 'WORKER_FAILURE_POLICY', message: '可选 all | partial' });
  }

  return {
    config: {
      mongoUri,
      redisUrl,
      logLevel,
      chatAdapter,
      failurePolicy: failurePolicyRaw === 'partial' ? 'partial' : 'all',
      workflowConcurrency: parsePositiveInt(
        env,
        'WORKER_CONCURRENCY',
        DEFAULT_WORKER_CONFIG.workflowConcurrency,
        issues,
      ),
      chatConcurrency: parsePositiveInt(
        env,
        'CHAT_CONCURRENCY',
        DEFAULT_WORKER_CONFIG.chatConcurrency,
        issues,
      ),
      shutdownGraceMs: parsePositiveInt(
        env,
        'WORKER_SHUTDOWN_GRACE_MS',
        DEFAULT_WORKER_CONFIG.shutdownGraceMs,
        issues,
      ),
      workerInitTimeoutMs: parsePositiveInt(
        env,
        'WORKER_INIT_TIMEOUT_MS',
        DEFAULT_WORKER_CONFIG.workerInitTimeoutMs,
        issues,
      ),
      redisConnectTimeoutMs: parsePositiveInt(
        env,
        'WORKER_REDIS_CONNECT_TIMEOUT_MS',
        DEFAULT_WORKER_CONFIG.redisConnectTimeoutMs,
        issues,
      ),
      mongoConnectTimeoutMs: parsePositiveInt(
        env,
        'WORKER_MONGO_CONNECT_TIMEOUT_MS',
        DEFAULT_WORKER_CONFIG.mongoConnectTimeoutMs,
        issues,
      ),
    },
    issues,
  };
}

export class WorkerConfigError extends Error {
  constructor(readonly issues: ConfigIssue[]) {
    super(
      `Worker 配置非法，拒绝启动：\n${issues.map((i) => `- ${i.key}: ${i.message}`).join('\n')}`,
    );
    this.name = 'WorkerConfigError';
  }
}
