import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';

/** 统一错误码前缀，便于前端按 code 分支（错误体自带 requestId） */
export const SUB2API_ERR = {
  NOT_CONFIGURED: 'SUB2API_NOT_CONFIGURED',
  INVALID_BASE_URL: 'SUB2API_INVALID_BASE_URL',
  UNAUTHORIZED: 'SUB2API_UNAUTHORIZED',
  FORBIDDEN: 'SUB2API_FORBIDDEN',
  NOT_FOUND: 'SUB2API_NOT_FOUND',
  CONFLICT: 'SUB2API_CONFLICT',
  RATE_LIMITED: 'SUB2API_RATE_LIMITED',
  TIMEOUT: 'SUB2API_TIMEOUT',
  UPSTREAM_ERROR: 'SUB2API_UPSTREAM_ERROR',
  UPSTREAM_TOO_LARGE: 'SUB2API_UPSTREAM_TOO_LARGE',
  UNREACHABLE: 'SUB2API_UNREACHABLE',
  INVALID_PATH: 'SUB2API_INVALID_PATH',
} as const;

/** 未配置 Base URL / 管理端凭据（稳定错误码，前端设置页引导） */
export function errNotConfigured(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: SUB2API_ERR.NOT_CONFIGURED,
    message: 'Sub2API 连接未配置，请先在「Sub2API 控制台 → 设置」填写 Base URL 与管理端凭据',
  });
}

/** Base URL 格式非法（协议 / 主机 / 路径校验失败） */
export function errInvalidBaseUrl(reason: string): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: SUB2API_ERR.INVALID_BASE_URL,
    message: `Sub2API Base URL 非法：${reason}`,
  });
}

/** 代理路径不在白名单（禁止任意 URL 代理） */
export function errInvalidPath(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: SUB2API_ERR.INVALID_PATH,
    message: '请求的 Sub2API 路径不在允许列表内',
  });
}

/** 上游响应体超过大小上限 */
export function errUpstreamTooLarge(): BadGatewayException {
  return new BadGatewayException({
    statusCode: 502,
    code: SUB2API_ERR.UPSTREAM_TOO_LARGE,
    message: 'Sub2API 响应体超过大小上限，已截断拒绝',
  });
}

/**
 * 把上游 HTTP 状态码统一映射为 Personal OS 稳定错误码。
 * @param status 上游 HTTP 状态
 * @param rawMessage 上游错误体文本（已脱敏后传入）
 */
export function mapUpstreamHttpError(status: number, rawMessage: string): HttpException {
  const message = sanitizeUpstreamMessage(rawMessage);
  switch (status) {
    case 401:
      return new UnauthorizedException({
        statusCode: 401,
        code: SUB2API_ERR.UNAUTHORIZED,
        message: 'Sub2API 管理端凭据无效或已过期（401）',
      });
    case 403:
      return new ForbiddenException({
        statusCode: 403,
        code: SUB2API_ERR.FORBIDDEN,
        message: message || 'Sub2API 拒绝访问（403），请检查管理端权限',
      });
    case 404:
      return new NotFoundException({
        statusCode: 404,
        code: SUB2API_ERR.NOT_FOUND,
        message: message || 'Sub2API 资源不存在（404）',
      });
    case 409:
      return new ConflictException({
        statusCode: 409,
        code: SUB2API_ERR.CONFLICT,
        message: message || 'Sub2API 资源冲突（409）',
      });
    case 429:
      return new HttpException(
        {
          statusCode: 429,
          code: SUB2API_ERR.RATE_LIMITED,
          message: 'Sub2API 触发限流（429），请稍后重试',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    default:
      // 其余（含 5xx）统一为上游错误
      return new BadGatewayException({
        statusCode: 502,
        code: SUB2API_ERR.UPSTREAM_ERROR,
        message: message || `Sub2API 上游错误（HTTP ${status}）`,
      });
  }
}

/** 上游业务信封 code !== 0 */
export function errUpstreamBusiness(message: string): BadGatewayException {
  return new BadGatewayException({
    statusCode: 502,
    code: SUB2API_ERR.UPSTREAM_ERROR,
    message: sanitizeUpstreamMessage(message) || 'Sub2API 返回业务错误',
  });
}

/** 上游超时 */
export function errUpstreamTimeout(): GatewayTimeoutException {
  return new GatewayTimeoutException({
    statusCode: 504,
    code: SUB2API_ERR.TIMEOUT,
    message: 'Sub2API 请求超时，请检查服务状态或调大请求超时设置',
  });
}

/** 上游不可达（网络层失败） */
export function errUpstreamUnreachable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    code: SUB2API_ERR.UNREACHABLE,
    message: `Sub2API 不可达：${sanitizeUpstreamMessage(message)}`,
  });
}

/** 掩码错误信息中的长 token / 密钥形态串，避免上游回显泄露凭据 */
export function sanitizeUpstreamMessage(value: string): string {
  const trimmed = value.trim().slice(0, 500);
  return trimmed
    .replace(/(sk-[A-Za-z0-9_-]{8,})/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]{8,}/gi, 'Bearer ***')
    .replace(/https?:\/\/[^\s'"<]*:[^@\s'"<]+@[^\s'"<]+/gi, '***');
}
