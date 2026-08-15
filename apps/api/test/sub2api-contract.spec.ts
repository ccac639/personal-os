/**
 * Sub2API 31 端点契约测试（consumer-driven 契约锁定）。
 *
 * 目的：显式枚举 31 端点 URL + HTTP 方法，锁定「路由存在且未配置行为稳定」，
 * 防止版本化（/api/v1 误标）、重构、删除端点或路径变更破坏前端/上游契约。
 *
 * 断言逻辑（未配置上游时）：
 * - 本地设置端点（settings 三件套）：正常响应（200/204），不依赖上游；
 * - 其余全部上游依赖端点：400 + SUB2API_NOT_CONFIGURED（证明路由存在且错误码稳定），
 *   而非 404（路由不存在）。
 *
 * 说明：端点行为细节（分页/信封/脱敏）由 sub2api-module.spec.ts 覆盖，
 * 本文件专注 URL + 方法 + 未配置契约。
 */
import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDIS_CLIENT } from '../src/common/redis/redis.module.js';
import { SUB2API_ADAPTER } from '../src/modules/sub2api/client/adapter.js';
import { FakeSub2ApiAdapter } from '../src/modules/sub2api/client/fake.adapter.js';
import { Sub2ApiModule } from '../src/modules/sub2api/sub2api.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { RequestIdInterceptor } from '../src/common/interceptors/request-id.interceptor.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { createValidationPipe } from '../src/common/validation.js';

/** 内存版 Redis（未预置配置 → 模拟未连接上游） */
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

/** 31 端点契约清单：method + path（path 为 controller 相对路径，不含 /api 前缀） */
interface ContractEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  /** 本地设置端点（不依赖上游配置） */
  local?: boolean;
  /** 需要合法 body / 参数才能通过 DTO/Param 校验的端点（未配置时仍应命中 SUB2API_NOT_CONFIGURED） */
  body?: Record<string, unknown>;
}

const CONTRACT_ENDPOINTS: ContractEndpoint[] = [
  // ---------- 设置（本地） ----------
  { method: 'GET', path: '/sub2api/settings', local: true },
  {
    method: 'PUT',
    path: '/sub2api/settings',
    local: true,
    body: { baseUrl: 'https://sub2api.example.com', timeoutMs: 15000 },
  },
  { method: 'DELETE', path: '/sub2api/settings', local: true },
  // ---------- 连接测试 / 概览 ----------
  { method: 'POST', path: '/sub2api/test' },
  { method: 'GET', path: '/sub2api/overview' },
  // ---------- 渠道 ----------
  { method: 'GET', path: '/sub2api/channels' },
  { method: 'POST', path: '/sub2api/channels', body: { name: 'contract-test' } },
  { method: 'PUT', path: '/sub2api/channels/1', body: { name: 'contract-test' } },
  { method: 'DELETE', path: '/sub2api/channels/1' },
  // ---------- 账号 ----------
  { method: 'GET', path: '/sub2api/accounts' },
  {
    method: 'POST',
    path: '/sub2api/accounts',
    body: { name: 'contract-test', platform: 'anthropic' },
  },
  {
    method: 'PUT',
    path: '/sub2api/accounts/1',
    body: { name: 'contract-test', platform: 'anthropic' },
  },
  { method: 'DELETE', path: '/sub2api/accounts/1' },
  { method: 'POST', path: '/sub2api/accounts/1/test' },
  // ---------- 订阅 ----------
  { method: 'GET', path: '/sub2api/subscriptions' },
  { method: 'POST', path: '/sub2api/subscriptions/1/revoke' },
  // ---------- 模型分组 / 路由 ----------
  { method: 'GET', path: '/sub2api/groups/all' },
  { method: 'GET', path: '/sub2api/groups' },
  { method: 'POST', path: '/sub2api/groups', body: { name: 'contract-test' } },
  { method: 'PUT', path: '/sub2api/groups/1', body: { name: 'contract-test' } },
  { method: 'DELETE', path: '/sub2api/groups/1' },
  { method: 'GET', path: '/sub2api/groups/1/routes' },
  {
    method: 'POST',
    path: '/sub2api/groups/1/routes',
    body: { public_model: 'contract-model', target_platform: 'anthropic' },
  },
  {
    method: 'PUT',
    path: '/sub2api/groups/1/routes/1',
    body: { public_model: 'contract-model', target_platform: 'anthropic' },
  },
  { method: 'DELETE', path: '/sub2api/groups/1/routes/1' },
  // ---------- API 凭据 ----------
  { method: 'GET', path: '/sub2api/keys' },
  { method: 'POST', path: '/sub2api/keys', body: { name: 'contract-test' } },
  { method: 'PUT', path: '/sub2api/keys/1', body: { name: 'contract-test' } },
  { method: 'DELETE', path: '/sub2api/keys/1' },
  // ---------- 请求日志 ----------
  { method: 'GET', path: '/sub2api/usage' },
  { method: 'GET', path: '/sub2api/usage/stats' },
];

describe('Sub2API 31 端点契约（URL + 方法 + 未配置行为）', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    const redis = fakeRedis();

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
      .overrideProvider(SUB2API_ADAPTER)
      .useValue(new FakeSub2ApiAdapter())
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    app.setGlobalPrefix('api');
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
  });

  it('契约清单恰为 31 个端点（防清单漂移）', () => {
    expect(CONTRACT_ENDPOINTS).toHaveLength(31);
  });

  it.each(CONTRACT_ENDPOINTS)(
    '$method /api$path（$local ? 本地设置 : 上游依赖）',
    async (endpoint) => {
      const url = `/api${endpoint.path}`;
      const res = await request(app.getHttpServer())
        [endpoint.method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'](url)
        .send(endpoint.body ?? {});

      // 路由必须存在（禁止 404 / 5xx）
      expect(res.status, `${endpoint.method} ${url} 路由应存在`).not.toBe(404);
      expect(res.status, `${endpoint.method} ${url} 不应 5xx`).toBeLessThan(500);

      if (endpoint.local) {
        // 本地设置端点：不依赖上游，返回正常业务响应
        expect([200, 204]).toContain(res.status);
        return;
      }

      // 上游依赖端点：未配置 → 400 + 稳定错误码（证明契约错误语义）
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ code: 'SUB2API_NOT_CONFIGURED' });
    },
  );
});
