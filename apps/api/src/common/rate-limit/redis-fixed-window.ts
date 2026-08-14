/**
 * Redis 固定窗口限流器（分布式安全，多实例共享计数）。
 *
 * 语义：每个 key 在 windowMs 窗口内最多 max 次请求。
 * 实现：INCR + EXPIRE（首次 INCR 后附带 EXPIRE 设置 TTL），Redis 原子操作，
 * 窗口边界按 key 创建时间对齐（固定窗口），无需 Lua 脚本即可安全工作。
 *
 * 依赖注入友好：构造函数接受一个最小 Redis 接口（incr/expire/pipeline），
 * 便于在单测中用内存 fake 替换真实 ioredis 客户端。
 */
export interface RateLimitRedisLike {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
}

export class RedisFixedWindowRateLimiter {
  constructor(
    private readonly windowMs: number,
    private readonly max: number,
    private readonly redis: RateLimitRedisLike,
    private readonly keyPrefix = 'ratelimit:',
    private readonly now: () => number = Date.now,
  ) {
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
      throw new Error('windowMs 必须为正整数');
    }
    if (!Number.isSafeInteger(max) || max <= 0) {
      throw new Error('max 必须为正整数');
    }
  }

  /** 记录一次命中并判断是否放行；超限返回 false（调用方应返回 429）。 */
  async allow(key: string): Promise<boolean> {
    const fullKey = `${this.keyPrefix}${key}`;
    const ttlSeconds = Math.max(1, Math.ceil(this.windowMs / 1000));

    const count = await this.redis.incr(fullKey);
    if (count === 1) {
      // 首次命中：设置过期，避免长期占用 Redis 内存
      await this.redis.expire(fullKey, ttlSeconds);
    }
    return count <= this.max;
  }

  /** 构造用于生成日志/指标可读性的完整 Redis key（不泄露内容）。 */
  keyName(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}
