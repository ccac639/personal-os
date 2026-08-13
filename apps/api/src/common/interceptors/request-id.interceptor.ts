import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, tap } from 'rxjs';

import { REQUEST_ID_HEADER } from '../filters/all-exceptions.filter.js';

/**
 * 请求链路 ID + 开发期请求耗时日志：
 * - 优先透传客户端 X-Request-Id，否则生成 UUID；写回响应头
 * - development/test 下记录「方法 路径 耗时」日志
 */
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestIdInterceptor.name);

  constructor(private readonly config: ConfigService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    const incoming = request.headers[REQUEST_ID_HEADER];
    const requestId = typeof incoming === 'string' && incoming.length > 0 ? incoming : randomUUID();
    (request as unknown as { requestId?: string }).requestId = requestId;
    void reply.header(REQUEST_ID_HEADER, requestId);

    const startedAt = Date.now();
    const logTiming = this.config.get<string>('nodeEnv') !== 'production';

    return next.handle().pipe(
      tap(() => {
        if (logTiming) {
          this.logger.log(
            `${request.method} ${request.url} ${Date.now() - startedAt}ms`,
            'Request',
          );
        }
      }),
    );
  }
}
