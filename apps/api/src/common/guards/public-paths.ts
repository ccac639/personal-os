import type { FastifyRequest } from 'fastify';

/** 无需 API Key / 限流的公开路径（Swagger 文档 UI / JSON 文档 + 存活探针） */
export const PUBLIC_PATHS = new Set([
  '/api',
  '/api/',
  '/api-json',
  '/api-yaml',
  '/api/health',
  '/api/health/',
]);

/** 判断原始 URL（可含 query）是否为公开路径 */
export function isPublicPath(rawPath: string): boolean {
  const path = rawPath.split('?')[0] ?? rawPath;
  return PUBLIC_PATHS.has(path);
}

/** 匿名化客户端标识：仅保留 IP（IPv6 完整形式可被 /:port 截断，这里仅取 IP 本身） */
export function anonymousClientId(request: FastifyRequest): string {
  return request.ip ?? 'unknown';
}
