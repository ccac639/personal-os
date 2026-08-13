import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildCorsOptions } from '../src/common/cors.js';
import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

const ALLOWED_ORIGIN = 'http://localhost:5173';

describe('CORS 策略', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = ALLOWED_ORIGIN;

    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    app.enableCors(buildCorsOptions(ALLOWED_ORIGIN));
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

  it('允许的来源 → 回显 ACAO + credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', ALLOWED_ORIGIN)
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('不允许的来源 → 无 ACAO 响应头（浏览器将拒绝）', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'http://evil.example.com')
      .expect(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
