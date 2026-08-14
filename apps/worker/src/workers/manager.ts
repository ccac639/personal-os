/**
 * Worker 装配与生命周期管理
 *
 * - startWorkers：并行等待全部 worker 就绪；单 worker 初始化失败按策略处理：
 *   · all（默认）：关闭全部已创建 handle（含失败/超时 handle）并抛
 *     WorkerStartupError（进程退出，由进程管理器重启）
 *   · partial：关闭失败 worker，继续运行健康 worker（日志明确告警）
 * - shutdown：停止接单 → 并行等待在途任务（全局 grace 预算）→ 关闭 worker →
 *   closables（Queue/SecretReader）→ Redis → Mongo
 * - shutdownGraceMs 为全局预算：多个 Worker 并行关闭共享同一预算，
 *   超过全局期限后统一 force close（不会每个 worker 各消耗一整轮 grace）
 * - 超时工具 withTimeout 供启动/关闭复用
 */
import type { LoggerLike } from '../jobs/workflows/processor.js';
import type { WorkerHandle } from './registration.js';
import { errorMessage } from '../errors/worker-errors.js';

export interface WorkerFactory {
  queue: string;
  /** 创建 worker handle（可能抛错：连接参数非法 / 构造失败） */
  create(): WorkerHandle | Promise<WorkerHandle>;
}

export interface StartWorkersOptions {
  logger: LoggerLike;
  /**
   * worker 工厂列表：factory 创建失败（构造期抛错）与 waitUntilReady 失败
   * 都纳入失败策略（all 关闭全部 / partial 跳过失败队列继续）。
   */
  factories: WorkerFactory[];
  /** 单 worker 创建+就绪等待上限 ms（默认 20_000） */
  initTimeoutMs?: number;
  /** all | partial（默认 all） */
  failurePolicy?: 'all' | 'partial';
}

export interface WorkerStartupFailure {
  queue: string;
  error: string;
}

export class WorkerStartupError extends Error {
  constructor(readonly failures: WorkerStartupFailure[]) {
    super(
      `Worker 初始化失败（${failures.length}）：${failures
        .map((f) => `${f.queue}: ${f.error}`)
        .join('；')}`,
    );
    this.name = 'WorkerStartupError';
  }
}

/** 启动全部 worker；返回保持运行的健康 worker 集合（factory 创建失败同样被策略覆盖） */
export async function startWorkers(options: StartWorkersOptions): Promise<WorkerHandle[]> {
  const timeoutMs = options.initTimeoutMs ?? 20_000;

  // 1. 并行创建全部 worker（factory 创建失败计入 failures；创建的 handle 保留以便关闭）
  const created = await Promise.allSettled(
    options.factories.map(async (factory) => {
      const handle = await withTimeout(
        Promise.resolve().then(() => factory.create()),
        timeoutMs,
        `worker ${factory.queue} 创建超时（${timeoutMs}ms）`,
      );
      return { handle, factory };
    }),
  );

  // 2. 并行等待就绪（waitUntilReady 失败计入 failures，但 handle 仍保留以便关闭）
  const ready = await Promise.allSettled(
    created.map((result) => {
      if (result.status === 'rejected') return Promise.reject(result.reason);
      const { handle, factory } = result.value;
      return withTimeout(
        handle.waitUntilReady(),
        timeoutMs,
        `worker ${factory.queue} 初始化超时（${timeoutMs}ms）`,
      ).then(() => handle);
    }),
  );

  const failures: WorkerStartupFailure[] = [];
  const healthy: WorkerHandle[] = [];
  const createdHandles: WorkerHandle[] = [];
  for (let i = 0; i < options.factories.length; i += 1) {
    const factory = options.factories[i]!;
    const createResult = created[i]!;
    if (createResult.status === 'rejected') {
      failures.push({ queue: factory.queue, error: errorMessage(createResult.reason) });
      continue;
    }
    createdHandles.push(createResult.value.handle);
    const readyResult = ready[i]!;
    if (readyResult.status === 'rejected') {
      failures.push({ queue: factory.queue, error: errorMessage(readyResult.reason) });
    } else {
      healthy.push(readyResult.value);
    }
  }

  if (failures.length === 0) return options.factories.length === 0 ? [] : healthy;

  const policy = options.failurePolicy ?? 'all';
  if (policy === 'all') {
    // all：关闭全部已创建 handle（含就绪与失败/超时的），避免半初始化资源悬挂
    await closeAll(createdHandles, options.logger);
    throw new WorkerStartupError(failures);
  }

  // partial：关闭失败的 worker（避免半初始化资源悬挂），健康 worker 继续
  const failedHandles = createdHandles.filter((h) => !healthy.includes(h));
  for (const handle of failedHandles) {
    try {
      await handle.close(true);
    } catch (err) {
      options.logger.warn(
        { queue: handle.queue, err: errorMessage(err) },
        'partial 策略：关闭失败 worker 异常',
      );
    }
  }
  options.logger.error(
    { failed: failures.map((f) => `${f.queue}: ${f.error}`) },
    '部分 worker 初始化失败，按 partial 策略继续运行健康 worker',
  );
  return healthy;
}

export interface Closable {
  name: string;
  close(): Promise<unknown>;
}

export interface ShutdownOptions {
  logger: LoggerLike;
  handles: WorkerHandle[];
  /**
   * 优雅关闭全局预算 ms（默认 30_000）：所有 worker 并行共享这一预算，
   * 超时后统一 force close；之后按顺序关闭 closables → Redis → Mongo。
   */
  graceMs?: number;
  /** 额外需关闭的资源（Queue / SecretReader），在 worker 之后、Redis 之前 */
  closables?: Closable[];
  redis?: { quit(): Promise<unknown> };
  mongo?: { disconnect(): Promise<unknown> };
}

/** 优雅关闭：停止接单 → 并行等待在途（全局 grace）→ worker → closables → Redis → Mongo */
export async function shutdown(options: ShutdownOptions): Promise<void> {
  const graceMs = options.graceMs ?? 30_000;
  options.logger.info(
    {
      queues: options.handles.map((h) => h.queue),
      graceMs,
      closables: options.closables?.map((c) => c.name),
    },
    'shutdown: 停止接单并等待在途任务',
  );

  // 1. 并行优雅关闭全部 worker（共享同一全局 grace 预算）
  const closeResults = await Promise.allSettled(
    options.handles.map((handle) =>
      withTimeout(handle.close(false), graceMs, `worker ${handle.queue} 优雅关闭超时`),
    ),
  );

  // 2. 超过全局期限的 worker 统一 force close（并行）
  await Promise.allSettled(
    options.handles.map((handle, i) => {
      const result = closeResults[i]!;
      if (result.status === 'rejected') {
        options.logger.warn(
          { queue: handle.queue, err: errorMessage(result.reason) },
          'shutdown: 优雅关闭超时，强制关闭 worker',
        );
        return handle.close(true);
      }
      return undefined;
    }),
  );

  // 3. closables（Queue / SecretReader）→ Redis → Mongo
  for (const closable of options.closables ?? []) {
    try {
      await closable.close();
    } catch (err) {
      options.logger.warn(
        { name: closable.name, err: errorMessage(err) },
        'shutdown: closable 关闭异常',
      );
    }
  }
  if (options.redis) {
    try {
      await options.redis.quit();
    } catch (err) {
      options.logger.warn({ err: errorMessage(err) }, 'shutdown: Redis 关闭异常');
    }
  }
  if (options.mongo) {
    try {
      await options.mongo.disconnect();
    } catch (err) {
      options.logger.warn({ err: errorMessage(err) }, 'shutdown: Mongo 断开异常');
    }
  }
}

export async function closeAll(handles: WorkerHandle[], logger: LoggerLike): Promise<void> {
  await shutdown({ logger, handles, graceMs: 10_000 });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
