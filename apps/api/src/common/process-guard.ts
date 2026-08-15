/**
 * 进程级崩溃守卫 —— unhandledRejection / uncaughtException
 *
 * 背景（ADR-0016）：HTTP 层异常已由 AllExceptionsFilter 全覆盖，但进程级
 * 未捕获错误此前无守卫 → 静默崩溃且无任何日志。本模块在 bootstrap 早期注册：
 *
 * - unhandledRejection：结构化日志（traceId + err）后触发受控退出（G2-A 默认）；
 * - uncaughtException：Node 默认会崩溃退出；注册 handler 后不会自动退出，
 *   必须显式受控退出（G1-A 默认，绝不 resume 继续运行，防止状态漂移）。
 *
 * 受控退出路径：先 app.close() 触发 Nest 生命周期（onApplicationShutdown →
 * Redis quit + Mongoose disconnect），再 exit(1)；不立即 process.exit，
 * 不丢在途请求的优雅收尾机会。
 *
 * 依赖注入 exit / close 以便测试 mock；真实场景由 main.ts 传入 app 与
 * nestjs-pino Logger。
 */
import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** 守卫所需的最小 logger 面（nestjs-pino Logger / NestJS Logger 均满足） */
export interface ProcessGuardLogger {
  fatal(message: unknown, ...optionalParams: unknown[]): void;
  error(message: unknown, ...optionalParams: unknown[]): void;
}

export interface ProcessGuardOptions {
  /** 退出实现（测试注入 fake；默认 process.exit） */
  exit?: (code: number) => void;
}

export interface ProcessGuardHandle {
  /** 移除已注册的监听器（测试清理 / 热重载场景） */
  dispose(): void;
}

export function installProcessGuards(
  app: Pick<NestFastifyApplication, 'close'>,
  logger: ProcessGuardLogger,
  options: ProcessGuardOptions = {},
): ProcessGuardHandle {
  const exit = options.exit ?? ((code: number): void => process.exit(code));

  const handleFatal =
    (kind: 'uncaughtException' | 'unhandledRejection') =>
    (error: unknown): void => {
      const traceId = randomUUID();
      if (kind === 'uncaughtException') {
        logger.fatal({ traceId, err: error }, 'uncaughtException：进程将受控退出');
      } else {
        logger.error({ traceId, err: error }, 'unhandledRejection：进程将受控退出');
      }
      void (async () => {
        try {
          // onApplicationShutdown：Redis quit + Mongoose disconnect（@nestjs/mongoose 内置）
          await app.close();
        } catch (closeErr) {
          logger.error({ traceId, err: closeErr }, '优雅关闭失败，仍将退出');
        } finally {
          exit(1);
        }
      })();
    };

  const onUnhandledRejection = handleFatal('unhandledRejection');
  const onUncaughtException = handleFatal('uncaughtException');
  process.on('unhandledRejection', onUnhandledRejection);
  process.on('uncaughtException', onUncaughtException);

  return {
    dispose(): void {
      process.off('unhandledRejection', onUnhandledRejection);
      process.off('uncaughtException', onUncaughtException);
    },
  };
}
