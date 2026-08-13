import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { Observable, map } from 'rxjs';

import { API_CODE_OK, type ApiResponse } from '../interfaces/api-response.interface.js';
import { REQUEST_ID_HEADER } from '../filters/all-exceptions.filter.js';

/**
 * 统一成功响应包装：
 *   { requestId, timestamp, path, statusCode, code: 'OK', message: 'OK', data }
 *
 * 仅包装 HTTP 处理器返回值；Swagger UI / 静态资源等不经由 Nest 管道，不受影响。
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      map((data) => {
        const body: ApiResponse = {
          requestId:
            ((request as unknown as { requestId?: string }).requestId as string | undefined) ??
            (request.headers[REQUEST_ID_HEADER] as string | undefined) ??
            'unknown',
          timestamp: new Date().toISOString(),
          path: request.url,
          statusCode: reply.statusCode,
          code: API_CODE_OK,
          message: API_CODE_OK,
          data,
        };
        return body;
      }),
    );
  }
}
