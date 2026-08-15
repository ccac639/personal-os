/**
 * 输入净化测试（Phase 4：trim + 控制字符清除）。
 *
 * 验证 sub2api 透传 DTO 的字符串字段在保存/透传前被净化：
 * - 首尾空白 trim；
 * - 控制字符（\u0000-\u0008 \u000b \u000c \u000e-\u001f，含 ANSI ESC \u001b）清除；
 * - 防日志注入 / 终端注入 / 脏数据入库。
 *
 * 注意：ESC（\u001b）被删除后，ANSI 序列的可见部分（如 [31m）保留为普通
 * 文本——已无终端转义效果，这正是防注入目标。
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

/** 内存版 Redis + 预置连接配置（模拟已配置上游） */
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

function seedConfig(redis: { store: Map<string, string> }) {
  redis.store.set('sub2api:base_url', 'http://127.0.0.1:9000');
  redis.store.set('sub2api:api_token', 'sk-test-admin-token');
  redis.store.set('sub2api:timeout_ms', '15000');
  redis.store.set('sub2api:auto_refresh', '1');
  redis.store.set('sub2api:refresh_interval_sec', '60');
}

/** 记录透传 input 的适配器（fake adapter 创建响应不回显 notes / ip_whitelist） */
class RecordingAdapter extends FakeSub2ApiAdapter {
  accountInputs: Array<Record<string, unknown>> = [];
  apiKeyInputs: Array<Record<string, unknown>> = [];

  override async createAccount(input: Record<string, unknown>) {
    this.accountInputs.push({ ...input });
    return super.createAccount(input);
  }

  override async createApiKey(input: Record<string, unknown>) {
    this.apiKeyInputs.push({ ...input });
    return super.createApiKey(input);
  }
}

type Envelope<T> = { data: T };

describe('sub2api 输入净化（trim + 控制字符清除）', () => {
  let app: NestFastifyApplication;
  let recording: RecordingAdapter;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    const redis = fakeRedis();
    seedConfig(redis);
    recording = new RecordingAdapter();

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
      .useValue(recording)
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

  it('渠道名称：trim + ANSI ESC 清除（[31m 保留为普通文本，无转义效果）', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sub2api/channels')
      .send({ name: '  Claude\u001b[31mX  ' })
      .expect(201);
    const data = (res.body as Envelope<{ name: string }>).data;
    // ESC(27) 已删除：'[31m' 只是可见文本，不再是终端转义序列
    expect(data.name).toBe('Claude[31mX');
    expect([...data.name].map((c) => c.charCodeAt(0))).not.toContain(27);
  });

  it('账号名称 / 备注：透传给 adapter 前已被净化', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/sub2api/accounts')
      .send({ name: ' \u0000grok\u0000 ', platform: 'grok', notes: 'a\u0007b\u001bc' })
      .expect(201);
    // 响应回显 name（trim + 去 NUL）
    expect((res.body as Envelope<{ name: string }>).data.name).toBe('grok');
    // adapter 收到的 input 已净化（notes 不回显，用记录验证）
    const input = recording.accountInputs.at(-1);
    expect(input?.name).toBe('grok');
    expect(input?.notes).toBe('abc');
  });

  it('Base URL：保存时净化尾部空白与控制字符', async () => {
    await request(app.getHttpServer())
      .put('/api/sub2api/settings')
      .send({ baseUrl: ' https://sub2api.example.com\u001b ' })
      .expect(200);

    const res = await request(app.getHttpServer()).get('/api/sub2api/settings').expect(200);
    const data = (res.body as Envelope<{ configured: boolean; baseUrlMasked: string | null }>).data;
    expect(data.configured).toBe(true);
    expect(data.baseUrlMasked).toBeTruthy();
    expect(data.baseUrlMasked).not.toContain('\u001b');
  });

  it('IP 白名单数组元素逐个净化（透传给 adapter 前）', async () => {
    await request(app.getHttpServer())
      .post('/api/sub2api/keys')
      .send({ name: 'key', ip_whitelist: [' 127.0.0.1 ', '\u000710.0.0.1\u0007'] })
      .expect(201);
    const input = recording.apiKeyInputs.at(-1);
    expect(input?.ip_whitelist).toEqual(['127.0.0.1', '10.0.0.1']);
  });
});
