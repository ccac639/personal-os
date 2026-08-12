import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import {
  getChatReplyService,
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

  it('默认使用 mock 实现，generateReply 返回含 Markdown 结构的完整回复', async () => {
    const service = getChatReplyService();
    expect(service).toBeInstanceOf(MockChatReplyService);

    const reply = await service.generateReply('帮我写一个 Vue 组件');
    expect(typeof reply).toBe('string');
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).toContain('##');
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
