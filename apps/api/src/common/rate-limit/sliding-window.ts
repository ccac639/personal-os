/**
 * 内存滑动窗口限流器（单实例本地保护，不用于分布式生产限流）。
 *
 * 语义：每个 key（IP + API Key 指纹）在 windowMs 内最多 max 次请求。
 * 实现：按时间戳数组滑动窗口；allow() 在 key 数量超阈值（1000）时惰性触发
 * cleanup() 清理过期条目，长期运行内存有界，无需外部定时器。
 */
export class SlidingWindowRateLimiter {
  /** key → 命中时间戳（升序） */
  private readonly hits = new Map<string, number[]>();

  /** 达到该 key 数量时惰性触发 cleanup，防止长期运行内存膨胀（无定时器） */
  private static readonly CLEANUP_THRESHOLD = 1_000;

  constructor(
    private readonly windowMs: number,
    private readonly max: number,
  ) {
    if (!Number.isSafeInteger(windowMs) || windowMs <= 0) {
      throw new Error('windowMs 必须为正整数');
    }
    if (!Number.isSafeInteger(max) || max <= 0) {
      throw new Error('max 必须为正整数');
    }
  }

  /**
   * 记录一次命中并判断是否放行。
   * 返回 true = 放行；false = 超限（调用方应返回 429）。
   */
  allow(key: string, now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    const window = (this.hits.get(key) ?? []).filter((t) => t > cutoff);

    if (window.length >= this.max) {
      this.hits.set(key, window);
      return false;
    }

    window.push(now);
    this.hits.set(key, window);
    if (this.hits.size >= SlidingWindowRateLimiter.CLEANUP_THRESHOLD) {
      this.cleanup(now);
    }
    return true;
  }

  /** 清理全部过期条目；返回清理掉的 key 数量 */
  cleanup(now: number = Date.now()): number {
    const cutoff = now - this.windowMs;
    let removed = 0;
    for (const [key, window] of this.hits) {
      const fresh = window.filter((t) => t > cutoff);
      if (fresh.length === 0) {
        this.hits.delete(key);
        removed += 1;
      } else if (fresh.length !== window.length) {
        this.hits.set(key, fresh);
      }
    }
    return removed;
  }

  /** 当前跟踪的 key 数量（含未过期与刚过期的，cleanup 后为准） */
  size(): number {
    return this.hits.size;
  }

  reset(): void {
    this.hits.clear();
  }
}
