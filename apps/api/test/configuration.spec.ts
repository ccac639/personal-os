import { afterEach, describe, expect, it } from 'vitest';

import { configuration } from '../src/config/configuration.js';

/** 一组合法环境变量（每个用例自行覆盖后再还原） */
const VALID_ENV: Record<string, string> = {
  NODE_ENV: 'development',
  LOG_LEVEL: 'debug',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/personal_os',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: 'http://localhost:5173',
};

const REQUIRED_KEYS = [
  'MONGODB_URI',
  'REDIS_URL',
  'CORS_ORIGIN',
  'API_HOST',
  'API_PORT',
  'NODE_ENV',
  'LOG_LEVEL',
] as const;

function withEnv(env: Record<string, string | undefined>): void {
  for (const key of Object.keys(VALID_ENV)) {
    delete process.env[key];
  }
  for (const key of [...REQUIRED_KEYS, 'PERSONAL_OS_API_KEY', 'SWAGGER_ENABLED']) {
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
  for (const key of [...Object.keys(VALID_ENV), 'PERSONAL_OS_API_KEY', 'SWAGGER_ENABLED']) {
    delete process.env[key];
  }
});

describe('api configuration', () => {
  it('合法环境变量 → 解析为完整配置', () => {
    withEnv(VALID_ENV);
    const config = configuration();
    expect(config.apiHost).toBe('127.0.0.1');
    expect(config.port).toBe(3000);
    expect(config.nodeEnv).toBe('development');
    expect(config.logLevel).toBe('debug');
    expect(config.mongodb.uri).toBe('mongodb://localhost:27017/personal_os');
    expect(config.redis.url).toBe('redis://localhost:6379');
    expect(config.cors.origin).toBe('http://localhost:5173');
    expect(config.apiKey).toBeUndefined();
    expect(config.swagger.enabled).toBe(true);
    expect(typeof config.version).toBe('string');
  });

  it('缺失必填项（MONGODB_URI）→ 抛错且指明字段', () => {
    withEnv({ ...VALID_ENV, MONGODB_URI: undefined });
    expect(() => configuration()).toThrow(/MONGODB_URI/);
  });

  it('缺失必填项（CORS_ORIGIN / REDIS_URL）→ 抛错', () => {
    withEnv({ ...VALID_ENV, CORS_ORIGIN: undefined, REDIS_URL: undefined });
    expect(() => configuration()).toThrow(/CORS_ORIGIN/);
    expect(() => configuration()).toThrow(/REDIS_URL/);
  });

  it('非法 API_PORT（非数字 / 越界）→ 抛错', () => {
    withEnv({ ...VALID_ENV, API_PORT: 'abc' });
    expect(() => configuration()).toThrow(/API_PORT/);
    withEnv({ ...VALID_ENV, API_PORT: '70000' });
    expect(() => configuration()).toThrow(/API_PORT/);
  });

  it('非法 URL（MONGODB_URI / REDIS_URL / CORS_ORIGIN）→ 抛错', () => {
    withEnv({ ...VALID_ENV, MONGODB_URI: 'not-a-url' });
    expect(() => configuration()).toThrow(/MONGODB_URI/);
    withEnv({ ...VALID_ENV, REDIS_URL: 'localhost:6379' });
    expect(() => configuration()).toThrow(/REDIS_URL/);
    withEnv({ ...VALID_ENV, CORS_ORIGIN: 'localhost:5173' });
    expect(() => configuration()).toThrow(/CORS_ORIGIN/);
  });

  it('非法 NODE_ENV / LOG_LEVEL → 抛错', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'staging' });
    expect(() => configuration()).toThrow(/NODE_ENV/);
    withEnv({ ...VALID_ENV, LOG_LEVEL: 'verbose' });
    expect(() => configuration()).toThrow(/LOG_LEVEL/);
  });

  it('可选 PERSONAL_OS_API_KEY：配置后生效，未配置为 undefined', () => {
    withEnv({ ...VALID_ENV, PERSONAL_OS_API_KEY: 'a-very-secret-key-123' });
    expect(configuration().apiKey).toBe('a-very-secret-key-123');
    withEnv({ ...VALID_ENV, PERSONAL_OS_API_KEY: undefined });
    expect(configuration().apiKey).toBeUndefined();
  });

  it('SWAGGER_ENABLED：默认 development 开启 / production 关闭，可显式覆盖', () => {
    withEnv({ ...VALID_ENV, NODE_ENV: 'production' });
    expect(configuration().swagger.enabled).toBe(false);
    withEnv({ ...VALID_ENV, NODE_ENV: 'production', SWAGGER_ENABLED: 'true' });
    expect(configuration().swagger.enabled).toBe(true);
    withEnv({ ...VALID_ENV, SWAGGER_ENABLED: 'false' });
    expect(configuration().swagger.enabled).toBe(false);
  });

  it('API_HOST / API_PORT 有默认值（未显式配置时）', () => {
    withEnv({ ...VALID_ENV, API_HOST: undefined, API_PORT: undefined });
    const config = configuration();
    expect(config.apiHost).toBe('127.0.0.1'); // 个人使用：默认仅本机监听
    expect(config.port).toBe(3000);
  });
});
