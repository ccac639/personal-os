import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatComposer from '@/features/chat/components/chat-composer.vue';
import ChatMessage from '@/features/chat/components/chat-message.vue';
import {
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_SIZE,
  formatFileSize,
  reorderAttachments,
  validateDraftFiles,
} from '@/features/chat/draft';
import { setChatReplyService } from '@/features/chat/service';
import { useChatStore } from '@/features/chat/store';
import type { ChatAttachmentDraft, ChatMessage as ChatMessageType } from '@/features/chat/types';

function makeMsg(over: Partial<ChatMessageType> = {}): ChatMessageType {
  return {
    id: Math.random().toString(36).slice(2),
    role: 'assistant',
    content: '',
    createdAt: Date.now(),
    ...over,
  };
}

function makeFile(name: string, type: string, size = 10): File {
  return new File([new ArrayBuffer(size)], name, { type });
}

describe('chat 附件草稿校验与排序', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('类型白名单：非图片拒绝并报错', () => {
    const files = [makeFile('doc.txt', 'text/plain')];
    const result = validateDraftFiles(files, [], () => 'blob:x');
    expect(result.items).toHaveLength(0);
    expect(result.errors.some((e) => e.code === 'type')).toBe(true);
    expect(result.errors[0]!.message).toContain('doc.txt');
  });

  it('大小上限：超过 10MB 拒绝', () => {
    const big = makeFile('big.png', 'image/png', MAX_ATTACHMENT_SIZE + 1);
    const result = validateDraftFiles([big], [], () => 'blob:x');
    expect(result.items).toHaveLength(0);
    expect(result.errors.some((e) => e.code === 'size')).toBe(true);
  });

  it('数量上限：已有 6 张后拒绝新增', () => {
    const existing: ChatAttachmentDraft[] = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => ({
      id: `a${i}`,
      name: `a${i}.png`,
      type: 'image/png',
      size: 1,
      url: `blob:${i}`,
    }));
    const result = validateDraftFiles([makeFile('extra.png', 'image/png')], existing, () => 'blob:x');
    expect(result.items).toHaveLength(0);
    expect(result.errors.some((e) => e.code === 'count')).toBe(true);
  });

  it('合法与非法混合：合法加入、非法报错', () => {
    const files = [makeFile('ok.png', 'image/png'), makeFile('bad.gif', 'text/html')];
    const result = validateDraftFiles(files, [], () => 'blob:preview');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.name).toBe('ok.png');
    expect(result.items[0]!.url).toBe('blob:preview');
    expect(result.errors).toHaveLength(1);
  });

  it('拖拽排序：返回新数组，越界不修改原顺序', () => {
    const list = ['a', 'b', 'c'];
    expect(reorderAttachments(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderAttachments(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(reorderAttachments(list, -1, 1)).toEqual(list);
    expect(reorderAttachments(list, 0, 99)).toEqual(list);
    expect(list).toEqual(['a', 'b', 'c']); // 原数组不被修改
  });

  it('文件大小格式化', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

describe('ChatComposer 附件交互', () => {
  let pinia: ReturnType<typeof createPinia>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('拖放图片：仅本地预览，绝不写入 localStorage', async () => {
    const createObjectURL = vi.fn(() => 'blob:mock-preview');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });

    const before = { ...localStorage };
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });

    const file = makeFile('示例图片.png', 'image/png');
    await wrapper.find('textarea').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await nextTick();

    expect(wrapper.find('img[alt="示例图片.png"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('待上传');
    expect(createObjectURL).toHaveBeenCalledWith(file);

    // localStorage 无任何变化（无图片二进制 / 无 blob 引用）
    expect(Object.keys(localStorage)).toEqual(Object.keys(before));

    // 上移 / 下移按钮存在（键盘可达的排序入口）
    expect(wrapper.find('button[aria-label="上移附件 示例图片.png"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('button[aria-label="下移附件 示例图片.png"]').exists()).toBe(true);

    await wrapper.find('button[aria-label="移除附件 示例图片.png"]').trigger('click');
    expect(wrapper.find('img[alt="示例图片.png"]').exists()).toBe(false);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-preview');

    vi.unstubAllGlobals();
    wrapper.unmount();
  });

  it('非法类型拖放：显示校验错误且不产生预览', async () => {
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    const file = makeFile('note.txt', 'text/plain');
    await wrapper.find('textarea').trigger('drop', {
      dataTransfer: { files: [file] },
    });
    await nextTick();

    expect(wrapper.find('[role="alert"]').text()).toContain('note.txt');
    expect(wrapper.find('img[alt="note.txt"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('拖拽排序：通过 drop 事件调整附件顺序', async () => {
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    const files = [makeFile('第一张.png', 'image/png'), makeFile('第二张.png', 'image/png')];
    await wrapper.find('textarea').trigger('drop', { dataTransfer: { files } });
    await nextTick();

    // 第一张拖到第二位
    const first = wrapper.find('[aria-label="附件 第一张.png"]');
    const second = wrapper.find('[aria-label="附件 第二张.png"]');
    await first.trigger('dragstart');
    await second.trigger('drop');
    await nextTick();

    const order = wrapper
      .findAll('[aria-label^="附件 "]')
      .map((el) => el.attributes('aria-label'));
    expect(order).toEqual(['附件 第二张.png', '附件 第一张.png']);
    wrapper.unmount();
  });

  it('发送后清空附件草稿', async () => {
    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    const file = makeFile('发送用.png', 'image/png');
    await wrapper.find('textarea').trigger('drop', { dataTransfer: { files: [file] } });
    await wrapper.find('textarea').setValue('带着图片提问');
    await wrapper.find('button[aria-label="发送消息"]').trigger('click');
    await nextTick();
    expect(wrapper.find('img[alt="发送用.png"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('chat 引用回复', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
    setChatReplyService({ generateReply: (input) => Promise.resolve(`回复：${input}`) });
  });

  it('beginQuote 快照消息，发送时附着到用户消息，发送后清除', async () => {
    const store = useChatStore();
    store.sendMessage('原始问题');
    const quoted = store.activeSession!.messages[1]!;

    store.beginQuote(quoted.id);
    expect(store.quoteTarget).toMatchObject({ id: quoted.id, role: 'assistant' });

    store.sendMessage('针对上一条回复');
    const lastUser = store.activeSession!.messages[2]!;
    expect(lastUser.quote).toEqual({
      id: quoted.id,
      role: 'assistant',
      content: quoted.content,
    });
    // 发送后 UI 层清空引用态（store 侧由组件调用 clearQuote）
    store.clearQuote();
    expect(store.quoteTarget).toBeNull();
  });

  it('编辑带引用的消息：保留原引用快照', async () => {
    const store = useChatStore();
    store.sendMessage('原始问题');
    await Promise.resolve();
    store.stopStreaming();
    const quoted = store.activeSession!.messages[1]!;

    store.beginQuote(quoted.id);
    store.sendMessage('引用提问');
    const quotedUser = store.activeSession!.messages[2]!;
    store.editAndResend(quotedUser.id, '修改后的引用提问');
    const edited = store.activeSession!.messages[2]!;
    expect(edited.quote).toEqual({
      id: quoted.id,
      role: 'assistant',
      content: quoted.content,
    });
  });

  it('composer 显示引用条，Esc 取消引用', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.sendMessage('原始问题');
    const quoted = store.activeSession!.messages[1]!;
    store.beginQuote(quoted.id);

    const wrapper = mount(ChatComposer, { global: { plugins: [pinia] } });
    await nextTick();
    expect(wrapper.find('button[aria-label="取消引用"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('引用助手消息');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    expect(store.quoteTarget).toBeNull();
    expect(wrapper.find('button[aria-label="取消引用"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('消息组件：引用回复按钮进入引用态，书签切换且持久化', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    const msg = makeMsg({ id: 'm1', role: 'assistant', content: '需要引用的内容' });
    store.activeSession!.messages.push(msg);

    const wrapper = mount(ChatMessage, {
      props: { message: msg, isLast: true },
      global: { plugins: [pinia] },
    });

    await wrapper.find('button[aria-label="引用回复此回复"]').trigger('click');
    expect(store.quoteTarget?.id).toBe('m1');
    store.clearQuote();

    const bookmarkBtn = wrapper.find('button[aria-label="添加书签"]');
    expect(bookmarkBtn.exists()).toBe(true);
    await bookmarkBtn.trigger('click');
    expect(store.activeSession!.messages[0]!.bookmarked).toBe(true);
    expect(wrapper.find('button[aria-label="取消书签"]').attributes('aria-pressed')).toBe('true');

    await nextTick();
    // 书签持久化到会话存储
    const raw = localStorage.getItem('personal-os.chat.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as Array<{ messages: ChatMessageType[] }>;
    expect(parsed[0]!.messages[0]!.bookmarked).toBe(true);

    await wrapper.find('button[aria-label="取消书签"]').trigger('click');
    expect(store.activeSession!.messages[0]!.bookmarked).toBeFalsy();
    wrapper.unmount();
  });

  it('用户消息展示引用块', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useChatStore();
    store.createSession();
    const msg = makeMsg({
      id: 'u1',
      role: 'user',
      content: '我的问题',
      quote: { id: 'a1', role: 'assistant', content: '被引用的回复' },
    });
    store.activeSession!.messages.push(msg);

    const wrapper = mount(ChatMessage, {
      props: { message: msg, isLast: true },
      global: { plugins: [pinia] },
    });
    expect(wrapper.text()).toContain('引用助手');
    expect(wrapper.text()).toContain('被引用的回复');
    wrapper.unmount();
  });
});
