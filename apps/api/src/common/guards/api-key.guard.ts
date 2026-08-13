import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';

export const API_KEY_HEADER = 'x-api-key';

/** 无需 API Key 的公开路径（健康检查 + Swagger 文档 UI / JSON 文档） */
const PUBLIC_PATHS = new Set(['/api', '/api/', '/api-json', '/api-yaml', '/api/health', '/api/health/']);

function isPublicPath(rawPath: string): boolean {
  const path = rawPath.split('?')[0] ?? rawPath;
  return PUBLIC_PATHS.has(path);
}

/** 常量时间比较（先 SHA-256 归一长度，避免长度侧信道） */
function safeEqual(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a).digest();
  const hashB = createHash('sha256').update(b).digest();
  return timingSafeEqual(hashA, hashB);
}

/**
 * 全局 API Key 守卫（个人使用场景，无用户体系）：
 * - 未配置 PERSONAL_OS_API_KEY → 放行（纯本机使用）
 * - 配置后：除 /api/health、Swagger 文档、OPTIONS 预检外，全部要求 X-API-Key
 * - 比较使用 node:crypto timing-safe 算法，不泄露密钥信息
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    if (request.method === 'OPTIONS') {
      return true; // CORS 预检由 @fastify/cors 处理
    }

    if (isPublicPath(request.url)) {
      return true;
    }

    const configuredKey = this.config.get<string | undefined>('apiKey');
    if (!configuredKey) {
      return true;
    }

    const header = request.headers[API_KEY_HEADER];
    const presented = Array.isArray(header) ? header[0] : header;

    if (!presented) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'API_KEY_MISSING',
        message: `缺少 ${API_KEY_HEADER} 请求头`,
      });
    }

    if (!safeEqual(presented, configuredKey)) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'API_KEY_INVALID',
        message: 'API Key 无效',
      });
    }

    return true;
  }
}
