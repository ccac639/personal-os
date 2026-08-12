import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatComposer from '@/features/chat/components/chat-composer.vue';
import ChatMessage from '@/features/chat/components/chat-message.vue';
import ChatMessageList from '@/features/chat/components/chat-message-list.vue';
import ChatSidebar from '@/features/chat/components/chat-sidebar.vue';
import { setChatReplyService } from '@/features/chat/service';
import { useChatStore } from '@/features/chat/store';
import type { ChatMessage as ChatMessageType } from '@/features/chat/types';

let pinia: ReturnType<typeof createPinia>;

function makeMsg(over: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: Math.random().toString(36).slice(2),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    ...over,
  };
}

function mountWithPinia(component: Parameters<typeof mount>[0], options: Parameters<typeof mount>[1] = {}) {
  return mount(component, {
    ...options,
    global: { ...(options.global ?? {}), plugins: [pinia] },
  });
}

describe('ChatComposer 输入与快捷键', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('Ctrl/Cmd + K 聚焦输入框', async () => {
    const wrapper = mountWithPinia(ChatComposer, { attachTo: document.body });
    const textarea = wrapper.find('textarea');
    expect(document.activeElement).not.toBe(textarea.element);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
    await nextTick();
    expect(document.activeElement).toBe(textarea.element);
    wrapper.unmount();
  });

  it('输入为空时发送按钮禁用，输入后可用', async () => {
    const wrapper = mountWithPinia(ChatComposer);
    const btn = wrapper.find('button[aria-label="发送消息"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.find('textarea').setValue('你好');
    await nextTick();
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);
  });

  it('编辑态：填充原消息文本，Enter 保存修改并截断上下文', async () => {
    vi.useFakeTimers();
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push({
      id: 'u1',
      role: 'user',
      content: '原始问题',
      createdAt: Date.now(),
    });

    const wrapper = mountWithPinia(ChatComposer);
    store.startEdit('u1');
    await nextTick();
    const textarea = wrapper.find('textarea');
    expect((textarea.element as HTMLTextAreaElement).value).toBe('原始问题');
    expect(wrapper.text()).toContain('正在编辑上一条消息');

    await textarea.setValue('修改后的问题');
    await textarea.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(store.editingId).toBeNull();
    expect(store.activeSession!.messages).toHaveLength(2);
    expect(store.activeSession!.messages[0]!.content).toBe('修改后的问题');
    expect(store.activeSession!.messages[0]!.id).not.toBe('u1');
    // 清理流式计时器
    await vi.advanceTimersByTimeAsync(60_000);
    store.stopStreaming();
  });

  it('编辑态下 Escape 取消编辑并清空草稿', async () => {
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push({
      id: 'u1',
      role: 'user',
      content: '原始问题',
      createdAt: Date.now(),
    });

    const wrapper = mountWithPinia(ChatComposer);
    store.startEdit('u1');
    await nextTick();
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('原始问题');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(store.editingId).toBeNull();
    expect((wrapper.find('textarea').element as HTMLTextAreaElement).value).toBe('');
  });
});

describe('ChatSidebar 会话交互', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('重命名：Enter 确认提交', async () => {
    const store = useChatStore();
    store.createSession();
    const wrapper = mountWithPinia(ChatSidebar, { props: { mobileOpen: false } });

    await wrapper.find('button[aria-label="重命名"]').trigger('click');
    await nextTick();
    const input = wrapper.find('input[aria-label="重命名会话"]');
    expect(input.exists()).toBe(true);

    await input.setValue('新标题');
    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(store.sessions[0]!.title).toBe('新标题');
    expect(wrapper.find('input[aria-label="重命名会话"]').exists()).toBe(false);
  });

  it('重命名：Escape 取消不保存', async () => {
    const store = useChatStore();
    store.createSession();
    const wrapper = mountWithPinia(ChatSidebar, { props: { mobileOpen: false } });

    await wrapper.find('button[aria-label="重命名"]').trigger('click');
    await nextTick();
    const input = wrapper.find('input[aria-label="重命名会话"]');
    await input.setValue('不应保存');
    await input.trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(store.sessions[0]!.title).toBe('新对话');
    expect(wrapper.find('input[aria-label="重命名会话"]').exists()).toBe(false);
  });

  it('重命名不允许空标题：保持编辑态', async () => {
    const store = useChatStore();
    store.createSession();
    const wrapper = mountWithPinia(ChatSidebar, { props: { mobileOpen: false } });

    await wrapper.find('button[aria-label="重命名"]').trigger('click');
    await nextTick();
    const input = wrapper.find('input[aria-label="重命名会话"]');
    await input.setValue('   ');
    await input.trigger('keydown', { key: 'Enter' });
    await nextTick();
    expect(store.sessions[0]!.title).toBe('新对话');
    expect(wrapper.find('input[aria-label="重命名会话"]').exists()).toBe(true);
  });
});

describe('ChatMessageList 滚动行为', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('上翻历史后显示回到底部按钮，新消息计入未读，点击后恢复', async () => {
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push(makeMsg({ id: 'u1', role: 'user', content: '问题' }));
    store.activeSession!.messages.push(makeMsg({ id: 'a1', role: 'assistant', content: '回答' }));

    const wrapper = mountWithPinia(ChatMessageList);
    await nextTick();
    const el = wrapper.find('.scrollbar-thin').element as HTMLElement;
    // 初始钉在底部：不显示回到底部按钮
    expect(wrapper.find('button[aria-label="回到底部"]').exists()).toBe(false);

    // jsdom 无布局，覆盖滚动相关属性模拟“用户上翻”
    Object.defineProperty(el, 'scrollHeight', { value: 1200, configurable: true });
    Object.defineProperty(el, 'clientHeight', { value: 200, configurable: true });
    Object.defineProperty(el, 'scrollTo', { value: vi.fn(), configurable: true });
    el.scrollTop = 800; // 1200-800-200=200 >= 96 → 不在底部
    await el.dispatchEvent(new Event('scroll'));
    await nextTick();
    expect(wrapper.find('button[aria-label="回到底部"]').exists()).toBe(true);

    // 上翻期间新增消息 → 未读计数（需通过 store 代理数组写入以触发响应式）
    store.activeSession!.messages.push(makeMsg({ id: 'a2', role: 'assistant', content: '新回复' }));
    await nextTick();
    expect(wrapper.text()).toContain('1 条新消息');

    // 点击回到底部：恢复跟随、按钮消失
    await wrapper.find('button[aria-label="回到底部"]').trigger('click');
    await nextTick();
    expect(wrapper.find('button[aria-label="回到底部"]').exists()).toBe(false);
  });
});

describe('ChatMessage 消息交互', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  it('复制成功显示“已复制”反馈', async () => {
    const wrapper = mountWithPinia(ChatMessage, {
      props: { message: makeMsg({ role: 'assistant', content: '回复内容' }), isLast: true },
    });
    await wrapper.find('button[aria-label="复制回复"]').trigger('click');
    await flushPromises();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('回复内容');
    expect(wrapper.find('button[aria-label="复制回复"]').attributes('title')).toBe('已复制');
  });

  it('复制失败显示“复制失败”反馈', async () => {
    (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('denied'),
    );
    const wrapper = mountWithPinia(ChatMessage, {
      props: { message: makeMsg({ role: 'user', content: '我的消息' }), isLast: true },
    });
    await wrapper.find('button[aria-label="复制消息"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('button[aria-label="复制消息"]').attributes('title')).toBe('复制失败');
  });

  it('用户消息显示复制与编辑按钮，点击编辑进入编辑态', async () => {
    const store = useChatStore();
    store.createSession();
    const userMsg = makeMsg({ id: 'u1', role: 'user', content: '可编辑消息' });
    store.activeSession!.messages.push(userMsg);

    const wrapper = mountWithPinia(ChatMessage, { props: { message: userMsg, isLast: true } });
    expect(wrapper.find('button[aria-label="复制消息"]').exists()).toBe(true);
    await wrapper.find('button[aria-label="编辑并重新发送"]').trigger('click');
    expect(store.editingId).toBe('u1');
    store.cancelEdit();
  });

  it('错误回复显示失败提示与重试按钮，点击后重新生成', async () => {
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push(makeMsg({ id: 'u1', role: 'user', content: '触发问题' }));
    const failed = makeMsg({ id: 'a1', role: 'assistant', content: '', error: true });
    store.activeSession!.messages.push(failed);

    const wrapper = mountWithPinia(ChatMessage, { props: { message: failed, isLast: true } });
    expect(wrapper.text()).toContain('回复生成失败');
    await wrapper.find('button[aria-label="重试生成"]').trigger('click');
    await nextTick();
    expect(store.activeSession!.messages[1]!.id).not.toBe('a1');
    expect(store.activeSession!.messages[1]!.streaming).toBe(true);
    store.stopStreaming();
  });
});
