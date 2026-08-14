import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { FastifyReply, FastifyRequest } from 'fastify';

import type { ApiErrorBody, ApiFieldError } from '../interfaces/api-response.interface.js';

/** HTTP 状态码 → 默认机器可读错误码 */
const DEFAULT_CODES: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  422: 'UNPROCESSABLE_ENTITY',
  429: 'TOO_MANY_REQUESTS',
  500: 'INTERNAL_ERROR',
  502: 'BAD_GATEWAY',
  503: 'SERVICE_UNAVAILABLE',
  504: 'GATEWAY_TIMEOUT',
};

function defaultCode(status: number): string {
  return DEFAULT_CODES[status] ?? `HTTP_ERROR_${status}`;
}

/** 脱敏：错误消息中的连接串 / 凭证类 URL（mongoose 等错误消息常内嵌 URI） */
function redactSensitive(value: string): string {
  return value
    .replace(/mongodb(\+srv)?:\/\/[^\s'"<]+/gi, 'mongodb://***')
    .replace(/rediss?:\/\/[^\s'"<]+/gi, 'redis://***')
    .replace(/https?:\/\/[^\s'"<]*:[^@\s'"<]+@[^\s'"<]+/gi, '***');
}

/** 统一响应头：透传 / 回写 requestId */
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * 全局异常过滤器：
 * - 统一错误响应格式（requestId / timestamp / path / statusCode / code / message / fields?）
 * - HttpException：透传业务 code 与字段级错误（DTO 校验）
 * - 非 HttpException：500 INTERNAL_ERROR；production 隐藏内部信息，其余环境输出 message
 * - 永不泄露堆栈、环境变量、密钥、Mongo URI
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly config: ConfigService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<FastifyRequest>();
    const reply = ctx.getResponse<FastifyReply>();
    const isProduction = this.config.get<string>('nodeEnv') === 'production';

    const requestId =
      ((request as unknown as { requestId?: string }).requestId as string | undefined) ??
      (request.headers[REQUEST_ID_HEADER] as string | undefined) ??
      'unknown';

    const base = {
      requestId,
      timestamp: new Date().toISOString(),
      path: request.url,
    };

    let statusCode: number;
    let code: string;
    let message: string;
    let fields: ApiFieldError[] | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        code = defaultCode(statusCode);
        message = redactSensitive(response);
      } else {
        const body = response as Record<string, unknown>;
        code = typeof body.code === 'string' ? body.code : defaultCode(statusCode);
        message =
          typeof body.message === 'string'
            ? redactSensitive(body.message)
            : redactSensitive(exception.message);
        if (Array.isArray(body.fields)) {
          fields = body.fields as ApiFieldError[];
        }
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      code = defaultCode(statusCode);
      message = isProduction
        ? 'Internal server error'
        : redactSensitive((exception as Error)?.message ?? 'Unknown error');
      // 内部错误一律记录完整堆栈到日志，便于排查；不返回给客户端
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiErrorBody = {
      ...base,
      statusCode,
      code,
      message,
      ...(fields ? { fields } : {}),
    };
    void reply.status(statusCode).send(body);
  }
}
