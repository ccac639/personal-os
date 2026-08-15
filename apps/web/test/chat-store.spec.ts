import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { useChatStore } from '@/features/chat/store';
import { setChatReplyService, type ChatReplyService } from '@/features/chat/service';
import { CHAT_MODELS } from '@/features/chat/mock';

describe('chat store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('发送消息：新建会话、标题取前 24 字、追加用户+助手两条消息', () => {
    const store = useChatStore();
    store.sendMessage('帮我写一个 Vue 组件');

    expect(store.sessions).toHaveLength(1);
    expect(store.activeSession?.title).toBe('帮我写一个 Vue 组件');
    expect(store.activeSession?.messages).toHaveLength(2);
    expect(store.activeSession?.messages[0]?.role).toBe('user');
    expect(store.activeSession?.messages[1]?.role).toBe('assistant');
    expect(store.activeSession?.model).toBe(CHAT_MODELS[0]!.id);
  });

  it('流式输出：定时推进内容，完成后清空 streaming 态', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('帮我写一个 Vue 组件');
    const msg = store.activeSession!.messages[1]!;

    // 初始为空，正在输出
    expect(msg.streaming).toBe(true);
    expect(store.isStreaming).toBe(true);

    // 异步推进（flush 微任务后启动打字机）若干 tick 后应已有内容
    await vi.advanceTimersByTimeAsync(200);
    expect(msg.content.length).toBeGreaterThan(0);

    // 推进到全部完成
    await vi.advanceTimersByTimeAsync(60_000);
    expect(msg.streaming).toBe(false);
    expect(store.isStreaming).toBe(false);
    expect(msg.content.length).toBeGreaterThan(50);
  });

  it('停止生成：保留已输出内容并清除 streaming 态', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('帮我写一个 Vue 组件');
    const msg = store.activeSession!.messages[1]!;

    await vi.advanceTimersByTimeAsync(200);
    const partial = msg.content;
    expect(partial.length).toBeGreaterThan(0);

    store.stopStreaming();
    expect(msg.streaming).toBe(false);
    expect(store.isStreaming).toBe(false);
    // stopStreaming 契约：保留已输出内容，仅清理尾随空白
    expect(msg.content).toBe(partial.replace(/\s+$/, ''));
  });

  it('重新生成：截断到目标消息，用同一条用户输入重新输出', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('帮我写一个 Vue 组件');
    const first = store.activeSession!.messages[1]!;
    await vi.advanceTimersByTimeAsync(60_000); // 第一条回复完成
    const firstContent = first.content;

    store.regenerate(first.id);
    const messages = store.activeSession!.messages;
    // 截断后只剩 user + 新的 assistant 占位
    expect(messages).toHaveLength(2);
    expect(messages[1]!.id).not.toBe(first.id);
    expect(messages[0]!.content).toBe('帮我写一个 Vue 组件');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(messages[1]!.streaming).toBe(false);
    expect(messages[1]!.content.length).toBeGreaterThan(0);
    // 变体序号不同，内容应与第一次不同
    expect(messages[1]!.content).not.toBe(firstContent);
  });

  it('多轮历史边界：第二轮携带首轮历史；重新生成首轮时历史为空（空占位跳过）', async () => {
    vi.useFakeTimers();
    const calls: { prompt: string; history?: { role: string; content: string }[] }[] = [];
    const spyService: ChatReplyService = {
      generateReply: async (prompt, options) => {
        calls.push({ prompt, history: options?.history });
        return `[回复:${prompt}]`;
      },
    };
    setChatReplyService(spyService);

    const store = useChatStore();
    store.sendMessage('第一问');
    await vi.advanceTimersByTimeAsync(60_000);
    const first = store.activeSession!.messages[1]!;

    store.sendMessage('第二问');
    await vi.advanceTimersByTimeAsync(60_000);

    // 第二轮请求携带首轮完整历史（user + assistant）
    expect(calls).toHaveLength(2);
    expect(calls[1]!.prompt).toBe('第二问');
    expect(calls[1]!.history).toHaveLength(2);
    expect(calls[1]!.history![0]).toEqual({ role: 'user', content: '第一问' });
    expect(calls[1]!.history![1]!.role).toBe('assistant');

    // 重新生成第一轮：截断后首轮之前无历史（buildHistory 跳过空 assistant 占位）
    store.regenerate(first.id);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(3);
    expect(calls[2]!.prompt).toBe('第一问');
    expect(calls[2]!.history).toEqual([]);
  });

  it('持久化：会话变更写入 localStorage，重新加载可恢复', async () => {
    const store = useChatStore();
    store.sendMessage('帮我设计一条工作流');

    // 持久化 watch 为异步 flush，等待调度器落盘后再断言
    await nextTick();

    const raw = localStorage.getItem('personal-os.chat.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.messages).toHaveLength(2);

    // 模拟重新加载：新 store 应恢复会话（先清掉内存态）
    setActivePinia(createPinia());
    const reloaded = useChatStore();
    expect(reloaded.sessions).toHaveLength(1);
    expect(reloaded.sessions[0]!.title).toBe('帮我设计一条工作流');
  });

  it('删除会话：清空列表并重置选中态', () => {
    const store = useChatStore();
    store.sendMessage('问一个问题');
    const id = store.activeId!;

    store.deleteSession(id);
    expect(store.sessions).toHaveLength(0);
    expect(store.activeId).toBeNull();
    expect(store.activeSession).toBeNull();
  });
});
