/**
 * API E2E 冒烟测试（需要本地 MongoDB 已启动：pnpm docker:up）
 *
 * 运行：pnpm --filter @personal-os/api test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { describe, it } from 'vitest';

import { AppModule } from '../src/app.module.js';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api 返回 Swagger UI HTML', async () => {
    const res = await request(app.getHttpServer()).get('/api').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
  });
});
