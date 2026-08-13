/**
 * 统一 API 响应 / 错误格式。
 *
 * 成功响应（TransformInterceptor 包装）：
 *   { requestId, timestamp, path, statusCode, code, message, data }
 *
 * 错误响应（AllExceptionsFilter 包装）：
 *   { requestId, timestamp, path, statusCode, code, message, fields? }
 *
 * 约定：
 * - requestId：请求链路 ID（透传 X-Request-Id 或自动生成 UUID）
 * - code：机器可读错误码（如 VALIDATION_ERROR / API_KEY_INVALID / NOT_FOUND）
 * - fields：DTO 校验失败时的字段级错误（[{ field, errors }]）
 * - 响应体永不包含堆栈、环境变量、密钥或连接串
 */

export interface ApiResponse<T = unknown> {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  data: T;
}

export interface ApiFieldError {
  field: string;
  errors: string[];
}

export interface ApiErrorBody {
  requestId: string;
  timestamp: string;
  path: string;
  statusCode: number;
  code: string;
  message: string;
  fields?: ApiFieldError[];
}

/** 业务成功码 */
export const API_CODE_OK = 'OK';
