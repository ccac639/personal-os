import { describe, expect, it } from 'vitest';

import {
  ChatApiError,
  HttpChatApiClient,
  isChatAbortError,
  type ChatRawClient,
} from '@/features/chat/api';

/** 构造一个固定响应的 fake 传输层（不触真实网络） */
function makeRaw(
  handler: (
    url: string,
    options?: { method?: string; body?: unknown; signal?: AbortSignal },
  ) => Promise<{ data: unknown; response: { ok: boolean; status: number } }>,
): ChatRawClient {
  return { raw: handler };
}

function okBody(data: unknown, status = 200) {
  return {
    data,
    response: { ok: status >= 200 && status < 300, status },
  };
}

/** 后端统一成功包装（transform.interceptor.ts 形状） */
function envelope(data: unknown) {
  return {
    requestId: 'req_1',
    timestamp: '2026-08-15T00:00:00.000Z',
    path: '/api/ai/chat',
    statusCode: 200,
    code: 'OK',
    message: 'OK',
    data,
  };
}

const PARAMS = { messages: [{ role: 'user' as const, content: '你好' }] };

describe('HttpChatApiClient（真实后端客户端）', () => {
  it('成功：解包统一响应包装并返回内容', async () => {
    const raw = makeRaw(async () =>
      okBody(envelope({ content: '这是回复', model: 'Qwen/Qwen2.5-72B-Instruct' })),
    );
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    const result = await client.complete(PARAMS);
    expect(result).toEqual({ content: '这是回复', model: 'Qwen/Qwen2.5-72B-Instruct' });
  });

  it('成功：兼容未包装的直接结果体', async () => {
    const raw = makeRaw(async () => okBody({ content: '直接结果', model: 'm' }));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await expect(client.complete(PARAMS)).resolves.toEqual({ content: '直接结果', model: 'm' });
  });

  it('请求体只含对话参数，绝不携带 API Key', async () => {
    let captured: Record<string, unknown> | undefined;
    const raw = makeRaw(async (_url, options) => {
      captured = options?.body as Record<string, unknown>;
      return okBody(envelope({ content: 'ok', model: 'm' }));
    });
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await client.complete({
      messages: [{ role: 'user', content: '你好' }],
      model: 'm',
      temperature: 0.5,
      maxTokens: 300,
    });

    expect(captured).toBeDefined();
    expect(captured!.messages).toEqual([{ role: 'user', content: '你好' }]);
    expect(captured!.model).toBe('m');
    expect(captured!.temperature).toBe(0.5);
    expect(captured!.maxTokens).toBe(300);
    // 安全断言：请求体不含任何密钥字段（maxTokens 等合法参数不受影响）
    for (const key of Object.keys(captured!)) {
      expect(key.toLowerCase()).not.toMatch(/^(api[_-]?key|secret|authorization|token)$/);
    }
    expect(JSON.stringify(captured)).not.toContain('sk-');
  });

  it('HTTP 错误：归一化为 kind=http，保留业务码与后端脱敏 message', async () => {
    const raw = makeRaw(async () =>
      okBody(
        {
          requestId: 'req_1',
          timestamp: '2026-08-15T00:00:00.000Z',
          path: '/api/ai/chat',
          statusCode: 400,
          code: 'AI_KEY_NOT_CONFIGURED',
          message: 'SiliconFlow API Key 未配置，请先在「设置」页输入后重试',
        },
        400,
      ),
    );
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    const err = await client.complete(PARAMS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ChatApiError);
    expect(err).toMatchObject({
      kind: 'http',
      status: 400,
      code: 'AI_KEY_NOT_CONFIGURED',
      message: 'SiliconFlow API Key 未配置，请先在「设置」页输入后重试',
    });
  });

  it('HTTP 错误：错误体缺失 message 时回退到状态码描述', async () => {
    const raw = makeRaw(async () => okBody(undefined, 502));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    const err = await client.complete(PARAMS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ kind: 'http', status: 502 });
  });

  it('网络错误：归一化为 kind=network', async () => {
    const raw = makeRaw(async () => {
      throw new TypeError('fetch failed');
    });
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    const err = await client.complete(PARAMS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ kind: 'network' });
    expect(err).not.toMatchObject({ kind: 'http' });
  });

  it('超时：内部计时触发 abort → kind=timeout（可重试，非取消）', async () => {
    const raw = makeRaw(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const client = new HttpChatApiClient({ raw, timeoutMs: 40 });

    const err = await client.complete(PARAMS).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ kind: 'timeout' });
    expect(isChatAbortError(err)).toBe(false);
  });

  it('取消：外部 AbortSignal → kind=aborted，isChatAbortError 为 true', async () => {
    const raw = makeRaw(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
    const client = new HttpChatApiClient({ raw, timeoutMs: 5_000 });
    const controller = new AbortController();

    const pending = client.complete(PARAMS, { signal: controller.signal });
    controller.abort();
    const err = await pending.then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ kind: 'aborted' });
    expect(isChatAbortError(err)).toBe(true);
  });

  it('取消：兼容 ofetch 包装（AbortError 在 cause 中）', async () => {
    const raw = makeRaw(
      (_url, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            reject(
              Object.assign(new Error('Request aborted'), {
                cause: new DOMException('The operation was aborted.', 'AbortError'),
              }),
            );
          });
        }),
    );
    const client = new HttpChatApiClient({ raw, timeoutMs: 5_000 });
    const controller = new AbortController();

    const pending = client.complete(PARAMS, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'aborted' });
  });

  it('非法响应：content 类型错误 → kind=invalid', async () => {
    const raw = makeRaw(async () => okBody(envelope({ content: 123, model: 'm' })));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await expect(client.complete(PARAMS)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('非法响应：缺少内容字段 → kind=invalid', async () => {
    const raw = makeRaw(async () => okBody(envelope({ model: 'm' })));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await expect(client.complete(PARAMS)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('非法响应：非对象载荷 → kind=invalid', async () => {
    const raw = makeRaw(async () => okBody(envelope('oops')));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await expect(client.complete(PARAMS)).rejects.toMatchObject({ kind: 'invalid' });
  });

  it('空回复：content 为空白 → kind=empty', async () => {
    const raw = makeRaw(async () => okBody(envelope({ content: '   ', model: 'm' })));
    const client = new HttpChatApiClient({ raw, timeoutMs: 1_000 });

    await expect(client.complete(PARAMS)).rejects.toMatchObject({ kind: 'empty' });
  });
});
