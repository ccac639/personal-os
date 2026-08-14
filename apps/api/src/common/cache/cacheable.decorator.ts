import { SetMetadata } from '@nestjs/common';

/** 标记公开 GET 端点响应可被 Redis 缓存（仅无凭据只读数据）。 */
export const CACHE_TTL_MS = 'cache:ttl-ms';

/**
 * 声明端点响应可缓存。
 * @param ttlMs 缓存有效期（毫秒），默认 60_000（1 分钟）
 */
export const Cacheable = (ttlMs = 60_000): MethodDecorator => SetMetadata(CACHE_TTL_MS, ttlMs);
