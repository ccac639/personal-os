import helmet from '@fastify/helmet';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildCorsOptions } from '../src/common/cors.js';
import { buildHelmetOptions } from '../src/common/security/helmet.js';
import { PlatformTestModule } from '../src/common/testing/platform-fixtures.js';

describe('安全响应头（helmet + CSP）', () => {
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
    // 与 main.ts 相同的 helmet + CORS 注册方式（协调验证）
    await app.register(helmet, buildHelmetOptions());
    app.enableCors(buildCorsOptions('http://localhost:5173'));
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

  it('成功响应携带 helmet 安全头', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('CSP：script-src 仅同源（无 CDN / 无内联脚本），Swagger 同源资源不受影响', async () => {
    const res = await request(app.getHttpServer()).get('/api/echo/ping').expect(200);
    const csp = res.headers['content-security-policy'] as string;
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    // Swagger UI 资源全部同源服务（swagger-ui-dist），不应需要任何外部域名
    expect(csp).not.toContain('cdn.');
    expect(csp).not.toContain('unpkg');
  });

  it('错误响应（404）同样携带安全头（helmet 全局生效）', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').expect(404);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('CORS 预检 OPTIONS 仍正常（helmet 与 cors 协调）', async () => {
    const res = await request(app.getHttpServer())
      .options('/api/echo/ping')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });
});
