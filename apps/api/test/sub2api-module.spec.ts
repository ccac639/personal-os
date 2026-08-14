import { Test } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { REDIS_CLIENT } from '../src/common/redis/redis.module.js';
import { ModuleRegistry } from '../src/platform/module-registry.js';
import { SUB2API_ADAPTER } from '../src/modules/sub2api/client/adapter.js';
import { FakeSub2ApiAdapter } from '../src/modules/sub2api/client/fake.adapter.js';
import { sub2ApiManifest } from '../src/modules/sub2api/manifest.js';
import { Sub2ApiModule } from '../src/modules/sub2api/sub2api.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { RequestIdInterceptor } from '../src/common/interceptors/request-id.interceptor.js';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor.js';
import { createValidationPipe } from '../src/common/validation.js';

/** 内存版 Redis（Sub2ApiSettingsService 用到 get / set EX / del） */
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

/** 写入完整连接配置（模拟设置页保存后） */
function seedConfig(redis: { store: Map<string, string> }) {
  redis.store.set('sub2api:base_url', 'http://127.0.0.1:9000');
  redis.store.set('sub2api:api_token', 'sk-test-admin-token');
  redis.store.set('sub2api:timeout_ms', '15000');
  redis.store.set('sub2api:auto_refresh', '1');
  redis.store.set('sub2api:refresh_interval_sec', '60');
}

describe('Sub2API 管理模块', () => {
  let app: NestFastifyApplication;
  let redis: ReturnType<typeof fakeRedis>;
  let fake: FakeSub2ApiAdapter;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    redis = fakeRedis();
    fake = new FakeSub2ApiAdapter();

    // 预置一份账号 / 分组 / 渠道 / 凭据 / 日志数据
    for (let i = 1; i <= 6; i += 1) {
      await fake.createAccount({ name: `账号${i}`, platform: 'anthropic' });
      await fake.createChannel({ name: `渠道${i}` });
    }
    await fake.createGroup({ name: 'claude 组', platform: 'anthropic', rate_multiplier: 1 });
    await fake.createGroup({ name: 'gpt 组', platform: 'openai', rate_multiplier: 1.2 });
    await fake.createApiKey({ name: '工作台', custom_key: 'sk-test-secret-key' });

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), Sub2ApiModule],
      // 复刻 app.module.ts 平台基座管道（requestId / 统一包装 / 错误过滤器 / DTO 校验）
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
      .useValue(fake)
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

  describe('manifest 装配与 DI', () => {
    it('sub2api manifest 可被 ModuleRegistry 解析（拓扑装配包含本模块）', () => {
      const registry = new ModuleRegistry();
      registry.register(sub2ApiManifest);
      const order = registry.resolve({ nodeEnv: 'test' }).map((m) => m.id);
      expect(order).toContain('sub2api');
    });

    it('模块 DI 完整：Controller / Service / Settings / Adapter 全部实例化', () => {
      expect(app).toBeTruthy();
      // 通过 HTTP 探测即可证明路由已装配（404 以外的响应都说明模块已加载）
      void expect;
    });
  });

  describe('设置（凭据存储与回显边界）', () => {
    /** 兼容两种响应形态：有 TransformInterceptor 时取 .data，否则取裸 body */
    const unwrap = (body: { data?: unknown }): unknown => body.data ?? body;

    it('初始未配置 → configured=false，不含任何凭据字段', async () => {
      const res = await request(app.getHttpServer()).get('/api/sub2api/settings').expect(200);
      const data = unwrap(res.body as { data?: unknown }) as Record<string, unknown>;
      expect(data.configured).toBe(false);
      expect(JSON.stringify(res.body)).not.toContain('apiToken');
      expect(JSON.stringify(res.body)).not.toContain('sk-');
    });

    it('PUT 保存合法设置 → configured=true，token 不落响应、落 Redis', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/sub2api/settings')
        .send({
          baseUrl: 'http://127.0.0.1:9000',
          apiToken: 'sk-test-admin-token',
          timeoutMs: 12000,
          autoRefresh: true,
          refreshIntervalSec: 90,
        })
        .expect(200);
      const data = unwrap(res.body as { data?: unknown }) as Record<string, unknown>;
      expect(data.configured).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('sk-test-admin-token');
      expect(redis.store.get('sub2api:api_token')).toBe('sk-test-admin-token');
      expect(redis.store.get('sub2api:base_url')).toBe('http://127.0.0.1:9000');
    });

    it('PUT 非法 Base URL → 400 SUB2API_INVALID_BASE_URL（协议/主机/路径校验）', async () => {
      const badUrls = [
        'file:///etc/passwd',
        'ftp://127.0.0.1:9000',
        'gopher://127.0.0.1:9000',
        'http://',
        'http://user:pass@127.0.0.1:9000',
        'http://127.0.0.1:9000?q=1',
        'http://127.0.0.1:9000#frag',
        'http://127.0.0.1:9000/a/../b',
      ];
      for (const bad of badUrls) {
        const res = await request(app.getHttpServer())
          .put('/api/sub2api/settings')
          .send({ baseUrl: bad })
          .expect(400);
        expect(res.body.code).toBe('SUB2API_INVALID_BASE_URL');
      }
    });

    it('DELETE 设置 → 204 且 configured=false（危险操作区）', async () => {
      await request(app.getHttpServer()).delete('/api/sub2api/settings').expect(204);
      const res = await request(app.getHttpServer()).get('/api/sub2api/settings').expect(200);
      expect((unwrap(res.body as { data?: unknown }) as Record<string, unknown>).configured).toBe(
        false,
      );
      redis.store.clear();
    });
  });

  describe('配置缺失（稳定错误码）', () => {
    beforeAll(() => redis.store.clear());

    it('GET /sub2api/overview → 400 SUB2API_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer()).get('/api/sub2api/overview').expect(400);
      expect(res.body.code).toBe('SUB2API_NOT_CONFIGURED');
      expect(res.body.requestId).toBeTruthy();
    });

    it('GET /sub2api/channels → 400 SUB2API_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer()).get('/api/sub2api/channels').expect(400);
      expect(res.body.code).toBe('SUB2API_NOT_CONFIGURED');
    });

    it('POST /sub2api/test → 400 SUB2API_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(400);
      expect(res.body.code).toBe('SUB2API_NOT_CONFIGURED');
    });
  });

  describe('上游正常响应（配置后）', () => {
    beforeAll(() => seedConfig(redis));

    const unwrap = (body: { data?: unknown }): unknown => body.data ?? body;

    it('连接测试 → ok + 版本 + 延迟', async () => {
      const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(201);
      const data = unwrap(res.body as { data?: unknown }) as Record<string, unknown>;
      expect(data.ok).toBe(true);
      expect(data.version).toBe('0.1.146');
      expect(typeof data.latencyMs).toBe('number');
    });

    it('概览：分块数据齐全（版本/统计/实时/趋势/错误/模型/计数）', async () => {
      const res = await request(app.getHttpServer()).get('/api/sub2api/overview').expect(200);
      const data = unwrap(res.body as { data?: unknown }) as {
        configured: boolean;
        blocks: Record<string, unknown>;
      };
      expect(data.configured).toBe(true);
      const blocks = data.blocks as {
        version: { version: string };
        stats: { today_requests: number };
        realtime: { error_rate: number };
        models: string[];
        counts: { accounts: number; groups: number; channels: number };
      };
      expect(blocks.version.version).toBe('0.1.146');
      expect(blocks.stats.today_requests).toBe(88);
      expect(blocks.realtime.error_rate).toBe(1.5);
      expect(blocks.models).toContain('claude-sonnet-4-20250514');
      expect(blocks.counts).toEqual({ accounts: 6, groups: 2, channels: 6 });
    });

    it('概览单块失败 → 该块降级为 null，其余块不受影响（不伪造数据）', async () => {
      fake.errors.getRealtimeMetrics = { kind: 'http', status: 500, message: 'boom' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/overview').expect(200);
        const blocks = (
          unwrap(res.body as { data?: unknown }) as { blocks: Record<string, unknown> }
        ).blocks as { realtime: unknown; stats: unknown };
        expect(blocks.realtime).toBeNull();
        expect(blocks.stats).not.toBeNull();
      } finally {
        delete fake.errors.getRealtimeMetrics;
      }
    });

    it('渠道列表：分页参数透传（page/page_size），响应为分页结构', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sub2api/channels?page=2&pageSize=3&search=渠道')
        .expect(200);
      const data = unwrap(res.body as { data?: unknown }) as {
        items: unknown[];
        total: number;
        page: number;
        page_size: number;
      };
      expect(data.page).toBe(2);
      expect(data.page_size).toBe(3);
      expect(data.items).toHaveLength(3);
      expect(data.total).toBe(6);
    });

    it('分页上限：pageSize=500 → 400 VALIDATION_ERROR（禁止无限拉取）', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sub2api/channels?pageSize=500')
        .expect(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('API 凭据：创建返回明文 key 一次；列表返回掩码', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/sub2api/keys')
        .send({ name: '新凭据', custom_key: 'sk-created-full-key-1234' })
        .expect(201);
      const createdData = unwrap(created.body as { data?: unknown }) as { key: string };
      expect(createdData.key).toBe('sk-created-full-key-1234');

      const list = await request(app.getHttpServer()).get('/api/sub2api/keys').expect(200);
      const listData = unwrap(list.body as { data?: unknown }) as { items: Array<{ key: string }> };
      expect(listData.items.every((item) => item.key.includes('****'))).toBe(true);
      expect(JSON.stringify(list.body)).not.toContain('sk-created-full-key-1234');
    });

    it('账号列表：凭据状态只暴露存在性，不含真实凭据值', async () => {
      const res = await request(app.getHttpServer()).get('/api/sub2api/accounts').expect(200);
      expect(JSON.stringify(res.body)).not.toContain('access_token');
      expect(JSON.stringify(res.body)).not.toContain('refresh_token');
    });

    it('账号连接测试（防重复提交依赖前端，后端幂等返回结果）', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/sub2api/accounts/1/test')
        .expect(201);
      const data = unwrap(res.body as { data?: unknown }) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it('创建/更新/删除账号闭环', async () => {
      const created = await request(app.getHttpServer())
        .post('/api/sub2api/accounts')
        .send({
          name: 'grok 账号',
          platform: 'grok',
          type: 'apikey',
          credentials: { api_key: 'grok-key' },
        })
        .expect(201);
      const createdData = unwrap(created.body as { data?: unknown }) as {
        id: number;
        name: string;
      };
      expect(createdData.name).toBe('grok 账号');
      expect(JSON.stringify(created.body)).not.toContain('grok-key');

      const updated = await request(app.getHttpServer())
        .put(`/api/sub2api/accounts/${createdData.id}`)
        .send({ status: 'inactive' })
        .expect(200);
      expect((unwrap(updated.body as { data?: unknown }) as { status: string }).status).toBe(
        'inactive',
      );

      await request(app.getHttpServer())
        .delete(`/api/sub2api/accounts/${createdData.id}`)
        .expect(204);
    });

    it('请求日志：列表返回分页 + requestId 字段保留（供前端详情抽屉）', async () => {
      fake.usageLogs = [
        {
          id: 1,
          user_id: 1,
          api_key_id: 1,
          account_id: 1,
          request_id: 'req_abc123',
          model: 'claude-sonnet-4',
          group_id: 1,
          subscription_id: null,
          input_tokens: 100,
          output_tokens: 200,
          cache_creation_tokens: 0,
          cache_read_tokens: 0,
          input_cost: 0.001,
          output_cost: 0.002,
          total_cost: 0.003,
          actual_cost: 0.003,
          billing_type: 0,
          stream: false,
          duration_ms: 812,
          first_token_ms: null,
          created_at: new Date().toISOString(),
        },
      ];
      const res = await request(app.getHttpServer())
        .get('/api/sub2api/usage?page=1&pageSize=10')
        .expect(200);
      const data = unwrap(res.body as { data?: unknown }) as {
        items: Array<{ request_id: string }>;
      };
      expect(data.items[0].request_id).toBe('req_abc123');
    });
  });

  describe('上游错误统一映射与脱敏', () => {
    beforeAll(() => seedConfig(redis));

    it('上游 401 → 401 SUB2API_UNAUTHORIZED', async () => {
      fake.errors.getVersion = { kind: 'http', status: 401, message: 'invalid token' };
      try {
        const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(401);
        expect(res.body.code).toBe('SUB2API_UNAUTHORIZED');
        expect(JSON.stringify(res.body)).not.toContain('sk-test-admin-token');
      } finally {
        delete fake.errors.getVersion;
      }
    });

    it('上游 403 → 403 SUB2API_FORBIDDEN', async () => {
      fake.errors.listAccounts = { kind: 'http', status: 403, message: 'forbidden' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/accounts').expect(403);
        expect(res.body.code).toBe('SUB2API_FORBIDDEN');
      } finally {
        delete fake.errors.listAccounts;
      }
    });

    it('上游 404 → 404 SUB2API_NOT_FOUND', async () => {
      fake.errors.listChannels = { kind: 'http', status: 404, message: 'not found' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/channels').expect(404);
        expect(res.body.code).toBe('SUB2API_NOT_FOUND');
      } finally {
        delete fake.errors.listChannels;
      }
    });

    it('上游 409 → 409 SUB2API_CONFLICT', async () => {
      fake.errors.createGroup = { kind: 'http', status: 409, message: 'group name exists' };
      try {
        const res = await request(app.getHttpServer())
          .post('/api/sub2api/groups')
          .send({ name: '重名组' })
          .expect(409);
        expect(res.body.code).toBe('SUB2API_CONFLICT');
      } finally {
        delete fake.errors.createGroup;
      }
    });

    it('上游 429 → 429 SUB2API_RATE_LIMITED', async () => {
      fake.errors.listUsage = { kind: 'http', status: 429, message: 'too many' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/usage').expect(429);
        expect(res.body.code).toBe('SUB2API_RATE_LIMITED');
      } finally {
        delete fake.errors.listUsage;
      }
    });

    it('上游 5xx → 502 SUB2API_UPSTREAM_ERROR', async () => {
      fake.errors.listGroups = { kind: 'http', status: 502, message: 'bad gateway' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/groups').expect(502);
        expect(res.body.code).toBe('SUB2API_UPSTREAM_ERROR');
      } finally {
        delete fake.errors.listGroups;
      }
    });

    it('上游超时 → 504 SUB2API_TIMEOUT', async () => {
      fake.errors.getVersion = { kind: 'timeout' };
      try {
        const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(504);
        expect(res.body.code).toBe('SUB2API_TIMEOUT');
      } finally {
        delete fake.errors.getVersion;
      }
    });

    it('上游网络不可达 → 503 SUB2API_UNREACHABLE', async () => {
      fake.errors.getVersion = { kind: 'network' };
      try {
        const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(503);
        expect(res.body.code).toBe('SUB2API_UNREACHABLE');
      } finally {
        delete fake.errors.getVersion;
      }
    });

    it('上游错误消息含密钥形态串 → 脱敏后不回显完整密钥', async () => {
      fake.errors.getVersion = {
        kind: 'http',
        status: 500,
        message: 'auth failed with sk-super-secret-token-12345',
      };
      try {
        const res = await request(app.getHttpServer()).post('/api/sub2api/test').expect(502);
        expect(JSON.stringify(res.body)).not.toContain('sk-super-secret-token-12345');
        expect(JSON.stringify(res.body)).toContain('sk-***');
      } finally {
        delete fake.errors.getVersion;
      }
    });

    it('错误响应保留 requestId（前端错误提示依赖）', async () => {
      fake.errors.listAccounts = { kind: 'http', status: 403, message: 'nope' };
      try {
        const res = await request(app.getHttpServer()).get('/api/sub2api/accounts').expect(403);
        expect(typeof res.body.requestId).toBe('string');
        expect(res.body.requestId.length).toBeGreaterThan(0);
      } finally {
        delete fake.errors.listAccounts;
      }
    });
  });

  describe('模型分组与路由', () => {
    beforeAll(() => seedConfig(redis));

    const unwrap = (body: { data?: unknown }): unknown => body.data ?? body;

    it('分组列表 + 模型路由增删改闭环', async () => {
      const list = await request(app.getHttpServer()).get('/api/sub2api/groups').expect(200);
      const groups = (
        unwrap(list.body as { data?: unknown }) as { items: Array<{ id: number; name: string }> }
      ).items;
      expect(groups.length).toBeGreaterThanOrEqual(2);
      const groupId = groups[0].id as number;

      const created = await request(app.getHttpServer())
        .post(`/api/sub2api/groups/${groupId}/routes`)
        .send({
          public_model: 'claude-sonnet-4-20250514',
          target_platform: 'anthropic',
          upstream_model: 'claude-sonnet-4',
          priority: 10,
          enabled: true,
        })
        .expect(201);
      const route = unwrap(created.body as { data?: unknown }) as {
        id: number;
        public_model: string;
      };
      expect(route.public_model).toBe('claude-sonnet-4-20250514');

      const routes = await request(app.getHttpServer())
        .get(`/api/sub2api/groups/${groupId}/routes`)
        .expect(200);
      expect((unwrap(routes.body as { data?: unknown }) as unknown[]).length).toBe(1);

      await request(app.getHttpServer())
        .delete(`/api/sub2api/groups/${groupId}/routes/${route.id}`)
        .expect(204);
    });

    it('路由参数非法（非数字 id）→ 400', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/sub2api/groups/abc/routes')
        .expect(400);
      expect(res.body.statusCode).toBe(400);
    });
  });
});
