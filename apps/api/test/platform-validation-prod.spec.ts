import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

describe('生产模式校验管道（隐藏字段级详情，契约不变）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    // production 配置校验强制要求 API Key（防裸奔），测试使用固定测试 key
    process.env.PERSONAL_OS_API_KEY = 'prod-test-key';

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
    delete process.env.PERSONAL_OS_API_KEY;
  });

  const KEY = 'prod-test-key';

  it('非法字段 → 400 VALIDATION_ERROR，且不泄露字段级详情', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .set('X-API-Key', KEY)
      .send({ name: '', age: 0 })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: '请求参数校验失败',
    });
    // 信封键集合精确锁定：无 fields / 字段名泄漏
    expect(Object.keys(res.body).sort()).toEqual(
      ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
    );
  });

  it('合法请求不受影响 → 200 统一包装', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .set('X-API-Key', KEY)
      .send({ name: 'ok', age: 1 })
      .expect(201); // NestJS POST 默认 201
    expect(res.body).toMatchObject({ code: 'OK', data: { name: 'ok', age: 1 } });
  });

  it('非白名单字段 → 400（forbidNonWhitelisted 仍生效）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/echo')
      .set('X-API-Key', KEY)
      .send({ name: 'ok', age: 1, hacker: 'x' })
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: 'VALIDATION_ERROR' });
    // 非白名单字段被拒：信封同样不含 fields
    expect(Object.keys(res.body).sort()).toEqual(
      ['code', 'message', 'path', 'requestId', 'statusCode', 'timestamp'].sort(),
    );
  });

  it('内部错误 → 500，production 不泄露内部 message', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/echo/boom')
      .set('X-API-Key', KEY)
      .expect(500);
    expect(res.body).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR' });
    expect(res.body.message).toBe('Internal server error');
  });
});
