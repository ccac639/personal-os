import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatComposer from '@/features/chat/components/chat-composer.vue';
import {
  BUILTIN_SYSTEM_PROMPTS,
  allSystemPromptPresets,
  createCustomPreset,
  promptPresetName,
  removeCustomPreset,
  systemPromptPresetById,
} from '@/features/chat/presets';
import { MockChatReplyService } from '@/features/chat/service';
import { PRESETS_KEY } from '@/features/chat/storage';
import { useChatStore } from '@/features/chat/store';

describe('chat 系统提示词预设', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('内置预设：通用协作 / 代码审阅 / 写作编辑 / 任务拆解', () => {
    expect(BUILTIN_SYSTEM_PROMPTS).toHaveLength(4);
    const ids = BUILTIN_SYSTEM_PROMPTS.map((p) => p.id);
    expect(ids).toEqual([
      'general-collab',
      'code-review',
      'writing-edit',
      'task-decompose',
    ]);
    expect(BUILTIN_SYSTEM_PROMPTS.every((p) => p.builtin && p.text.length > 0)).toBe(true);
  });

  it('自定义预设：持久化到 localStorage，重新读取仍存在', () => {
    const preset = createCustomPreset('我的审阅规则', '只关注安全与性能');
    expect(preset).not.toBeNull();
    expect(preset!.builtin).toBe(false);

    const all = allSystemPromptPresets();
    expect(all).toHaveLength(BUILTIN_SYSTEM_PROMPTS.length + 1);
    expect(all.some((p) => p.name === '我的审阅规则')).toBe(true);

    const raw = localStorage.getItem(PRESETS_KEY);
    expect(raw).not.toBeNull();
    expect(raw!).toContain('我的审阅规则');

    // 模拟刷新（重新读存储）
    const reloaded = allSystemPromptPresets();
    expect(reloaded.some((p) => p.name === '我的审阅规则')).toBe(true);
    expect(systemPromptPresetById(preset!.id)?.text).toBe('只关注安全与性能');
  });

  it('空名称 / 空文本的自定义预设被拒绝且不落盘', () => {
    expect(createCustomPreset('  ', '有效文本')).toBeNull();
    expect(createCustomPreset('有效名称', '   ')).toBeNull();
    expect(localStorage.getItem(PRESETS_KEY)).toBeNull();
  });

  it('损坏的预设数据：回退内置列表并清理无效存储', () => {
    localStorage.setItem(PRESETS_KEY, '{bad json');
    const all = allSystemPromptPresets();
    expect(all).toHaveLength(BUILTIN_SYSTEM_PROMPTS.length);
    expect(localStorage.getItem(PRESETS_KEY)).toBeNull();
  });

  it('删除自定义预设；内置预设不可删除', () => {
    const preset = createCustomPreset('临时预设', '内容')!;
    removeCustomPreset('general-collab');
    expect(allSystemPromptPresets().some((p) => p.name === '临时预设')).toBe(true);

    removeCustomPreset(preset.id);
    expect(allSystemPromptPresets().some((p) => p.name === '临时预设')).toBe(false);
  });

  it('预设展示名：custom → 自定义，未知 id → 自定义，未设置 → 无', () => {
    expect(promptPresetName(undefined)).toBe('无');
    expect(promptPresetName('custom')).toBe('自定义');
    expect(promptPresetName('code-review')).toBe('代码审阅');
    expect(promptPresetName('not-exist')).toBe('自定义');
  });

  it('会话级：应用 / 清除 / 恢复默认', () => {
    const store = useChatStore();
    store.createSession();

    store.setSessionSystemPrompt('code-review', '只关注正确性');
    expect(store.activeSession!.systemPrompt).toEqual({
      presetId: 'code-review',
      text: '只关注正确性',
    });
    expect(store.sessionSystemPrompt?.presetId).toBe('code-review');

    store.clearSessionSystemPrompt();
    expect(store.activeSession!.systemPrompt).toBeUndefined();
    expect(store.sessionSystemPrompt).toBeNull();

    store.restoreDefaultSystemPrompt();
    expect(store.sessionSystemPrompt?.presetId).toBe('general-collab');
    expect(store.sessionSystemPrompt?.text).toBe(
      systemPromptPresetById('general-collab')!.text,
    );
  });

  it('发送时 service 收到会话级 systemPrompt 与 presetName', async () => {
    const spy = vi.fn<(input: string, options?: object) => Promise<string>>(
      () => Promise.resolve('ok'),
    );
    const { setChatReplyService } = await import('@/features/chat/service');
    setChatReplyService({ generateReply: spy });

    const store = useChatStore();
    store.setSessionSystemPrompt('writing-edit', '你是一位编辑');
    store.sendMessage('帮我润色');

    await Promise.resolve();
    expect(spy.mock.calls[0]?.[1]).toMatchObject({
      systemPrompt: '你是一位编辑',
      presetName: '写作编辑',
    });
    store.stopStreaming();
  });

  it('mock 回复署名包含已应用的预设', async () => {
    const svc = new MockChatReplyService();
    const reply = await svc.generateReply('写个标题', {
      mode: 'writing',
      model: 'long-form-writing',
      systemPrompt: '你是一位编辑',
      presetName: '写作编辑',
    });
    expect(reply).toContain('已应用提示词（写作编辑）');
    const plain = await svc.generateReply('写个标题', { mode: 'chat' });
    expect(plain).not.toContain('已应用提示词');
  });
});

describe('ChatComposer 预设面板', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  async function openPanel(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('button[aria-label="系统提示词"]').trigger('click');
  }

  it('点击预设芯片应用到会话；点「无」清除', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await openPanel(wrapper);

    await wrapper.findAll('button').find((b) => b.text().includes('代码审阅'))!.trigger('click');
    expect(store.sessionSystemPrompt?.presetId).toBe('code-review');

    await wrapper.findAll('button').find((b) => b.text().trim() === '无')!.trigger('click');
    expect(store.sessionSystemPrompt).toBeNull();
    wrapper.unmount();
  });

  it('自定义文本应用 / 另存为预设', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await openPanel(wrapper);

    const ta = wrapper.find('textarea[aria-label="系统提示词内容"]');
    await ta.setValue('我的自定义规则');
    await wrapper.find('button[aria-label="应用自定义提示词"]').trigger('click');
    expect(store.sessionSystemPrompt).toEqual({
      presetId: 'custom',
      text: '我的自定义规则',
    });

    await wrapper.find('button[aria-label="另存为预设"]').trigger('click');
    await wrapper.find('input[aria-label="自定义预设名称"]').setValue('常用规则');
    await wrapper.find('button[aria-label="保存自定义预设"]').trigger('click');
    expect(allSystemPromptPresets().some((p) => p.name === '常用规则')).toBe(true);
    expect(store.sessionSystemPrompt?.presetId).not.toBe('custom');
    wrapper.unmount();
  });

  it('复制：把当前提示词写入剪贴板', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    store.setSessionSystemPrompt('task-decompose', '拆解任务');
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await openPanel(wrapper);

    await wrapper.find('button[aria-label="复制系统提示词"]').trigger('click');
    await vi.waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('拆解任务');
    });
    wrapper.unmount();
  });

  it('恢复默认：重置为内置「通用协作」', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    store.setSessionCustomPrompt('临时内容');
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await openPanel(wrapper);

    await wrapper.find('button[aria-label="恢复默认提示词"]').trigger('click');
    expect(store.sessionSystemPrompt?.presetId).toBe('general-collab');
    expect(store.sessionSystemPrompt?.text).toBe(
      BUILTIN_SYSTEM_PROMPTS[0]!.text,
    );
    wrapper.unmount();
  });
});
