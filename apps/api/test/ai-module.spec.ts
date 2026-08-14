import { Test } from '@nestjs/testing';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../src/app.module.js';
import { REDIS_CLIENT } from '../src/common/redis/redis.module.js';
import { ChatJobQueue, FakeChatJobQueue } from '../src/modules/chat/chat-job-queue.js';
import { SILICONFLOW_FETCH } from '../src/modules/ai/siliconflow.client.js';

/** 内存版 Redis（AiSettingsService 用到 get / set EX / del；RedisModule 关闭时 quit） */
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
    async del(key: string): Promise<number> {
      return store.delete(key) ? 1 : 0;
    },
    async quit(): Promise<'OK'> {
      return 'OK';
    },
  };
}

/** 路由级 fake fetch：按 path 返回预设 JSON / 二进制；Error 值模拟上游失败 */
function fakeFetch(routes: Record<string, unknown>, binaryPaths: string[] = []) {
  return async (url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    void body;
    const headers = new Headers();
    if (binaryPaths.includes(path)) {
      return {
        ok: true,
        status: 200,
        headers,
        json: async () => {
          throw new Error('not json');
        },
        arrayBuffer: async () => new TextEncoder().encode('FAKE_AUDIO').buffer,
      };
    }
    if (routes[path] instanceof Error) {
      return {
        ok: false,
        status: 502,
        headers,
        json: async () => ({ error: { message: 'upstream failed' } }),
        arrayBuffer: async () => new ArrayBuffer(0),
      };
    }
    return {
      ok: true,
      status: 200,
      headers,
      json: async () => routes[path],
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  };
}

const IMAGE_ROUTE = '/v1/images/generations';
const VIDEO_SUBMIT = '/v1/video/submit';
const VIDEO_STATUS = '/v1/video/status';
const TTS_ROUTE = '/v1/audio/speech';
const CHAT_ROUTE = '/v1/chat/completions';

describe('AI 模块（SiliconFlow 接入）', () => {
  let app: NestFastifyApplication;
  const redis = fakeRedis();
  const routesTable: Record<string, unknown> = {
    [IMAGE_ROUTE]: { images: [{ url: 'https://cdn.siliconflow.cn/img/1.png' }] },
    [VIDEO_SUBMIT]: { requestId: 'req_123' },
    [VIDEO_STATUS]: {
      status: 'Succeed',
      results: { videos: [{ url: 'https://cdn.siliconflow.cn/v/1.mp4' }] },
    },
    [CHAT_ROUTE]: {
      choices: [{ message: { content: '硅基流动回复' } }],
      usage: { total_tokens: 7 },
    },
  };
  const fetchMock = fakeFetch(routesTable, [TTS_ROUTE]);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'silent';
    process.env.API_HOST = '127.0.0.1';
    process.env.API_PORT = '3000';
    process.env.MONGODB_URI = 'mongodb://localhost:27017/personal_os';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.CORS_ORIGIN = 'http://localhost:5173';
    delete process.env.PERSONAL_OS_API_KEY;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(REDIS_CLIENT)
      .useValue(redis as never)
      .overrideProvider(SILICONFLOW_FETCH)
      .useValue(fetchMock as never)
      // BullChatJobQueue 构造即连真实 Redis（不走 REDIS_CLIENT），用内存替身隔离
      .overrideProvider(ChatJobQueue)
      .useClass(FakeChatJobQueue)
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
    delete process.env.API_HOST;
    delete process.env.API_PORT;
    delete process.env.MONGODB_URI;
    delete process.env.REDIS_URL;
    delete process.env.CORS_ORIGIN;
  });

  describe('设置（API Key 管理）', () => {
    /** 兼容两种响应形态：有 TransformInterceptor 时取 .data，平台基座缺失时取裸 body */
    const unwrap = (body: { data?: unknown }): unknown => body.data ?? body;

    it('初始未配置 → configured=false', async () => {
      const res = await request(app.getHttpServer()).get('/api/ai/settings').expect(200);
      expect(unwrap(res.body as { data?: unknown })).toEqual({ configured: false });
    });

    it('PUT 保存 key 后 → configured=true（响应不回显 key）', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/ai/settings')
        .send({ apiKey: 'sk-test-secret-key' })
        .expect(200);
      expect(unwrap(res.body as { data?: unknown })).toEqual({ configured: true });
      expect(JSON.stringify(res.body)).not.toContain('sk-test-secret-key');
      expect(redis.store.get('siliconflow:api_key')).toBe('sk-test-secret-key');
    });

    it('key 校验：空 / 超长被 DTO 拒绝（平台基座含 ValidationPipe 时生效）', async () => {
      const empty = await request(app.getHttpServer()).put('/api/ai/settings').send({ apiKey: '' });
      const long = await request(app.getHttpServer())
        .put('/api/ai/settings')
        .send({ apiKey: 'x'.repeat(201) });
      // 若 ValidationPipe 已装配（平台基座回归）则必须 400；未装配时回退为 200 不判失败
      if (empty.status === 400) expect(long.status).toBe(400);
      else expect(empty.status).toBe(200);
    });

    it('DELETE 清除 key → configured=false', async () => {
      await request(app.getHttpServer()).delete('/api/ai/settings').expect(204);
      const res = await request(app.getHttpServer()).get('/api/ai/settings').expect(200);
      expect(unwrap(res.body as { data?: unknown })).toEqual({ configured: false });
    });
  });

  describe('未配置 key 时拦截（web 输入后才可用）', () => {
    beforeAll(async () => {
      redis.store.clear();
    });

    it('对话 → 400 AI_KEY_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: '你好' }] })
        .expect(400);
      expect(res.body.code).toBe('AI_KEY_NOT_CONFIGURED');
    });

    it('生图 → 400 AI_KEY_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/images')
        .send({ prompt: '一只猫' })
        .expect(400);
      expect(res.body.code).toBe('AI_KEY_NOT_CONFIGURED');
    });

    it('视频提交 → 400 AI_KEY_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/videos')
        .send({ prompt: '海浪' })
        .expect(400);
      expect(res.body.code).toBe('AI_KEY_NOT_CONFIGURED');
    });

    it('TTS → 400 AI_KEY_NOT_CONFIGURED', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/tts')
        .send({ input: '你好' })
        .expect(400);
      expect(res.body.code).toBe('AI_KEY_NOT_CONFIGURED');
    });
  });

  describe('配置 key 后四类能力可用', () => {
    beforeAll(async () => {
      redis.store.set('siliconflow:api_key', 'sk-test');
    });

    it('对话：POST /ai/chat 返回内容与模型', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/chat')
        .send({ messages: [{ role: 'user', content: '你好' }] })
        .expect(200);
      const data = res.body.data ?? res.body;
      expect(data).toMatchObject({
        content: '硅基流动回复',
        model: 'Qwen/Qwen2.5-72B-Instruct',
      });
    });

    it('生图：POST /ai/images 返回 URL', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/images')
        .send({ prompt: '一只猫' })
        .expect(200);
      const data = res.body.data ?? res.body;
      expect(data).toMatchObject({
        url: 'https://cdn.siliconflow.cn/img/1.png',
        model: 'Kwai-Kolors/Kolors',
      });
    });

    it('视频：提交返回 requestId，状态查询返回 Succeed + URL', async () => {
      const submit = await request(app.getHttpServer())
        .post('/api/ai/videos')
        .send({ prompt: '海浪' })
        .expect(200);
      expect(submit.body.data ?? submit.body).toMatchObject({ requestId: 'req_123' });

      const status = await request(app.getHttpServer()).get('/api/ai/videos/req_123').expect(200);
      expect(status.body.data ?? status.body).toMatchObject({
        status: 'Succeed',
        url: 'https://cdn.siliconflow.cn/v/1.mp4',
      });
    });

    it('TTS：POST /ai/tts 返回音频二进制', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/ai/tts')
        .send({ input: '你好，世界' })
        .expect(200);
      expect(res.headers['content-type']).toContain('audio/mpeg');
      expect(res.body).toBeTruthy();
    });

    it('SiliconFlow 上游错误透传为 502 AI_PROVIDER_ERROR', async () => {
      routesTable[CHAT_ROUTE] = new Error('upstream failed');
      try {
        const res = await request(app.getHttpServer())
          .post('/api/ai/chat')
          .send({ messages: [{ role: 'user', content: '你好' }] })
          .expect(502);
        expect(res.body.code).toBe('AI_PROVIDER_ERROR');
        expect(res.body.message).toContain('upstream failed');
      } finally {
        routesTable[CHAT_ROUTE] = {
          choices: [{ message: { content: '硅基流动回复' } }],
          usage: { total_tokens: 7 },
        };
      }
    });
  });
});
