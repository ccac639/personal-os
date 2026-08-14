/**
 * Redis 响应缓存：TTL + 防踩踏（singleflight）。
 *
 * 语义：缓存键 = 路由 + 查询字符串哈希；命中直接返回存储的响应体；
 * 未命中时只允许一个并发请求执行原逻辑（同键 in-flight 去重），
 * 其余请求等待其结果并共享写入，防止缓存击穿（thundering herd）。
 *
 * 约束（红线 5）：仅缓存公开/无凭据 GET；含密钥或用户私密数据的端点
 * 不得使用本缓存——由 @Cacheable 装饰器使用方负责保证。
 */
export interface CacheStoreLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<unknown>;
}

export class ResponseCache {
  /** key → 进行中的 promise（singleflight 去重） */
  private readonly inFlight = new Map<string, Promise<string>>();

  constructor(
    private readonly store: CacheStoreLike,
    private readonly keyPrefix = 'cache:',
  ) {}

  /** 生成稳定缓存键：路由 + 查询参数规范化（顺序无关）。 */
  keyFor(path: string, query: Record<string, unknown>): string {
    const qs = Object.keys(query)
      .sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(query[k]))}`)
      .join('&');
    return `${this.keyPrefix}${path}${qs ? `?${qs}` : ''}`;
  }

  /**
   * 缓存读取 + 防踩踏写入。
   * @param key 缓存键（keyFor 生成）
   * @param ttlMs 有效期
   * @param loader 未命中时执行原逻辑（应返回响应体字符串）
   */
  async wrap(key: string, ttlMs: number, loader: () => Promise<string>): Promise<string> {
    const hit = await this.store.get(key);
    if (hit !== null) {
      return hit;
    }

    const existing = this.inFlight.get(key);
    if (existing) {
      return existing;
    }

    const task = loader()
      .then(async (value) => {
        await this.store.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inFlight.delete(key);
      });
    this.inFlight.set(key, task);
    return task;
  }

  /** 主动失效单个键（写操作后调用，避免读到陈旧数据）。 */
  async invalidate(key: string): Promise<void> {
    const store = this.store as CacheStoreLike & { del?: (k: string) => Promise<unknown> };
    if (store.del) {
      await store.del(key);
    }
    this.inFlight.delete(key);
  }
}
