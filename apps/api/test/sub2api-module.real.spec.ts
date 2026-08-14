/**
 * Sub2API 真实后端冒烟测试（阶段 2 双模；CI 默认 skip）。
 *
 * 运行条件（环境变量，仅进程内）：
 *   SUB2API_REAL_BACKEND=1
 *   SUB2API_REAL_BASE_URL=https://sub2api.example.com
 *   SUB2API_REAL_TOKEN=<管理端 Bearer token>
 *
 * 设计：
 * - 不 override SUB2API_ADAPTER → 模块注入真实 Sub2ApiClient（真实 fetch）；
 * - Redis 用内存替身（本测试不落盘任何凭据）；
 * - 断言只检查「信封结构合法」或「稳定 SUB2API_* 错误码」，不打印响应原文；
 * - 真实响应体（含 PII）绝不写入快照 / 日志 / 文件。
 */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDIS_CLIENT } from '../src/common/redis/redis.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { RequestIdInterceptor } from '../src/common/interceptors/request-id.interceptor.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { createValidationPipe } from '../src/common/validation.js';
import { Sub2ApiModule } from '../src/modules/sub2api/sub2api.module.js';
import { SUB2API_ERR } from '../src/modules/sub2api/errors/sub2api.errors.js';
import {
  realSub2ApiEnv,
  SUB2API_REAL_ENABLED,
  sub2ApiTestModeLabel,
} from './helpers/sub2api-real-env.js';

/** 内存版 Redis（Sub2ApiSettingsService 用 get / set EX / del） */
function fakeRedis() {
  const store = new Map<string, string>();
  return {
    store,
    async get(key: string): Promise<string | null> {
      return store.get(key) ?? null;
    },
    async set(key: string, value: string, mode?: string, ttlSeconds?: number): Promise<'OK'> {
      store.set(key, value);
      void mode;
      void ttlSeconds;
      return 'OK';
    },
    async del(...keys: string[]): Promise<number> {
      let deleted = 0;
      for (const key of keys) {
        if (store.delete(key)) deleted += 1;
      }
      return deleted;
    },
    async quit(): Promise<'OK'> {
      return 'OK';
    },
  };
}

/** 已知稳定错误码集合：链路可达但认证/网络/上游异常时，断言必须命中其一 */
const KNOWN_STABLE_CODES = new Set<string>([
  SUB2API_ERR.UNAUTHORIZED,
  SUB2API_ERR.FORBIDDEN,
  SUB2API_ERR.NOT_FOUND,
  SUB2API_ERR.CONFLICT,
  SUB2API_ERR.RATE_LIMITED,
  SUB2API_ERR.TIMEOUT,
  SUB2API_ERR.UPSTREAM_ERROR,
  SUB2API_ERR.UPSTREAM_TOO_LARGE,
  SUB2API_ERR.UNREACHABLE,
]);

describe.skipIf(!SUB2API_REAL_ENABLED)('Sub2API 真实后端冒烟（SUB2API_REAL_BACKEND=1）', () => {
  let app: NestFastifyApplication;
  let redis: ReturnType<typeof fakeRedis>;

  beforeAll(async () => {
    // 凭据齐备性校验：缺失即整组失败（提示配置不完整），不静默 skip
    const env = realSub2ApiEnv();
    redis = fakeRedis();
    redis.store.set('sub2api:base_url', env.baseUrl);
    redis.store.set('sub2api:api_token', env.apiToken);
    redis.store.set('sub2api:timeout_ms', '15000');

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), Sub2ApiModule],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
        { provide: APP_INTERCEPTOR, useClass: TransformInterceptor },
        { provide: APP_PIPE, useFactory: () => createValidationPipe() },
      ],
    })
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis as never)
      // 注意：不 override SUB2API_ADAPTER —— 真实 Sub2ApiClient + 真实 fetch
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    if (app) await app.close();
    redis?.store.clear(); // 内存凭据即刻清理
  });

  /** 成功响应（TransformInterceptor 包装）解包 */
  function unwrap<T>(body: { data?: T }): T {
    return body.data as T;
  }

  /** 断言响应要么是合法信封结构，要么是稳定错误码（不打印响应原文） */
  function expectStableOrOk(
    status: number,
    body: { code?: string },
    stableCodes: Set<string>,
  ): void {
    if (status >= 400) {
      expect(stableCodes.has(body.code ?? '')).toBe(true);
      expect(body.code).not.toBe('INTERNAL_ERROR');
    }
    // 2xx 时由各用例继续断言结构
  }

  it(`[${sub2ApiTestModeLabel()}] 连接测试：版本端点可达且信封结构合法`, async () => {
    const res = await request(app.getHttpServer()).post('/api/sub2api/test');
    expectStableOrOk(res.status, res.body as { code?: string }, KNOWN_STABLE_CODES);
    if (res.status < 400) {
      const data = unwrap(res.body as { data?: { ok?: boolean; version?: string } });
      expect(typeof data.ok).toBe('boolean');
      expect(typeof data.version).toBe('string');
    }
  });

  it('概览：各数据块为合法结构或 null（分块降级不崩溃）', async () => {
    const res = await request(app.getHttpServer()).get('/api/sub2api/overview');
    expectStableOrOk(res.status, res.body as { code?: string }, KNOWN_STABLE_CODES);
    if (res.status < 400) {
      const data = unwrap(
        res.body as {
          data?: { blocks?: Record<string, unknown>; snapshot?: Record<string, unknown> };
        },
      );
      expect(data.snapshot).toBeTruthy();
      expect(typeof data.blocks).toBe('object');
    }
  });

  it('渠道列表：分页信封结构合法', async () => {
    const res = await request(app.getHttpServer()).get('/api/sub2api/channels?page=1&pageSize=5');
    expectStableOrOk(res.status, res.body as { code?: string }, KNOWN_STABLE_CODES);
    if (res.status < 400) {
      const data = unwrap(
        res.body as {
          data?: { items?: unknown[]; total?: number; page?: number; page_size?: number };
        },
      );
      expect(Array.isArray(data.items)).toBe(true);
      expect(typeof data.total).toBe('number');
      expect(typeof data.page).toBe('number');
    }
  });

  it('API 凭据列表：分页信封结构合法（含 key 掩码字段）', async () => {
    const res = await request(app.getHttpServer()).get('/api/sub2api/keys?page=1&pageSize=5');
    expectStableOrOk(res.status, res.body as { code?: string }, KNOWN_STABLE_CODES);
    if (res.status < 400) {
      const data = unwrap(res.body as { data?: { items?: unknown[] } });
      expect(Array.isArray(data.items)).toBe(true);
    }
  });

  it('请求日志：分页信封结构合法', async () => {
    const res = await request(app.getHttpServer()).get('/api/sub2api/usage?page=1&pageSize=5');
    expectStableOrOk(res.status, res.body as { code?: string }, KNOWN_STABLE_CODES);
    if (res.status < 400) {
      const data = unwrap(res.body as { data?: { items?: unknown[] } });
      expect(Array.isArray(data.items)).toBe(true);
    }
  });

  it('管理凭据绝不回显：任意响应体不得包含 token 明文', async () => {
    const res = await request(app.getHttpServer()).get('/api/sub2api/settings');
    const env = realSub2ApiEnv();
    expect(JSON.stringify(res.body)).not.toContain(env.apiToken);
    // Base URL 允许回显（设置页必需，仅掩码内嵌凭据；userinfo 形式已被 validateBaseUrl 拒绝）
    if (res.status < 400) {
      const data = unwrap(
        res.body as { data?: { configured?: boolean; baseUrlMasked?: string | null } },
      );
      expect(typeof data.configured).toBe('boolean');
    }
  });
});
