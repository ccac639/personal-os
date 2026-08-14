import * as exportModule from '@/features/chat/export';
import {
  messageToMarkdown,
  sanitizeFilename,
  sessionToJson,
  sessionToMarkdown,
} from '@/features/chat/export';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatMessage from '@/features/chat/components/chat-message.vue';
import { useChatStore } from '@/features/chat/store';
import type { ChatSession } from '@/features/chat/types';

function makeSession(over: Partial<ChatSession> = {}): ChatSession {
  const now = Date.now();
  return {
    id: 's1',
    title: '测试会话',
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: '你好，帮我总结',
        createdAt: now - 2000,
        model: 'general-reasoning',
      },
      {
        id: 'a1',
        role: 'assistant',
        content: '好的，这是总结内容。',
        createdAt: now - 1000,
        model: 'general-reasoning',
        bookmarked: true,
      },
      {
        id: 'u2',
        role: 'user',
        content: '针对上一条',
        createdAt: now,
        model: 'general-reasoning',
        quote: { id: 'a1', role: 'assistant', content: '好的，这是总结内容。' },
      },
    ],
    model: 'general-reasoning',
    createdAt: now - 5000,
    updatedAt: now,
    ...over,
  };
}

describe('chat 导出结构', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('单条消息 Markdown：角色 / 内容 / 模型 / 书签标记', () => {
    const md = messageToMarkdown(makeSession().messages[1]!);
    expect(md).toContain('### 助手');
    expect(md).toContain('好的，这是总结内容。');
    expect(md).toContain('通用推理');
    expect(md).toContain('📌 已书签');

    const userMd = messageToMarkdown(makeSession().messages[0]!);
    expect(userMd).toContain('### 用户');
    expect(userMd).not.toContain('📌 已书签');
  });

  it('单条消息 Markdown：包含引用块', () => {
    const md = messageToMarkdown(makeSession().messages[2]!);
    expect(md).toContain('引用自 助手：好的，这是总结内容。');
  });

  it('会话 Markdown：标题 / 元信息 / 消息序列 / 书签统计', () => {
    const md = sessionToMarkdown(makeSession());
    expect(md).toContain('# 测试会话');
    expect(md).toContain('- 模型：通用推理');
    expect(md).toContain('- 消息：3 条（用户 2 / 助手 1）');
    expect(md).toContain('- 书签：1 条');
    expect(md).toContain('## 1. 用户');
    expect(md).toContain('## 3. 用户');
    expect(md).toContain('好的，这是总结内容。');
  });

  it('会话 Markdown：系统提示词段落', () => {
    const session = makeSession({
      systemPrompt: { presetId: 'code-review', text: '只关注安全' },
    });
    const md = sessionToMarkdown(session);
    expect(md).toContain('系统提示词（代码审阅）');
    expect(md).toContain('只关注安全');
  });

  it('会话 JSON：自包含书签 / 引用 / 系统提示词', () => {
    const session = makeSession({
      systemPrompt: { presetId: 'custom', text: '自定义规则' },
    });
    const parsed = JSON.parse(sessionToJson(session)) as {
      app: string;
      version: number;
      exportedAt: string;
      session: ChatSession;
    };
    expect(parsed.app).toBe('personal-os-chat');
    expect(parsed.version).toBe(1);
    expect(parsed.exportedAt).toBeTruthy();
    expect(parsed.session.messages[1]!.bookmarked).toBe(true);
    expect(parsed.session.messages[2]!.quote?.id).toBe('a1');
    expect(parsed.session.systemPrompt).toEqual({
      presetId: 'custom',
      text: '自定义规则',
    });
  });

  it('文件名安全化：去除路径保留字符并限长', () => {
    expect(sanitizeFilename('a/b:c*d?e')).toBe('a-b-c-d-e');
    expect(sanitizeFilename('  ')).toBe('会话');
    expect(sanitizeFilename('x'.repeat(100))).toHaveLength(60);
  });

  it('store 导出：单条消息与整会话下载', async () => {
    const spy = vi.spyOn(exportModule, 'downloadTextFile').mockImplementation(() => {});
    const store = useChatStore();
    const session = makeSession();
    store.createSession();
    store.activeSession!.messages = session.messages;
    store.activeSession!.title = session.title;
    store.activeSession!.model = session.model;
    store.activeSession!.createdAt = session.createdAt;
    store.activeSession!.updatedAt = session.updatedAt;

    store.exportMessage('a1');
    expect(spy).toHaveBeenCalledTimes(1);
    const [filename, content] = spy.mock.calls[0]!;
    expect(filename).toContain('测试会话');
    expect(filename).toMatch(/\.md$/);
    expect(content).toContain('好的，这是总结内容。');

    store.exportActiveSessionMarkdown();
    expect(spy.mock.calls[1]![0]).toMatch(/\.md$/);
    expect(spy.mock.calls[1]![1]).toContain('# 测试会话');

    store.exportActiveSessionJson();
    expect(spy.mock.calls[2]![0]).toMatch(/\.json$/);
    expect(spy.mock.calls[2]![2]).toContain('application/json');

    spy.mockRestore();
  });
});

describe('ChatMessage 导出按钮', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('导出按钮调用 store.exportMessage', async () => {
    const spy = vi.spyOn(exportModule, 'downloadTextFile').mockImplementation(() => {});

    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push({
      id: 'm1',
      role: 'assistant',
      content: '可导出的内容',
      createdAt: Date.now(),
    });
    const wrapper = mount(ChatMessage, {
      props: {
        message: store.activeSession!.messages[0]!,
        isLast: true,
      },
      global: { plugins: [pinia] },
    });

    await wrapper.find('button[aria-label="导出消息 Markdown"]').trigger('click');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]![1]).toContain('可导出的内容');
    spy.mockRestore();
    wrapper.unmount();
  });
});
