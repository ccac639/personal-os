import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { from, lastValueFrom, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { REDIS_CLIENT } from '../redis/redis.module.js';
import { CACHE_TTL_MS } from './cacheable.decorator.js';
import { ResponseCache } from './response-cache.js';

/**
 * 响应缓存拦截器：仅对带 @Cacheable 的 GET 端点生效（只读公开数据）。
 * - 缓存内容为 handler 裸返回值序列化；命中时反序列化回对象，
 *   仍由后续 TransformInterceptor 统一包装为 { code, message, data } —— 契约不变。
 * - 未命中时经 ResponseCache 防踩踏（同键并发只执行一次原逻辑）。
 * - 非 GET / 无 @Cacheable / Redis 不可用 → 原样放行。
 *
 * 装配约束：必须注册在 TransformInterceptor 之前（先声明的 APP_INTERCEPTOR 在外层先执行），
 * 否则缓存的是完整信封，命中会双重包装。
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);
  private readonly cache: ResponseCache | null;

  constructor(
    private readonly reflector: Reflector,
    @Optional() @Inject(REDIS_CLIENT) redis: unknown,
  ) {
    const store = redis as { get?: unknown; set?: unknown } | null;
    this.cache = store?.get && store?.set ? new ResponseCache(store as never) : null;
    if (!this.cache) {
      this.logger.warn('响应缓存：Redis 不可用，@Cacheable 端点降级为直读（不缓存）');
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const ttlMs = this.reflector.get<number | undefined>(CACHE_TTL_MS, context.getHandler());

    const cacheable = typeof ttlMs === 'number' && ttlMs > 0 && request.method === 'GET';
    if (!cacheable || !this.cache) {
      return next.handle();
    }

    const key = this.cache.keyFor(
      request.url.split('?')[0] ?? '',
      request.query as Record<string, unknown>,
    );

    return from(
      this.cache.wrap(key, ttlMs as number, async () => {
        const value = await lastValueFrom(next.handle());
        return JSON.stringify(value ?? null);
      }),
    ).pipe(map((cached) => JSON.parse(cached) as unknown));
  }
}
