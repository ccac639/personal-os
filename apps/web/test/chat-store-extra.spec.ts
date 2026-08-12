import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { setChatReplyService, type ChatReplyService } from '@/features/chat/service';
import { useChatStore } from '@/features/chat/store';

const STORAGE_KEY = 'personal-os.chat.v1';

describe('chat store 会话体验', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({
      generateReply: (input) => Promise.resolve(`回复：${input}`),
    });
  });

  it('首条消息自动生成标题：合并多余空白', () => {
    const store = useChatStore();
    store.sendMessage('  帮我写一个\n\n  Vue 组件  ');
    expect(store.activeSession?.title).toBe('帮我写一个 Vue 组件');
  });

  it('超长首条消息标题截断为 24 字 + 省略号', () => {
    const store = useChatStore();
    store.sendMessage('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十');
    expect(store.activeSession?.title).toBe('一二三四五六七八九十一二三四五六七八九十一二三四…');
  });

  it('后续消息不覆盖用户已重命名的标题', () => {
    const store = useChatStore();
    store.sendMessage('第一条消息');
    store.renameSession(store.activeId!, '自定义标题');
    store.sendMessage('第二条消息');
    expect(store.activeSession?.title).toBe('自定义标题');
  });

  it('删除当前会话后选择最近的相邻会话', () => {
    const store = useChatStore();
    // 清掉初始默认会话，从干净列表开始
    store.deleteSession(store.activeId!);
    expect(store.sessions).toHaveLength(0);

    store.createSession(); // a
    store.createSession(); // b
    store.createSession(); // c
    // sessions: [c, b, a]，active = c
    expect(store.sessions).toHaveLength(3);

    // 删最新的 c：选择较旧的相邻 b
    store.deleteSession(store.activeId!);
    expect(store.sessions).toHaveLength(2);
    expect(store.activeId).toBe(store.sessions[0]!.id);
    expect(store.activeSession?.title).toBe('新对话');

    // 删中间的 b：选择较新的相邻（剩下 [b, a] 中删除 b 后选 a）
    store.deleteSession(store.activeId!);
    expect(store.sessions).toHaveLength(1);
    expect(store.activeId).toBe(store.sessions[0]!.id);
  });

  it('删除非当前会话不影响当前选中', () => {
    const store = useChatStore();
    store.createSession(); // a
    store.createSession(); // b
    const active = store.activeId!; // b
    store.deleteSession(store.sessions[1]!.id); // 删 a
    expect(store.activeId).toBe(active);
  });
});

describe('chat store 编辑与重试', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({
      generateReply: (input) => Promise.resolve(`回复：${input}`),
    });
  });

  it('编辑最近用户消息：截断后续上下文并重新发送', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('原始问题');
    await vi.advanceTimersByTimeAsync(60_000);
    const before = store.activeSession!.messages;
    expect(before).toHaveLength(2);
    const userMsgId = before[0]!.id;
    const assistantId = before[1]!.id;

    store.editAndResend(userMsgId, '修改后的问题');
    const after = store.activeSession!.messages;
    // 原助手回复被截断移除，重新生成 user + assistant，不堆积
    expect(after).toHaveLength(2);
    expect(after[0]!.role).toBe('user');
    expect(after[0]!.content).toBe('修改后的问题');
    expect(after[1]!.role).toBe('assistant');
    expect(after[1]!.id).not.toBe(assistantId);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(after[1]!.streaming).toBe(false);
    expect(after[1]!.content).toBe('回复：修改后的问题');
  });

  it('只允许编辑最近一条用户消息', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('问题一');
    await vi.advanceTimersByTimeAsync(60_000);
    store.sendMessage('问题二');
    await vi.advanceTimersByTimeAsync(60_000);
    const messages = store.activeSession!.messages;
    expect(messages).toHaveLength(4);
    const firstUser = messages[0]!;
    const lastUser = messages[2]!;

    // 编辑非最近用户消息：不生效
    store.editAndResend(firstUser.id, '不该生效');
    expect(store.activeSession!.messages[0]!.content).toBe('问题一');

    // 编辑最近用户消息：生效并截断后续上下文（保留此前历史）
    store.editAndResend(lastUser.id, '生效了');
    const after = store.activeSession!.messages;
    expect(after).toHaveLength(4);
    expect(after[0]!.content).toBe('问题一');
    // 原“问题二/回复二”上下文被截断，新问答落在最后
    expect(after[2]!.content).toBe('生效了');
    expect(after[3]!.role).toBe('assistant');
  });

  it('startEdit 仅允许最近一条用户消息，cancelEdit 清空编辑态', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.sendMessage('问题一');
    await vi.advanceTimersByTimeAsync(60_000);
    store.sendMessage('问题二');
    await vi.advanceTimersByTimeAsync(60_000);
    const messages = store.activeSession!.messages;

    store.startEdit(messages[0]!.id);
    expect(store.editingId).toBeNull();

    store.startEdit(messages[2]!.id);
    expect(store.editingId).toBe(messages[2]!.id);
    store.cancelEdit();
    expect(store.editingId).toBeNull();
  });

  it('service 异常后可重试，状态恢复正常且不丢失用户消息', async () => {
    vi.useFakeTimers();
    let fail = true;
    const flaky: ChatReplyService = {
      generateReply: (input) =>
        fail ? Promise.reject(new Error('模型不可用')) : Promise.resolve(`重试成功：${input}`),
    };
    setChatReplyService(flaky);

    const store = useChatStore();
    store.sendMessage('你好');
    await vi.advanceTimersByTimeAsync(50);

    const failed = store.activeSession!.messages[1]!;
    expect(failed.error).toBe(true);
    expect(failed.streaming).toBe(false);
    expect(store.isStreaming).toBe(false);
    // 用户消息保留，无重复堆积
    expect(store.activeSession!.messages).toHaveLength(2);
    expect(store.activeSession!.messages[0]!.content).toBe('你好');

    // 重试：以新助手消息替换失败占位
    fail = false;
    store.regenerate(failed.id);
    const retried = store.activeSession!.messages[1]!;
    expect(retried.id).not.toBe(failed.id);
    expect(retried.error).toBeUndefined();
    expect(store.activeSession!.messages).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(60_000);
    expect(retried.streaming).toBe(false);
    expect(retried.content).toBe('重试成功：你好');
    expect(store.isStreaming).toBe(false);
  });
});

describe('chat store 数据可靠性', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({
      generateReply: (input) => Promise.resolve(`回复：${input}`),
    });
  });

  it('损坏 JSON 数据安全回退至默认会话并清理无效存储', () => {
    localStorage.setItem(STORAGE_KEY, '{oops not json');
    const store = useChatStore();
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.title).toBe('新对话');
    expect(store.activeId).not.toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('版本不兼容数据回退至默认会话', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'x',
          title: '旧版本会话',
          messages: [],
          model: 'deepseek',
          createdAt: 1,
          updatedAt: 1,
          schemaVersion: 99,
        },
      ]),
    );
    const store = useChatStore();
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.title).toBe('新对话');
  });

  it('结构损坏数据回退至默认会话', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: 'x',
          title: '坏结构',
          messages: [{ oops: true }],
          model: 'deepseek',
          createdAt: 1,
          updatedAt: 1,
        },
      ]),
    );
    const store = useChatStore();
    expect(store.sessions).toHaveLength(1);
    expect(store.sessions[0]!.title).toBe('新对话');
  });

  it('回退后可正常使用并写入合法数据', async () => {
    vi.useFakeTimers();
    localStorage.setItem(STORAGE_KEY, '{bad');
    const store = useChatStore();
    expect(store.sessions).toHaveLength(1);

    store.sendMessage('新消息');
    await vi.advanceTimersByTimeAsync(60_000);
    await nextTick();

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Array<{ messages: unknown[] }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0]!.messages).toHaveLength(2);
  });
});
