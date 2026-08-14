import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyRequest } from 'fastify';

import { ERROR_CODES } from '../interfaces/error-codes.js';
import { API_KEY_HEADER } from '../guards/api-key.guard.js';
import { isPublicPath } from '../guards/public-paths.js';
import { SlidingWindowRateLimiter } from './sliding-window.js';

/**
 * 内存限流守卫（APP_GUARD，在 ApiKeyGuard 之后执行）：
 * - 指纹 = 客户端 IP + X-API-Key（未配置/未携带时用 'anonymous'）
 * - 滑动窗口，限额/窗口来自配置（RATE_LIMIT_MAX_REQUESTS / RATE_LIMIT_WINDOW_MS）
 * - 豁免 /api/health 与 Swagger 文档（与 API Key 守卫同一豁免集合）
 * - 单实例本地保护：多实例部署下各自计数，不用于分布式限流
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly limiter: SlidingWindowRateLimiter;

  constructor(private readonly config: ConfigService) {
    const windowMs = this.config.get<number>('rateLimit.windowMs') ?? 60_000;
    const max = this.config.get<number>('rateLimit.maxRequests') ?? 300;
    this.limiter = new SlidingWindowRateLimiter(windowMs, max);
  }

  canActivate(context: ExecutionContext): boolean {
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

    if (!this.limiter.allow(key)) {
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
