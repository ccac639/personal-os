import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

describe('统一响应与错误格式', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'http://localhost:5173';

    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
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

  it('成功响应：统一包装 + requestId 透传/回写', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/echo/ping')
      .set('X-Request-Id', 'req-12345')
      .expect(200);
    expect(res.headers['x-request-id']).toBe('req-12345');
    expect(res.body).toMatchObject({
      requestId: 'req-12345',
      path: '/api/echo/ping',
      statusCode: 200,
      code: 'OK',
      message: 'OK',
      data: { pong: true },
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  it('未知路由 → 404 统一错误格式', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/does-not-exist')
      .set('X-Request-Id', 'req-404')
      .expect(404);
    expect(res.body).toMatchObject({
      requestId: 'req-404',
      path: '/api/does-not-exist',
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(typeof res.body.timestamp).toBe('string');
    expect(typeof res.body.message).toBe('string');
  });

  it('DTO 校验失败 → 400 + 字段级错误（fields）', async () => {
    const res = await request(app.getHttpServer()).post('/api/echo').send({ name: '', age: 0 }).expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    const fields: Array<{ field: string; errors: string[] }> = res.body.fields;
    expect(fields.length).toBeGreaterThan(0);
    const ageField = fields.find((f) => f.field === 'age');
    expect(ageField?.errors.length).toBeGreaterThan(0);
  });

  it('内部错误 → 500 INTERNAL_ERROR，不泄露堆栈 / 连接串', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/boom').expect(500);
    expect(res.body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    // 非 production 暴露错误 message 便于排查，但绝不包含堆栈
    expect(res.body.message).toBe('internal-secret-detail');
    expect(JSON.stringify(res.body)).not.toMatch(/\n\s+at /);
    expect(JSON.stringify(res.body)).not.toContain('mongodb://');
    expect(JSON.stringify(res.body)).not.toContain('redis://');
  });
});
