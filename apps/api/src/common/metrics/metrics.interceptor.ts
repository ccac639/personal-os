import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Observable, tap } from 'rxjs';

import { MetricsService } from './metrics.service.js';

/**
 * 请求指标拦截器：每次 HTTP 请求完成时记录状态码与耗时。
 * 与 RequestIdInterceptor 同层（外层），metrics 汇总数据供 /api/health 快照。
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const startedAt = Date.now();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      tap({
        next: () => {
          const status = reply.statusCode ?? 200;
          this.metrics.record(status, Date.now() - startedAt);
        },
        error: () => {
          const status = reply.statusCode ?? 500;
          this.metrics.record(status, Date.now() - startedAt);
        },
      }),
    );
  }
}
