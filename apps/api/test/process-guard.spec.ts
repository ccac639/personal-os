import { afterEach, describe, expect, it, vi } from 'vitest';

import { installProcessGuards } from '../src/common/process-guard.js';

/**
 * 进程级崩溃守卫测试（ADR-0016）：
 * - uncaughtException / unhandledRejection → 结构化日志（traceId + err）+ 受控退出
 * - 受控退出路径：先 app.close()（优雅关闭 Nest 生命周期）再 exit(1)
 * - app.close 失败仍退出（不无限挂起）
 * - dispose 移除监听（不二次触发）
 */
describe('进程级崩溃守卫', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setup() {
    const exits: number[] = [];
    const closes: string[] = [];
    const logger = { fatal: vi.fn(), error: vi.fn() };
    const app = {
      close: vi.fn(async () => {
        closes.push('close');
      }),
    };
    const guard = installProcessGuards(app as never, logger as never, {
      exit: (code) => {
        exits.push(code);
      },
    });
    return { guard, exits, closes, logger, app };
  }

  it('uncaughtException：fatal 结构化日志（traceId + err）+ app.close + exit(1)', async () => {
    const { guard, exits, closes, logger } = setup();

    process.emit('uncaughtException', new Error('boom'));

    await vi.waitFor(() => expect(closes).toHaveLength(1));
    expect(exits).toEqual([1]);
    expect(logger.fatal).toHaveBeenCalledTimes(1);
    const arg = (logger.fatal as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      traceId?: string;
      err?: unknown;
    };
    expect(arg.traceId).toBeTruthy();
    expect(arg.err).toBeInstanceOf(Error);
    expect(logger.error).not.toHaveBeenCalled();
    guard.dispose();
  });

  it('unhandledRejection：error 结构化日志 + 受控退出', async () => {
    const { guard, exits, closes, logger } = setup();

    process.emit('unhandledRejection', new Error('async boom'));

    await vi.waitFor(() => expect(closes).toHaveLength(1));
    expect(exits).toEqual([1]);
    expect(logger.error).toHaveBeenCalledTimes(1);
    const arg = (logger.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as {
      traceId?: string;
      err?: unknown;
    };
    expect(arg.traceId).toBeTruthy();
    expect(arg.err).toBeInstanceOf(Error);
    expect(logger.fatal).not.toHaveBeenCalled();
    guard.dispose();
  });

  it('app.close 失败：记录优雅关闭失败日志，仍 exit(1)（不无限挂起）', async () => {
    const exits: number[] = [];
    const logger = { fatal: vi.fn(), error: vi.fn() };
    const app = {
      close: vi.fn(async () => {
        throw new Error('close failed');
      }),
    };
    const guard = installProcessGuards(app as never, logger as never, {
      exit: (code) => {
        exits.push(code);
      },
    });

    process.emit('uncaughtException', new Error('boom'));

    await vi.waitFor(() => expect(exits).toEqual([1]));
    const errorArgs = (logger.error as ReturnType<typeof vi.fn>).mock.calls;
    expect(errorArgs.some((c) => String(c[1]).includes('优雅关闭失败'))).toBe(true);
    guard.dispose();
  });

  it('dispose 移除监听：uncaughtException 监听器计数回到安装前', () => {
    const before = process.listenerCount('uncaughtException');
    const { guard, exits, logger } = setup();
    expect(process.listenerCount('uncaughtException')).toBe(before + 1);

    guard.dispose();
    expect(process.listenerCount('uncaughtException')).toBe(before);
    expect(logger.fatal).not.toHaveBeenCalled();
    expect(exits).toEqual([]);
  });
});
