import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { ChatApiError } from '@/features/chat/api';
import {
  HttpChatReplyService,
  MockChatReplyService,
  buildChatMessages,
  setChatReplyService,
  type ChatReplyService,
} from '@/features/chat/service';
import { useChatStore } from '@/features/chat/store';

describe('chat service 边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    // 每个用例从默认 mock 实现开始，避免用例间串状态
    setChatReplyService(new MockChatReplyService());
  });

  it('默认服务为真实优先（测试环境自动走 mock 降级，不触网）', async () => {
    // 模块初始默认实现 = HttpChatReplyService（enabled 由 MODE 决定）
    const service = new HttpChatReplyService();
    // 测试环境 enabled=false → 行为等同 mock（含 Markdown 结构）
    const reply = await service.generateReply('帮我写一个 Vue 组件');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).toContain('##');
  });

  it('真实模式：后端成功时返回模型回复，失败时降级 mock', async () => {
    const okClient = {
      complete: async () => ({ content: '真实模型回复', model: 'gpt-x' }),
    };
    const svcOk = new HttpChatReplyService({ api: okClient, enabled: true });
    await expect(svcOk.generateReply('hi')).resolves.toBe('真实模型回复');

    const failClient = {
      complete: async () => {
        throw new ChatApiError('network', '无法连接后端服务');
      },
    };
    const svcFail = new HttpChatReplyService({ api: failClient, enabled: true });
    const degraded = await svcFail.generateReply('hi');
    expect(degraded.length).toBeGreaterThan(0); // 降级 mock 模板回复
  });

  it('真实模式：用户主动取消透传（不降级，由 store 静默收尾）', async () => {
    const abortClient = {
      complete: async () => {
        throw new ChatApiError('aborted', '请求已取消');
      },
    };
    const svc = new HttpChatReplyService({ api: abortClient, enabled: true });
    await expect(svc.generateReply('hi')).rejects.toBeInstanceOf(ChatApiError);
  });

  it('替换 service 后，store 流式输出使用新实现的回复', async () => {
    vi.useFakeTimers();
    const custom: ChatReplyService = {
      generateReply: (input) => Promise.resolve(`[自定义服务] 收到：${input}`),
    };
    setChatReplyService(custom);

    const store = useChatStore();
    store.sendMessage('你好');
    const msg = store.activeSession!.messages[1]!;

    // 异步推进（flush 微任务）直到完整输出，内容来自注入的自定义 service
    await vi.advanceTimersByTimeAsync(60_000);
    expect(msg.streaming).toBe(false);
    expect(msg.content).toBe('[自定义服务] 收到：你好');
  });

  it('service 失败时清空流式态，不留下悬挂的 streaming 标志', async () => {
    vi.useFakeTimers();
    const failing: ChatReplyService = {
      generateReply: () => Promise.reject(new Error('模型不可用')),
    };
    setChatReplyService(failing);

    const store = useChatStore();
    store.sendMessage('你好');
    const msg = store.activeSession!.messages[1]!;

    // 异步推进会 flush 微任务：reject 被 store 捕获并收尾
    await vi.advanceTimersByTimeAsync(100);
    expect(msg.streaming).toBe(false);
    expect(store.isStreaming).toBe(false);
    // 消息仍保留（用户输入不丢），可继续发送
    expect(store.activeSession!.messages).toHaveLength(2);
  });

  // ---------- 多轮上下文 ----------

  it('buildChatMessages：system + 历史（正序） + 当前 user 完整下发', () => {
    const messages = buildChatMessages('第二轮提问', {
      systemPrompt: '你是研发助手',
      history: [
        { role: 'user', content: '第一轮提问' },
        { role: 'assistant', content: '第一轮回复' },
      ],
    });
    expect(messages).toEqual([
      { role: 'system', content: '你是研发助手' },
      { role: 'user', content: '第一轮提问' },
      { role: 'assistant', content: '第一轮回复' },
      { role: 'user', content: '第二轮提问' },
    ]);
  });

  it('buildChatMessages：历史裁剪到后端上限（20 条，末条恒为当前 user）', () => {
    const history = Array.from({ length: 30 }, (_, i) => ({
      role: 'user' as const,
      content: `历史${i}`,
    }));
    const messages = buildChatMessages('当前提问', { history });
    expect(messages).toHaveLength(20);
    expect(messages[19]).toEqual({ role: 'user', content: '当前提问' });
    // 保留最近 19 条历史：第一条为 历史11（30 - 19）
    expect(messages[0]).toEqual({ role: 'user', content: '历史11' });
  });

  it('真实模式：多轮历史随 complete 下发（含 system）', async () => {
    const seen: unknown[] = [];
    const client = {
      complete: async (params: { messages: unknown[] }) => {
        seen.push(params.messages);
        return { content: '模型回复', model: 'gpt-x' };
      },
    };
    const svc = new HttpChatReplyService({ api: client, enabled: true });
    await svc.generateReply('第二轮提问', {
      systemPrompt: '你是研发助手',
      history: [
        { role: 'user', content: '第一轮提问' },
        { role: 'assistant', content: '第一轮回复' },
      ],
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual([
      { role: 'system', content: '你是研发助手' },
      { role: 'user', content: '第一轮提问' },
      { role: 'assistant', content: '第一轮回复' },
      { role: 'user', content: '第二轮提问' },
    ]);
  });

  it('降级路径：mock 服务接收多轮历史并输出继续对话引用', async () => {
    const svc = new MockChatReplyService();
    const reply = await svc.generateReply('继续', {
      history: [
        { role: 'user', content: '第一轮提问' },
        { role: 'assistant', content: '第一轮回复' },
      ],
    });
    expect(reply).toContain('已结合此前 2 轮对话');
    expect(reply).toContain('##'); // 原有 Markdown 结构保留
  });

  it('store 多轮：连续两轮对话，第二轮请求含第一轮历史', async () => {
    vi.useFakeTimers();
    const seen: unknown[][] = [];
    const custom: ChatReplyService = {
      generateReply: (input, options) => {
        seen.push(options?.history ?? []);
        return Promise.resolve(`[多轮] 回复：${input}`);
      },
    };
    setChatReplyService(custom);

    const store = useChatStore();
    store.sendMessage('第一轮');
    await vi.advanceTimersByTimeAsync(60_000);
    store.sendMessage('第二轮');
    await vi.advanceTimersByTimeAsync(60_000);

    expect(seen).toHaveLength(2);
    // 第一轮：无历史
    expect(seen[0]).toEqual([]);
    // 第二轮：历史含第一轮 user + assistant（正序）
    expect(seen[1]!.map((t) => t.role)).toEqual(['user', 'assistant']);
    expect(seen[1]![0]!.content).toBe('第一轮');
  });
});
