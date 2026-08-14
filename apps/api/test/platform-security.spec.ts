import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { installRequestTimeout } from '../src/common/protection/request-timeout.js';
import { installSecurityHeaders } from '../src/common/protection/security-headers.js';
import { SlidingWindowRateLimiter } from '../src/common/rate-limit/sliding-window.js';
import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

const ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_HOST: '127.0.0.1',
  API_PORT: '3000',
  MONGODB_URI: 'mongodb://localhost:27017/personal_os',
  REDIS_URL: 'redis://localhost:6379',
  CORS_ORIGIN: 'http://localhost:5173',
};

function setEnv(extra: Record<string, string | undefined> = {}): void {
  for (const key of Object.keys(ENV)) {
    delete process.env[key];
  }
  delete process.env.PERSONAL_OS_API_KEY;
  delete process.env.RATE_LIMIT_MAX_REQUESTS;
  delete process.env.RATE_LIMIT_WINDOW_MS;
  for (const [key, value] of Object.entries({ ...ENV, ...extra })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('SlidingWindowRateLimiter（单元）', () => {
  it('窗口内超限 → 拒绝；窗口滑动后恢复', () => {
    const limiter = new SlidingWindowRateLimiter(1000, 3);
    expect(limiter.allow('k', 1000)).toBe(true);
    expect(limiter.allow('k', 1010)).toBe(true);
    expect(limiter.allow('k', 1020)).toBe(true);
    expect(limiter.allow('k', 1030)).toBe(false);
    // 1s 后最早命中过期 → 恢复
    expect(limiter.allow('k', 2100)).toBe(true);
  });

  it('不同 key 独立计数', () => {
    const limiter = new SlidingWindowRateLimiter(1000, 1);
    expect(limiter.allow('a', 0)).toBe(true);
    expect(limiter.allow('b', 0)).toBe(true);
    expect(limiter.allow('a', 1)).toBe(false);
    expect(limiter.allow('b', 1)).toBe(false);
  });

  it('cleanup 清理全部过期条目', () => {
    const limiter = new SlidingWindowRateLimiter(1000, 5);
    limiter.allow('a', 0);
    limiter.allow('b', 0);
    expect(limiter.size()).toBe(2);
    const removed = limiter.cleanup(2000);
    expect(removed).toBe(2);
    expect(limiter.size()).toBe(0);
  });

  it('cleanup 只保留窗口内新鲜条目', () => {
    const limiter = new SlidingWindowRateLimiter(1000, 10);
    limiter.allow('a', 0);
    limiter.allow('a', 500);
    limiter.allow('a', 900);
    limiter.cleanup(1500);
    expect(limiter.allow('a', 1500)).toBe(true); // 500/900/1500 共 3 个，未超限
  });

  it('key 数量超阈值（1000）时 allow 惰性触发 cleanup，防止内存膨胀', () => {
    const limiter = new SlidingWindowRateLimiter(1000, 10);
    for (let i = 0; i < 1000; i += 1) {
      limiter.allow(`key-${i}`, 0);
    }
    expect(limiter.size()).toBe(1000);
    // 过期后再触发一次 allow → 自动清理全部过期 key
    const next = limiter.allow('fresh', 5000);
    expect(next).toBe(true);
    expect(limiter.size()).toBe(1); // 只剩 'fresh'
  });

  it('非法参数 → 抛错', () => {
    expect(() => new SlidingWindowRateLimiter(0, 10)).toThrow();
    expect(() => new SlidingWindowRateLimiter(1000, 0)).toThrow();
  });
});

describe('请求体大小限制（413 PAYLOAD_TOO_LARGE）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv();
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ bodyLimit: 64 }),
    );
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('超限 → 413 + 稳定错误码 PAYLOAD_TOO_LARGE', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .send({ name: 'x'.repeat(200), age: 1 })
      .expect(413);
    expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(res.body.statusCode).toBe(413);
  });

  it('正常大小请求不受影响', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .send({ name: 'ok', age: 3 })
      .expect(201);
    expect(res.body.code).toBe('OK');
  });
});

describe('请求超时（408 REQUEST_TIMEOUT，timer 正确清理）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv();
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    installRequestTimeout(app.getHttpAdapter().getInstance(), 30);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('慢请求 → 408 + 稳定错误码 REQUEST_TIMEOUT', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/slow').expect(408);
    expect(res.body.code).toBe('REQUEST_TIMEOUT');
    expect(res.body.statusCode).toBe(408);
    expect(typeof res.body.requestId).toBe('string');
  });

  it('快请求不受影响', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    expect(res.body.data).toEqual({ pong: true });
  });
});

describe('内存限流（429 RATE_LIMITED + health 豁免）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv({ RATE_LIMIT_MAX_REQUESTS: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('第 3 次请求 → 429；/api/health 豁免不限流', async () => {
    await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    const third = await request(app.getHttpServer()).get('/api/echo/ping').expect(429);
    expect(third.body.code).toBe('RATE_LIMITED');
    expect(third.body.statusCode).toBe(429);
    // health 豁免：即使计数超限也能访问
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});

describe('安全响应头（不引入 Helmet）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv();
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    installSecurityHeaders(app.getHttpAdapter().getInstance());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('X-Content-Type-Options / X-Frame-Options / Referrer-Policy', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });
});
