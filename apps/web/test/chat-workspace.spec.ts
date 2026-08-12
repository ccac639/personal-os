import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setChatActionHandler } from '@/features/chat/actions';
import ChatComposer from '@/features/chat/components/chat-composer.vue';
import ChatMessage from '@/features/chat/components/chat-message.vue';
import ChatModelList from '@/features/chat/components/chat-model-list.vue';
import ChatSidebar from '@/features/chat/components/chat-sidebar.vue';
import ChatWelcome from '@/features/chat/components/chat-welcome.vue';
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

describe('ChatWelcome 欢迎态', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('以当前模型为核心：显示模型名与能力说明', () => {
    const wrapper = mountWithPinia(ChatWelcome);
    expect(wrapper.text()).toContain('通用推理');
    expect(wrapper.text()).toContain('适合日常问答、分析、头脑风暴的通用模型');
  });

  it('建议任务随模型类别变化', async () => {
    const store = useChatStore();
    const wrapper = mountWithPinia(ChatWelcome);
    // 默认 chat 类建议
    expect(wrapper.text()).toContain('梳理项目现状');

    // 切到图像类模型 → 建议变为图像类
    store.setCurrentModel('visual-prompt');
    await nextTick();
    expect(wrapper.text()).toContain('生成视觉提示词');
    expect(wrapper.text()).not.toContain('梳理项目现状');
  });
});

describe('ChatComposer 创作控制台', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('输出模式与回复长度切换写入偏好', async () => {
    const store = useChatStore();
    const wrapper = mountWithPinia(ChatComposer);

    await wrapper.find('button[aria-pressed="false"]').trigger('click');
    expect(store.prefs.outputMode).not.toBe('chat');

    // 点击「写作」
    const writingBtn = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === '写作');
    await writingBtn!.trigger('click');
    expect(store.prefs.outputMode).toBe('writing');

    const detailedBtn = wrapper
      .findAll('button')
      .find((b) => b.text().trim() === '详细');
    await detailedBtn!.trigger('click');
    expect(store.prefs.replyLength).toBe('detailed');
  });

  it('发送中显示停止按钮，点击停止生成', async () => {
    const store = useChatStore();
    const wrapper = mountWithPinia(ChatComposer);
    await wrapper.find('textarea').setValue('你好');
    await wrapper.find('button[aria-label="发送消息"]').trigger('click');
    await nextTick();

    expect(store.isStreaming).toBe(true);
    const stopBtn = wrapper.find('button[aria-label="停止生成"]');
    expect(stopBtn.exists()).toBe(true);
    await stopBtn.trigger('click');
    expect(store.isStreaming).toBe(false);
  });

  it('图片拖放预览：仅本地展示，不写入 localStorage', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-preview');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });

    const before = { ...localStorage };
    const wrapper = mountWithPinia(ChatComposer);

    const file = new File(['x'], '示例图片.png', { type: 'image/png' });
    await wrapper.find('textarea').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await nextTick();

    // 预览出现
    expect(wrapper.find('img[alt="示例图片.png"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('待上传');
    expect(createObjectURL).toHaveBeenCalledWith(file);

    // localStorage 无任何变化（无图片二进制 / 无 blob 引用）
    expect(Object.keys(localStorage)).toEqual(Object.keys(before));

    // 移除附件
    await wrapper.find('button[aria-label="移除附件 示例图片.png"]').trigger('click');
    expect(wrapper.find('img[alt="示例图片.png"]').exists()).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');

    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it('系统提示词开关：点击展开面板，文本不落盘', async () => {
    const store = useChatStore();
    const wrapper = mountWithPinia(ChatComposer);

    await wrapper.find('button[aria-label="系统提示词"]').trigger('click');
    await nextTick();
    expect(store.prefs.systemPromptEnabled).toBe(true);
    expect(wrapper.find('textarea[aria-label="系统提示词内容"]').exists()).toBe(true);

    // 再点关闭
    await wrapper.find('button[aria-label="系统提示词"]').trigger('click');
    await nextTick();
    expect(store.prefs.systemPromptEnabled).toBe(false);
    expect(wrapper.find('textarea[aria-label="系统提示词内容"]').exists()).toBe(false);
  });
});

describe('ChatModelList 模型库交互', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('模型卡片支持键盘操作（Enter 选择）', async () => {
    const store = useChatStore();
    const wrapper = mountWithPinia(ChatModelList);
    const first = wrapper.find('[aria-label^="选择模型"]');
    await first.trigger('keydown', { key: 'Enter' });
    expect(store.currentModel).toBe(store.filteredModels[0]!.id);
  });

  it('切换模型不影响已打开会话消息', async () => {
    const store = useChatStore();
    store.sendMessage('会话内容');
    store.setCurrentModel('code-collab');
    expect(store.activeSession!.messages).toHaveLength(2);
    expect(store.activeSession!.messages[0]!.content).toBe('会话内容');
  });
});

describe('ChatSidebar 窄屏抽屉', () => {
  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
  });

  it('打开后选择模型自动收起', async () => {
    let mobileOpen = true;
    const wrapper = mount(ChatSidebar, {
      props: {
        mobileOpen,
        'onUpdate:mobileOpen': (v: boolean) => {
          mobileOpen = v;
          wrapper.setProps({ mobileOpen: v });
        },
      },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(wrapper.find('aside').exists()).toBe(true);

    await wrapper.find('[aria-label^="选择模型"]').trigger('click');
    await nextTick();
    expect(mobileOpen).toBe(false);
  });
});

describe('Chat 可访问性与结果操作', () => {
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
    setChatActionHandler(null);
  });

  it('创作控制台图标按钮均有 aria-label 与焦点态', () => {
    const wrapper = mountWithPinia(ChatComposer);
    for (const label of ['添加图片', '选择模型', '系统提示词']) {
      expect(wrapper.find(`button[aria-label="${label}"]`).exists()).toBe(true);
    }
    // 输出模式为 segmented，带 aria-pressed
    expect(wrapper.find('button[aria-pressed="true"]').exists()).toBe(true);
    // 焦点态类（focus-visible ring）存在于图标按钮
    const attachBtn = wrapper.find('button[aria-label="添加图片"]');
    expect(attachBtn.classes().join(' ')).toContain('focus-visible:ring-2');
  });

  it('结果操作生成本地 payload，可通过注入回调接管', async () => {
    const handler = vi.fn();
    setChatActionHandler(handler);
    const wrapper = mountWithPinia(ChatMessage, {
      props: {
        message: makeMsg({ id: 'a1', role: 'assistant', content: '生成结果内容' }),
        isLast: true,
      },
    });

    await wrapper.find('button[aria-label="加入任务"]').trigger('click');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      kind: 'add-task',
      messageId: 'a1',
    });
    setChatActionHandler(null);
  });
});
