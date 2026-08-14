import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { ChatApiError } from '@/features/chat/api';
import {
  HttpChatReplyService,
  MockChatReplyService,
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
});
