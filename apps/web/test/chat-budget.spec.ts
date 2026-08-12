import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CONTEXT_DANGER_RATIO,
  CONTEXT_WARN_RATIO,
  budgetInfo,
  contextLimitOf,
  estimateSessionTokens,
  estimateTokens,
} from '@/features/chat/budget';
import ChatComposer from '@/features/chat/components/chat-composer.vue';
import { useChatStore } from '@/features/chat/store';

describe('chat 上下文预算估算', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('启发式估算：中文字符按 1 token，拉丁按 4 字符 1 token', () => {
    expect(estimateTokens('')).toBe(0);
    const cjk = estimateTokens('你好世界');
    const latin = estimateTokens('hello world');
    expect(cjk).toBe(5); // 4 个中文字 + 1 开销
    expect(latin).toBe(4); // 11 字符 → ceil(11/4)=3 + 1
    expect(cjk).toBeGreaterThan(latin);
    // 确定性：同输入同输出
    expect(estimateTokens('确定性测试')).toBe(estimateTokens('确定性测试'));
  });

  it('模型上下文上限：从目录文案解析 K 值', () => {
    expect(contextLimitOf('general-reasoning')).toBe(128 * 1024);
    expect(contextLimitOf('arch-analysis')).toBe(200 * 1024);
    expect(contextLimitOf('not-exist')).toBe(128 * 1024);
    expect(contextLimitOf(undefined)).toBe(128 * 1024);
  });

  it('会话估算：消息 + 系统提示词 + 消息开销', () => {
    const store = useChatStore();
    store.createSession();
    store.setSessionSystemPrompt('general-collab', '你是助手');
    const session = store.activeSession!;
    const before = estimateSessionTokens(session);

    store.sendMessage('你好');
    const after = estimateSessionTokens(store.activeSession!);
    expect(after).toBeGreaterThan(before);
  });

  it('预算档位：ok < 70% ≤ warn < 90% ≤ danger', () => {
    const store = useChatStore();
    store.createSession();
    const session = store.activeSession!;

    expect(budgetInfo(session, 'general-reasoning').level).toBe('ok');

    // 约 95K 中文字符 → 70% 以上 → warn
    session.messages.push({
      id: 'big1',
      role: 'user',
      content: '中'.repeat(95_000),
      createdAt: Date.now(),
    });
    const warn = budgetInfo(session, 'general-reasoning');
    expect(warn.level).toBe('warn');
    expect(warn.ratio).toBeGreaterThanOrEqual(CONTEXT_WARN_RATIO);
    expect(warn.ratio).toBeLessThan(CONTEXT_DANGER_RATIO);

    // 约 120K 中文字符 → 90% 以上 → danger
    session.messages[0]!.content = '中'.repeat(120_000);
    const danger = budgetInfo(session, 'general-reasoning');
    expect(danger.level).toBe('danger');
    expect(danger.ratio).toBeGreaterThanOrEqual(CONTEXT_DANGER_RATIO);
    expect(danger.used).toBeLessThanOrEqual(danger.limit);
  });
});

describe('ChatComposer 预算提示', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('上下文较长时显示提示（不调用真实 tokenizer）', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push({
      id: 'long1',
      role: 'user',
      content: '中'.repeat(95_000),
      createdAt: Date.now(),
    });

    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await nextTick();

    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain('上下文预算');
    expect(status.text()).toContain('内容较长');
    wrapper.unmount();
  });

  it('接近上限时显示危险提示', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    store.activeSession!.messages.push({
      id: 'long2',
      role: 'user',
      content: '中'.repeat(120_000),
      createdAt: Date.now(),
    });

    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await nextTick();

    const status = wrapper.find('[role="status"]');
    expect(status.exists()).toBe(true);
    expect(status.text()).toContain('接近上限');
    wrapper.unmount();
  });

  it('正常会话不显示预算提示', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    useChatStore();
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await nextTick();
    expect(wrapper.find('[role="status"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
