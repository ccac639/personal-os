import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { VersioningType } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

describe('API 版本化（URI，无 defaultVersion，ADR-0015）', () => {
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
    app.enableVersioning({ type: VersioningType.URI });
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

  it('未版本化路由保持 /api 前缀不变（零破坏）', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    expect(res.body).toMatchObject({ code: 'OK', data: { pong: true } });
  });

  it('版本化路由通过 /api/v2 访问', async () => {
    const res = await request(app.getHttpServer()).get('/api/v2/versioned').expect(200);
    expect(res.body).toMatchObject({ code: 'OK', data: { version: 'v2' } });
  });

  it('版本化路由不接受无版本前缀路径（404）', async () => {
    await request(app.getHttpServer()).get('/api/versioned').expect(404);
  });

  it('未版本化路由不接受版本前缀路径（404）', async () => {
    await request(app.getHttpServer()).get('/api/v2/echo/ping').expect(404);
  });
});
