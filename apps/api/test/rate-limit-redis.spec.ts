import { describe, expect, it } from 'vitest';

import {
  RedisFixedWindowRateLimiter,
  type RateLimitRedisLike,
} from '../src/common/rate-limit/redis-fixed-window.js';

/** 内存 fake Redis：模拟 INCR/EXPIRE 语义（键值 + TTL，按 now() 推进过期） */
class FakeRedis implements RateLimitRedisLike {
  private readonly values = new Map<string, number>();
  private readonly expiresAt = new Map<string, number>();

  constructor(private now: () => number) {}

  async incr(key: string): Promise<number> {
    this.purge();
    const next = (this.values.get(key) ?? 0) + 1;
    this.values.set(key, next);
    return next;
  }

  async expire(key: string, seconds: number): Promise<number> {
    this.expiresAt.set(key, this.now() + seconds * 1000);
    return 1;
  }

  /** 当前未过期的键数量（仅测试断言用） */
  liveKeys(): number {
    this.purge();
    return this.values.size;
  }

  private purge(): void {
    const now = this.now();
    for (const [key, at] of this.expiresAt) {
      if (at <= now) {
        this.values.delete(key);
        this.expiresAt.delete(key);
      }
    }
  }
}

describe('RedisFixedWindowRateLimiter（单元）', () => {
  it('窗口内超限 → 拒绝；窗口过期后恢复', async () => {
    const fake = new FakeRedis(() => now);
    let now = 1000;
    const limiter = new RedisFixedWindowRateLimiter(1000, 3, fake, 'rl:', () => now);

    expect(await limiter.allow('k')).toBe(true);
    expect(await limiter.allow('k')).toBe(true);
    expect(await limiter.allow('k')).toBe(true);
    expect(await limiter.allow('k')).toBe(false); // 第 4 次超限

    // 窗口（1s）过期后 Redis 键被清理 → 恢复
    now = 2100;
    expect(await limiter.allow('k')).toBe(true);
  });

  it('不同 key 独立计数', async () => {
    const fake = new FakeRedis(() => 0);
    const limiter = new RedisFixedWindowRateLimiter(1000, 1, fake, 'rl:', () => 0);

    expect(await limiter.allow('a')).toBe(true);
    expect(await limiter.allow('b')).toBe(true);
    expect(await limiter.allow('a')).toBe(false);
    expect(await limiter.allow('b')).toBe(false);
  });

  it('首次命中设置 TTL（expire 调用），避免 Redis 内存泄漏', async () => {
    let expireCalls = 0;
    const fake: RateLimitRedisLike = {
      async incr() {
        return 1;
      },
      async expire() {
        expireCalls += 1;
        return 1;
      },
    };
    const limiter = new RedisFixedWindowRateLimiter(60_000, 100, fake, 'rl:', () => 0);
    await limiter.allow('k');
    expect(expireCalls).toBe(1);
  });

  it('非首次命中不重复设置 TTL', async () => {
    let incrCalls = 0;
    let expireCalls = 0;
    const fake: RateLimitRedisLike = {
      async incr() {
        incrCalls += 1;
        return incrCalls; // 1, 2, ...
      },
      async expire() {
        expireCalls += 1;
        return 1;
      },
    };
    const limiter = new RedisFixedWindowRateLimiter(60_000, 100, fake, 'rl:', () => 0);
    await limiter.allow('k');
    await limiter.allow('k');
    expect(expireCalls).toBe(1); // 仅首次
  });

  it('keyName 带前缀，便于日志与运维排查', () => {
    const fake = new FakeRedis(() => 0);
    const limiter = new RedisFixedWindowRateLimiter(1000, 10, fake, 'ratelimit:', () => 0);
    expect(limiter.keyName('1.2.3.4|anonymous')).toBe('ratelimit:1.2.3.4|anonymous');
  });

  it('非法参数 → 抛错', () => {
    const fake = new FakeRedis(() => 0);
    expect(() => new RedisFixedWindowRateLimiter(0, 10, fake)).toThrow();
    expect(() => new RedisFixedWindowRateLimiter(1000, 0, fake)).toThrow();
  });
});
