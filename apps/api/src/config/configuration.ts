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
  cors: { origin: string };
  /** 可选：配置后启用 X-API-Key 鉴权 */
  apiKey?: string;
  swagger: { enabled: boolean };
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
 * 仅 PERSONAL_OS_API_KEY / SWAGGER_ENABLED 为可选。
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
      origin: env.CORS_ORIGIN,
    },
    apiKey: env.PERSONAL_OS_API_KEY,
    swagger: {
      enabled: env.SWAGGER_ENABLED === undefined ? env.NODE_ENV !== 'production' : env.SWAGGER_ENABLED === 'true',
    },
    version: readVersion(),
  };
};
