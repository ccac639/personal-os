import { ConfigService } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ExecutionContext } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ApiKeyGuard } from '../src/common/guards/api-key.guard.js';
import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

const TEST_KEY = 'test-secret-api-key-123';

function makeContext(method: string, url: string, headers: Record<string, string> = {}): ExecutionContext {
  const request = { method, url, headers } as unknown as FastifyRequest;
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getType: () => 'http',
  } as unknown as ExecutionContext;
}

function makeGuard(apiKey: string | undefined): ApiKeyGuard {
  return new ApiKeyGuard({ get: (key: string) => (key === 'apiKey' ? apiKey : undefined) } as unknown as ConfigService);
}

describe('ApiKeyGuard（单元）', () => {
  it('未配置 PERSONAL_OS_API_KEY → 全部放行', () => {
    const guard = makeGuard(undefined);
    expect(guard.canActivate(makeContext('GET', '/api/ping'))).toBe(true);
  });

  it('配置后：正确 Key 放行，缺失 / 错误 Key 抛 401', () => {
    const guard = makeGuard(TEST_KEY);
    expect(guard.canActivate(makeContext('GET', '/api/ping', { 'x-api-key': TEST_KEY }))).toBe(true);

    expect(() => guard.canActivate(makeContext('GET', '/api/ping'))).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'API_KEY_MISSING', statusCode: 401 }) }),
    );
    expect(() => guard.canActivate(makeContext('GET', '/api/ping', { 'x-api-key': 'wrong-key' }))).toThrowError(
      expect.objectContaining({ response: expect.objectContaining({ code: 'API_KEY_INVALID', statusCode: 401 }) }),
    );
  });

  it('豁免路径：/api/health、Swagger 文档（/api、/api-json）、OPTIONS 预检', () => {
    const guard = makeGuard(TEST_KEY);
    for (const url of ['/api/health', '/api/health/', '/api', '/api/', '/api-json', '/api-json?x=1']) {
      expect(guard.canActivate(makeContext('GET', url))).toBe(true);
    }
    expect(guard.canActivate(makeContext('OPTIONS', '/api/ping'))).toBe(true);
  });
});

describe('ApiKeyGuard（HTTP 集成）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    process.env.PERSONAL_OS_API_KEY = TEST_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [PlatformTestModule] }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PERSONAL_OS_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.API_HOST;
    delete process.env.API_PORT;
    delete process.env.MONGODB_URI;
    delete process.env.REDIS_URL;
    delete process.env.CORS_ORIGIN;
  });

  it('未带 Key → 401 API_KEY_MISSING', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping').expect(401);
    expect(res.body).toMatchObject({ code: 'API_KEY_MISSING', statusCode: 401 });
  });

  it('错误 Key → 401 API_KEY_INVALID', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping').set('X-API-Key', 'wrong').expect(401);
    expect(res.body).toMatchObject({ code: 'API_KEY_INVALID', statusCode: 401 });
  });

  it('正确 Key → 200', async () => {
    const res = await request(app.getHttpServer()).get('/api/ping').set('X-API-Key', TEST_KEY).expect(200);
    expect(res.body).toMatchObject({ code: 'OK', data: { pong: true } });
  });

  it('health 豁免：不带 Key 也可访问 /api/health', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body.data).toMatchObject({ status: 'ok', services: { api: 'up' } });
  });
});
