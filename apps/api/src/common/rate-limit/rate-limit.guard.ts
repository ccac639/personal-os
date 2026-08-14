import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { ERROR_CODES } from '../interfaces/error-codes.js';
import { API_KEY_HEADER } from '../guards/api-key.guard.js';
import { isPublicPath } from '../guards/public-paths.js';
import { REDIS_CLIENT } from '../redis/redis.module.js';
import { SlidingWindowRateLimiter } from './sliding-window.js';
import { RedisFixedWindowRateLimiter } from './redis-fixed-window.js';

/**
 * 限流守卫（APP_GUARD，在 ApiKeyGuard 之后执行）：
 * - Redis 可用时：分布式固定窗口限流（多实例共享计数），INCR+EXPIRE 原子；
 * - Redis 不可用（未装配/连接失败）：降级为内存滑动窗口（单实例本地保护），
 *   保证部署无 Redis 依赖时请求不被误伤（fail-open 而非 fail-closed）。
 * - 指纹 = 客户端 IP + X-API-Key（未配置/未携带时用 'anonymous'）
 * - 豁免 /api/health 与 Swagger 文档（与 API Key 守卫同一豁免集合）
 * - canActivate 为 async：Nest 原生支持 Promise 返回值。
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);
  private readonly memoryLimiter: SlidingWindowRateLimiter;
  private readonly redisLimiter: RedisFixedWindowRateLimiter | null;

  constructor(
    private readonly config: ConfigService,
    @Optional() @Inject(REDIS_CLIENT) redis: unknown,
  ) {
    const windowMs = this.config.get<number>('rateLimit.windowMs') ?? 60_000;
    const max = this.config.get<number>('rateLimit.maxRequests') ?? 300;
    this.memoryLimiter = new SlidingWindowRateLimiter(windowMs, max);

    const redisLike = redis as { incr?: unknown; expire?: unknown } | null;
    if (redisLike?.incr && redisLike?.expire) {
      this.redisLimiter = new RedisFixedWindowRateLimiter(windowMs, max, redisLike as never);
      this.logger.log('限流：Redis 固定窗口（分布式）已启用');
    } else {
      this.redisLimiter = null;
      this.logger.warn('限流：Redis 不可用，降级为内存滑动窗口（单实例）');
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (request.method === 'OPTIONS') {
      return true;
    }
    if (isPublicPath(request.url)) {
      return true;
    }

    const header = request.headers[API_KEY_HEADER];
    const apiKey = Array.isArray(header) ? header[0] : header;
    const key = `${request.ip ?? 'unknown'}|${apiKey ?? 'anonymous'}`;

    let allowed: boolean;
    if (this.redisLimiter) {
      allowed = await this.redisLimiter.allow(key);
    } else {
      allowed = this.memoryLimiter.allow(key);
    }

    if (!allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          code: ERROR_CODES.RATE_LIMITED,
          message: '请求过于频繁，请稍后重试',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}
