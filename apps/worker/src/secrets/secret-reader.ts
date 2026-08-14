/**
 * SecretReader：从共享 Redis 读取密钥（SiliconFlow API Key）。
 *
 * - 复用 main.ts 管理的 Redis 连接（不创建隐藏连接，见任务 6）；
 * - close() 标记关闭（幂等）；真正的 Redis.quit 由 shutdown 的 redis 环节负责，
 *   因此本类不拥有连接、不执行 quit——所有权在 main.ts。
 */
import type { Redis } from 'ioredis';

export interface SecretReader {
  get(key: string): Promise<string | null>;
  /** 幂等关闭：仅标记状态，不 quit 共享 Redis */
  close(): Promise<void>;
  readonly closed: boolean;
}

export class RedisSecretReader implements SecretReader {
  private _closed = false;

  constructor(private readonly redis: Redis) {}

  get closed(): boolean {
    return this._closed;
  }

  async get(key: string): Promise<string | null> {
    if (this._closed) throw new Error('SecretReader 已关闭');
    return this.redis.get(key);
  }

  async close(): Promise<void> {
    this._closed = true;
  }
}
