import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { HealthService } from '../src/common/health/health.service.js';

describe('HealthService（单元）', () => {
  it('mongo/redis 不可达（readyState≠1 / status≠ready）→ down；可达 → up', () => {
    const down = new HealthService(
      { readyState: 0 } as never,
      { status: 'reconnecting' } as never,
    );
    expect(down.check('1.0.0').services).toEqual({ api: 'up', mongo: 'down', redis: 'down' });

    const up = new HealthService(
      { readyState: 1 } as never,
      { status: 'ready' } as never,
    );
    expect(up.check('1.0.0').services).toEqual({ api: 'up', mongo: 'up', redis: 'up' });
  });

  it('依赖缺失（未注入）时也能安全返回', () => {
    const service = new HealthService(undefined, undefined);
    expect(service.check('1.0.0').services).toEqual({ api: 'up', mongo: 'down', redis: 'down' });
  });
});

describe('GET /api/health（完整 AppModule 集成）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    // 显式设置全部必填项（优先于 .env 加载），保证测试可复现
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    delete process.env.PERSONAL_OS_API_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.API_HOST;
    delete process.env.API_PORT;
    delete process.env.MONGODB_URI;
    delete process.env.REDIS_URL;
    delete process.env.CORS_ORIGIN;
  });

  it('返回统一格式：状态 / 版本 / 时间 / 服务状态', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toMatchObject({
      code: 'OK',
      statusCode: 200,
      data: {
        status: 'ok',
        services: { api: 'up' },
      },
    });
    expect(typeof res.body.data.version).toBe('string');
    expect(new Date(res.body.data.time).getTime()).not.toBeNaN();
    expect(['up', 'down']).toContain(res.body.data.services.mongo);
    expect(['up', 'down']).toContain(res.body.data.services.redis);
    expect(typeof res.body.requestId).toBe('string');
    expect(res.body.path).toBe('/api/health');
  });

  it('依赖服务不可达时不泄露连接串 / 密钥 / 诊断信息', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('mongodb://');
    expect(body).not.toContain('redis://');
    expect(body).not.toContain('secret');
    expect(body).not.toContain('stack');
  });
});
