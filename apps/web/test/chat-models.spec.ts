import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import { CHAT_MODELS } from '@/features/chat/models';
import { setChatReplyService, MockChatReplyService } from '@/features/chat/service';
import { PREFERENCES_KEY } from '@/features/chat/storage';
import { useChatStore } from '@/features/chat/store';

describe('chat 模型库', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('模型目录：包含四个类别与中性命名，且不包含第三方品牌', () => {
    expect(CHAT_MODELS.length).toBeGreaterThanOrEqual(8);
    const categories = new Set(CHAT_MODELS.map((m) => m.category));
    expect(categories).toEqual(new Set(['chat', 'code', 'image', 'creative']));
    const labels = CHAT_MODELS.map((m) => m.label).join(' ');
    expect(labels).not.toMatch(/gpt|claude|deepseek|glm|llama|gemini/i);
    expect(CHAT_MODELS[0]!.available).toBe(true);
  });

  it('类别筛选：只显示该类别模型', () => {
    const store = useChatStore();
    store.setModelFilter('code');
    expect(store.filteredModels.length).toBeGreaterThan(0);
    expect(store.filteredModels.every((m) => m.category === 'code')).toBe(true);
  });

  it('关键词搜索：匹配名称、简介或能力标签', () => {
    const store = useChatStore();
    store.setModelFilter('all');
    store.setModelQuery('视觉');
    expect(store.filteredModels.length).toBeGreaterThan(0);
    expect(
      store.filteredModels.every(
        (m) =>
          m.label.includes('视觉') ||
          m.description.includes('视觉') ||
          m.tags.some((t) => t.includes('视觉')),
      ),
    ).toBe(true);
  });

  it('收藏：切换收藏并仅看收藏', () => {
    const store = useChatStore();
    const target = CHAT_MODELS.find((m) => !m.favorite) ?? CHAT_MODELS[1]!;
    expect(store.isFavorite(target.id)).toBe(false);
    store.toggleFavorite(target.id);
    expect(store.isFavorite(target.id)).toBe(true);

    store.toggleShowFavoritesOnly();
    expect(store.prefs.showFavoritesOnly).toBe(true);
    expect(
      store.filteredModels.every((m) => store.isFavorite(m.id)),
    ).toBe(true);

    store.toggleFavorite(target.id);
    store.toggleShowFavoritesOnly();
    expect(store.isFavorite(target.id)).toBe(false);
  });

  it('切换当前模型：更新偏好与活跃会话模型，不丢失会话消息', () => {
    const store = useChatStore();
    store.sendMessage('一条测试消息');
    expect(store.activeSession!.messages).toHaveLength(2);
    const before = store.activeSession!.messages;

    store.setCurrentModel('visual-prompt');
    expect(store.currentModel).toBe('visual-prompt');
    expect(store.activeSession!.model).toBe('visual-prompt');
    // 消息仍在，且内容不变
    expect(store.activeSession!.messages).toHaveLength(before.length);
    expect(store.activeSession!.messages[0]!.content).toBe('一条测试消息');
  });

  it('新会话默认使用当前偏好模型', () => {
    const store = useChatStore();
    store.setCurrentModel('long-form-writing');
    store.createSession();
    expect(store.activeSession!.model).toBe('long-form-writing');
  });
});

describe('chat 偏好持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('输出模式 / 回复长度 / 当前模型 / 收藏写入 localStorage，重新加载可恢复', async () => {
    const store = useChatStore();
    const target = CHAT_MODELS.find((m) => !m.favorite) ?? CHAT_MODELS[1]!;
    store.setOutputMode('writing');
    store.setReplyLength('detailed');
    store.setCurrentModel('visual-prompt');
    store.toggleFavorite(target.id);

    await nextTick(); // 持久化 watch 为异步 flush
    const raw = localStorage.getItem(PREFERENCES_KEY);
    expect(raw).not.toBeNull();

    // 新 Pinia 实例模拟刷新恢复
    setActivePinia(createPinia());
    const store2 = useChatStore();
    expect(store2.prefs.outputMode).toBe('writing');
    expect(store2.prefs.replyLength).toBe('detailed');
    expect(store2.prefs.currentModel).toBe('visual-prompt');
    expect(store2.isFavorite(target.id)).toBe(true);
  });

  it('损坏的偏好数据：回退安全默认值并清理无效存储', async () => {
    localStorage.setItem(PREFERENCES_KEY, '{bad json');
    const store = useChatStore();
    expect(store.prefsRecovered).toBe(true);
    expect(store.prefs.outputMode).toBe('chat');
    expect(store.prefs.replyLength).toBe('standard');
    expect(store.prefs.currentModel).toBe(CHAT_MODELS[0]!.id);
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it('结构不兼容的偏好数据：回退默认值并清理', async () => {
    localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ modelFilter: 'invalid-cat' }));
    const store = useChatStore();
    expect(store.prefsRecovered).toBe(true);
    expect(store.prefs.modelFilter).toBe('all');
    expect(localStorage.getItem(PREFERENCES_KEY)).toBeNull();
  });

  it('缺字段的旧偏好数据：补默认值，不视为损坏', async () => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ outputMode: 'code', modelQuery: '' }),
    );
    const store = useChatStore();
    expect(store.prefsRecovered).toBe(false);
    expect(store.prefs.outputMode).toBe('code');
    expect(store.prefs.replyLength).toBe('standard');
    expect(store.prefs.currentModel).toBe(CHAT_MODELS[0]!.id);
  });
});

describe('chat service 上下文透传', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('发送消息时 service 收到输出模式 / 模型 / 回复长度', async () => {
    const spy = vi.fn<(input: string, options?: object) => Promise<string>>(
      () => Promise.resolve('ok'),
    );
    setChatReplyService({ generateReply: spy });

    const store = useChatStore();
    store.setOutputMode('code');
    store.setReplyLength('detailed');
    store.sendMessage('写一个组件');

    // flush microtask：generateReply 已调用，streamInto 已启动
    await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]).toBe('写一个组件');
    expect(spy.mock.calls[0]?.[1]).toMatchObject({
      mode: 'code',
      model: CHAT_MODELS[0]!.id,
      replyLength: 'detailed',
    });
    store.stopStreaming();
  });

  it('mock service 按输出模式与模型返回不同但确定性的演示内容', async () => {
    const svc = new MockChatReplyService();
    const imageReply = await svc.generateReply('深夜书房', {
      mode: 'image',
      model: 'visual-prompt',
    });
    expect(imageReply).toContain('图像提示词');
    expect(imageReply).toContain('视觉提示');

    const chatReply = await svc.generateReply('深夜书房', { mode: 'chat', model: 'general-reasoning' });
    expect(chatReply).not.toContain('图像提示词');
    expect(chatReply).toContain('通用推理');
  });
});
