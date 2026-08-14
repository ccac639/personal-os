import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { HealthContributor } from '../src/common/health/health-contributor.js';
import { runContributorWithTimeout } from '../src/common/health/health-contributor.js';
import { HealthService } from '../src/common/health/health.service.js';
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
  for (const [key, value] of Object.entries({ ...ENV, ...extra })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('HealthService.ready（单元：fake contributor，不连真实 Mongo/Redis）', () => {
  it('依赖未注入 → not_configured，不误报故障', async () => {
    const service = new HealthService(undefined, undefined);
    const res = await service.ready('1.0.0', 1000);
    expect(res.status).toBe('not_ready');
    expect(res.version).toBe('1.0.0');
    expect(res.checks).toEqual([
      expect.objectContaining({
        id: 'mongo',
        status: 'not_configured',
        errorCategory: 'NOT_CONFIGURED',
      }),
      expect.objectContaining({
        id: 'redis',
        status: 'not_configured',
        errorCategory: 'NOT_CONFIGURED',
      }),
    ]);
  });

  it('fake contributor 成功 → up 且计入 durationMs', async () => {
    const service = new HealthService(undefined, undefined, [
      { id: 'fake', check: async () => ({ id: 'fake', status: 'up' as const, durationMs: 1 }) },
    ]);
    const res = await service.ready('1.0.0', 1000);
    const fake = res.checks.find((c) => c.id === 'fake');
    expect(fake?.status).toBe('up');
    expect(fake?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('全部检查 up（含内置 mongo/redis）→ ready', async () => {
    const service = new HealthService({ readyState: 1 } as never, { status: 'ready' } as never, [
      { id: 'fake', check: () => ({ id: 'fake', status: 'up' as const, durationMs: 0 }) },
    ]);
    const res = await service.ready('1.0.0', 1000);
    expect(res.status).toBe('ready');
    expect(res.checks.every((c) => c.status === 'up')).toBe(true);
  });

  it('fake contributor 失败 → down + 简短错误类别', async () => {
    const service = new HealthService(undefined, undefined, [
      {
        id: 'fake',
        check: async () => {
          throw new Error('secret connection detail');
        },
      },
    ]);
    const res = await service.ready('1.0.0', 1000);
    const fake = res.checks.find((c) => c.id === 'fake');
    expect(fake?.status).toBe('down');
    expect(fake?.errorCategory).toBe('ERROR');
    expect(JSON.stringify(res)).not.toContain('secret connection detail');
  });

  it('fake contributor 超时 → down + TIMEOUT，不卡住请求', async () => {
    const service = new HealthService(undefined, undefined, [
      {
        id: 'slow',
        check: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          return { id: 'slow', status: 'up' as const, durationMs: 500 };
        },
      },
    ]);
    const startedAt = Date.now();
    const res = await service.ready('1.0.0', 50);
    expect(Date.now() - startedAt).toBeLessThan(300);
    const slow = res.checks.find((c) => c.id === 'slow');
    expect(slow?.status).toBe('down');
    expect(slow?.errorCategory).toBe('TIMEOUT');
  });
});

describe('runContributorWithTimeout', () => {
  it('正常完成保留结果与 id', async () => {
    const contributor: HealthContributor = {
      id: 'x',
      check: () => ({ id: 'x', status: 'up' as const, durationMs: 0 }),
    };
    const result = await runContributorWithTimeout(contributor, 100);
    expect(result.status).toBe('up');
    expect(result.id).toBe('x');
  });

  it('超时 → down/TIMEOUT', async () => {
    const contributor: HealthContributor = {
      id: 'y',
      check: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ id: 'y', status: 'up' as const, durationMs: 0 }), 200),
        ),
    };
    const result = await runContributorWithTimeout(contributor, 20);
    expect(result.status).toBe('down');
    expect(result.errorCategory).toBe('TIMEOUT');
  });
});

describe('GET /api/ready（集成，无 API Key 配置）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv();
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('统一格式 + data.checks 结构化（每项 id/status/durationMs）', async () => {
    const res = await request(app.getHttpServer()).get('/api/ready').expect(200);
    expect(res.body.code).toBe('OK');
    expect(res.body.data.status).toBe('not_ready');
    const checks: Array<{ id: string; status: string; durationMs: number }> = res.body.data.checks;
    expect(checks.length).toBeGreaterThanOrEqual(2);
    for (const check of checks) {
      expect(typeof check.id).toBe('string');
      expect(['up', 'down', 'not_configured']).toContain(check.status);
      expect(typeof check.durationMs).toBe('number');
    }
    // 不泄露连接串 / 诊断明细
    expect(JSON.stringify(res.body)).not.toMatch(/mongodb:\/\/|redis:\/\//);
  });
});

describe('API Key 保护 /api/ready', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    setEnv({ PERSONAL_OS_API_KEY: 'test-secret-api-key-123' });
    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('无 Key → 401；正确 Key → 200（与 /api/health 豁免不同）', async () => {
    const denied = await request(app.getHttpServer()).get('/api/ready').expect(401);
    expect(denied.body.code).toBe('API_KEY_MISSING');

    const allowed = await request(app.getHttpServer())
      .get('/api/ready')
      .set('X-API-Key', 'test-secret-api-key-123')
      .expect(200);
    expect(allowed.body.data.status).toBe('not_ready');
  });
});
