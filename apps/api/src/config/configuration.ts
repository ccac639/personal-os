import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEnv, type EnvVars } from './env.validation.js';

export interface AppConfig {
  /** 监听地址：默认 127.0.0.1（仅本机，个人使用） */
  apiHost: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: EnvVars['LOG_LEVEL'];
  mongodb: { uri: string };
  redis: { url: string };
  cors: {
    /** 兼容字段：单一 origin（main.ts 的 buildCorsOptions 消费） */
    origin: string;
    /** 白名单数组（逗号分隔解析，拒绝 * / 空项 / 非 http(s)） */
    origins: string[];
  };
  /** 可选：配置后启用 X-API-Key 鉴权（production 必填） */
  apiKey?: string;
  swagger: { enabled: boolean };
  request: {
    timeoutMs: number;
    bodyLimitBytes: number;
  };
  health: {
    checkTimeoutMs: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
  /** 可信代理：false（默认） | true | IP/CIDR 白名单数组 */
  trustProxy: boolean | string[];
  /** API 版本（读取 apps/api/package.json） */
  version: string;
}

/** 读取本包 package.json 的 version 字段（CJS 产物与 vitest 下 __dirname 均可用） */
function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.1.0';
  } catch {
    return '0.1.0';
  }
}

/**
 * 集中式环境配置（与 .env.example 字段一一对应）。
 *
 * 由 zod 严格校验：必填项缺失或非法值直接抛错，进程 fail-fast；
 * production 必须配置 PERSONAL_OS_API_KEY（≥8 位）。
 */
export const configuration = (): AppConfig => {
  const env = parseEnv();

  return {
    apiHost: env.API_HOST,
    port: env.API_PORT,
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    mongodb: {
      uri: env.MONGODB_URI,
    },
    redis: {
      url: env.REDIS_URL,
    },
    cors: {
      origin: env.CORS_ORIGIN[0] ?? '',
      origins: env.CORS_ORIGIN,
    },
    apiKey: env.PERSONAL_OS_API_KEY,
    swagger: {
      enabled:
        env.SWAGGER_ENABLED === undefined
          ? env.NODE_ENV !== 'production'
          : env.SWAGGER_ENABLED === 'true',
    },
    request: {
      timeoutMs: env.REQUEST_TIMEOUT_MS,
      bodyLimitBytes: env.REQUEST_BODY_LIMIT_BYTES,
    },
    health: {
      checkTimeoutMs: env.HEALTH_CHECK_TIMEOUT_MS,
    },
    rateLimit: {
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      windowMs: env.RATE_LIMIT_WINDOW_MS,
    },
    trustProxy: env.TRUST_PROXY,
    version: readVersion(),
  };
};
