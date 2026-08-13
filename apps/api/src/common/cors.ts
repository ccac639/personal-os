import type { FastifyCorsOptions } from '@fastify/cors';

/**
 * 构建 CORS 配置：
 * - 仅允许配置的 Web Origin（CORS_ORIGIN 单一来源），不用 origin=* 与 credentials 混用
 * - 个人使用场景：凭证（cookie / 自定义头）与精确 origin 搭配
 * - 注意 @fastify/cors v11：字符串 origin 是"固定 origin"语义（对所有请求原样返回，
 *   不校验请求来源）；必须用数组才能实现"白名单 + 反射"语义——匹配时反射请求来源，
 *   不匹配时不返回 ACAO，由浏览器拒绝。
 */
export function buildCorsOptions(origin: string): FastifyCorsOptions {
  return {
    origin: [origin],
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Accept', 'X-API-Key', 'X-Request-Id'],
  };
}
