import { afterEach, describe, expect, it } from 'vitest';

import { configuration } from '../src/config/configuration.js';

const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'info',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/personal_os',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: 'http://localhost:5173',
};

const ALL_KEYS = [
  ...Object.keys(VALID_ENV),
  'PERSONAL_OS_API_KEY',
  'SWAGGER_ENABLED',
  'TRUST_PROXY',
  'REQUEST_TIMEOUT_MS',
  'REQUEST_BODY_LIMIT_BYTES',
  'HEALTH_CHECK_TIMEOUT_MS',
  'RATE_LIMIT_MAX_REQUESTS',
  'RATE_LIMIT_WINDOW_MS',
];

function withEnv(env: Record<string, string | undefined>): void {
  for (const key of ALL_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

afterEach(() => {
  for (const key of ALL_KEYS) {
    delete process.env[key];
  }
});

describe('production 安全策略', () => {
  it('production + 无 API Key + 非 loopback → fail-fast', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'production', API_HOST: '0.0.0.0' });
    expect(() => configuration()).toThrow(/生产环境安全策略/);
  });

  it('production + 无 API Key + loopback（127.0.0.1）→ 同样拒绝启动', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'production', API_HOST: '127.0.0.1' });
    expect(() => configuration()).toThrow(/生产环境安全策略/);
  });

  it('production + 有 API Key + loopback → 通过', () => {
    withEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      API_HOST: '127.0.0.1',
      PERSONAL_OS_API_KEY: 'prod-secret-api-key-123',
    });
    expect(() => configuration()).not.toThrow();
  });

  it('production + 有 API Key + 非 loopback → 通过', () => {
    withEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      API_HOST: '0.0.0.0',
      PERSONAL_OS_API_KEY: 'a-very-secret-key-123',
    });
    expect(() => configuration()).not.toThrow();
  });

  it('production + API Key 不足 8 位 → fail-fast（zod）', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'production', PERSONAL_OS_API_KEY: 'short' });
    expect(() => configuration()).toThrow(/PERSONAL_OS_API_KEY/);
  });

  it('development/test 不配置 API Key → 通过（显式关闭鉴权）', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'development' });
    expect(() => configuration()).not.toThrow();
    expect(configuration().apiKey).toBeUndefined();
  });

  it('production 默认关闭 Swagger，SWAGGER_ENABLED=true 显式开启', () => {
    withEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      PERSONAL_OS_API_KEY: 'prod-secret-api-key-123',
    });
    expect(configuration().swagger.enabled).toBe(false);
    withEnv({
      ...VALID_ENV,
      NODE_ENV: 'production',
      SWAGGER_ENABLED: 'true',
      PERSONAL_OS_API_KEY: 'prod-secret-api-key-123',
    });
    expect(configuration().swagger.enabled).toBe(true);
  });
});

describe('CORS 多 origin 白名单', () => {
  it('逗号分隔 → 解析为数组（trim 规范化）', () => {
    withEnv({ ...VALID_ENV, CORS_ORIGIN: 'http://localhost:5173, https://app.example.com' });
    expect(configuration().cors.origins).toEqual([
      'http://localhost:5173',
      'https://app.example.com',
    ]);
  });

  it('单 origin → 单元素数组', () => {
    withEnv(VALID_ENV);
    expect(configuration().cors.origins).toEqual(['http://localhost:5173']);
  });

  it('拒绝 *（宽松 CORS 在 production 一律不允许，任何环境都拒绝）', () => {
    withEnv({ ...VALID_ENV, CORS_ORIGIN: '*' });
    expect(() => configuration()).toThrow(/CORS_ORIGIN/);
  });

  it('拒绝空项 / 非 http(s) origin', () => {
    withEnv({ ...VALID_ENV, CORS_ORIGIN: 'http://a.com,,http://b.com' });
    expect(() => configuration()).toThrow(/CORS_ORIGIN/);
    withEnv({ ...VALID_ENV, CORS_ORIGIN: 'ftp://a.com' });
    expect(() => configuration()).toThrow(/CORS_ORIGIN/);
  });
});

describe('请求保护与限流配置', () => {
  it('默认值（未显式配置时）', () => {
    withEnv(VALID_ENV);
    const config = configuration();
    expect(config.request.timeoutMs).toBe(30_000);
    expect(config.request.bodyLimitBytes).toBe(1_048_576);
    expect(config.health.checkTimeoutMs).toBe(2_000);
    expect(config.rateLimit.maxRequests).toBe(300);
    expect(config.rateLimit.windowMs).toBe(60_000);
  });

  it('显式配置覆盖默认值', () => {
    withEnv({
      ...VALID_ENV,
      REQUEST_TIMEOUT_MS: '5000',
      REQUEST_BODY_LIMIT_BYTES: '2048',
      HEALTH_CHECK_TIMEOUT_MS: '500',
      RATE_LIMIT_MAX_REQUESTS: '10',
      RATE_LIMIT_WINDOW_MS: '1000',
    });
    const config = configuration();
    expect(config.request.timeoutMs).toBe(5000);
    expect(config.request.bodyLimitBytes).toBe(2048);
    expect(config.health.checkTimeoutMs).toBe(500);
    expect(config.rateLimit.maxRequests).toBe(10);
    expect(config.rateLimit.windowMs).toBe(1000);
  });

  it('非法值 → 抛错（fail-fast）', () => {
    withEnv({ ...VALID_ENV, REQUEST_TIMEOUT_MS: '0' });
    expect(() => configuration()).toThrow(/REQUEST_TIMEOUT_MS/);
    withEnv({ ...VALID_ENV, REQUEST_BODY_LIMIT_BYTES: '100' });
    expect(() => configuration()).toThrow(/REQUEST_BODY_LIMIT_BYTES/);
    withEnv({ ...VALID_ENV, HEALTH_CHECK_TIMEOUT_MS: 'abc' });
    expect(() => configuration()).toThrow(/HEALTH_CHECK_TIMEOUT_MS/);
    withEnv({ ...VALID_ENV, RATE_LIMIT_MAX_REQUESTS: '-1' });
    expect(() => configuration()).toThrow(/RATE_LIMIT_MAX_REQUESTS/);
  });
});

describe('TRUST_PROXY（可信代理）', () => {
  it('未配置 → false（默认不信任代理头）', () => {
    withEnv(VALID_ENV);
    expect(configuration().trustProxy).toBe(false);
  });

  it('true / false → 布尔值', () => {
    withEnv({ ...VALID_ENV, TRUST_PROXY: 'true' });
    expect(configuration().trustProxy).toBe(true);
    withEnv({ ...VALID_ENV, TRUST_PROXY: 'false' });
    expect(configuration().trustProxy).toBe(false);
  });

  it('IP/CIDR 列表 → string[]（trim 规范化）', () => {
    withEnv({ ...VALID_ENV, TRUST_PROXY: '127.0.0.1, 10.0.0.0/8, ::1' });
    expect(configuration().trustProxy).toEqual(['127.0.0.1', '10.0.0.0/8', '::1']);
  });

  it('非法值 → 抛错（fail-fast）', () => {
    withEnv({ ...VALID_ENV, TRUST_PROXY: 'not-an-ip' });
    expect(() => configuration()).toThrow(/TRUST_PROXY/);
    withEnv({ ...VALID_ENV, TRUST_PROXY: '10.0.0.0/99' });
    expect(() => configuration()).toThrow(/TRUST_PROXY/);
    withEnv({ ...VALID_ENV, TRUST_PROXY: '127.0.0.1,,8.8.8.8' });
    expect(() => configuration()).toThrow(/TRUST_PROXY/);
  });
});
