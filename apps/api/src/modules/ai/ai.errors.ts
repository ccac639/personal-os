import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

/** 未配置 SiliconFlow API Key（Web 设置页输入后才可用） */
export function errKeyNotConfigured(): BadRequestException {
  return new BadRequestException({
    statusCode: 400,
    code: 'AI_KEY_NOT_CONFIGURED',
    message: 'SiliconFlow API Key 未配置，请先在「设置」页输入后重试',
  });
}

/** SiliconFlow 返回的业务错误（透传官方 message，脱敏后返回） */
export function errProvider(
  status: number,
  message: string,
  traceId?: string,
): BadGatewayException {
  const detail = traceId ? `（traceId: ${traceId}）` : '';
  return new BadGatewayException({
    statusCode: 502,
    code: 'AI_PROVIDER_ERROR',
    message: `${message}${detail}`,
  });
}

/** 视频任务查询失败（requestId 不存在等） */
export function errVideoNotFound(requestId: string): NotFoundException {
  return new NotFoundException(`视频任务不存在: ${requestId}`);
}

/** 上游不可达 / 超时 */
export function errProviderUnavailable(message: string): ServiceUnavailableException {
  return new ServiceUnavailableException({
    statusCode: 503,
    code: 'AI_PROVIDER_UNAVAILABLE',
    message,
  });
}
