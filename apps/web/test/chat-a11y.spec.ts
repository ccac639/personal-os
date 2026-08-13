/**
 * Chat 抽屉 / 弹窗可访问性测试
 *
 * 覆盖：Escape 关闭、遮罩关闭、打开时焦点移入、关闭后焦点恢复到触发元素、
 * role="dialog" 与 aria-modal 语义。
 * 注意：ChatDrawer 使用 Teleport 到 body，断言需通过 document 查询。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ChatDrawer from '@/features/chat/components/chat-drawer.vue';

function dialogEl(): HTMLElement | null {
  return document.querySelector('[role="dialog"]');
}

function mountHost() {
  const host = document.createElement('div');
  host.innerHTML = '<button id="trigger">打开抽屉</button>';
  document.body.appendChild(host);
  const wrapper = mount(
    {
      components: { ChatDrawer },
      template: `
        <button id="trigger" @click="open = true">打开抽屉</button>
        <ChatDrawer v-if="open" :open="open" @close="open = false" title="测试抽屉">
          <p id="content">抽屉内容</p>
        </ChatDrawer>
      `,
      data: () => ({ open: false }),
    },
    { attachTo: host },
  );
  return { wrapper, trigger: host.querySelector('#trigger') as HTMLButtonElement };
}

describe('ChatDrawer 可访问性', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('打开后：role=dialog + aria-modal，焦点移入抽屉', async () => {
    const { wrapper, trigger } = mountHost();
    trigger!.focus();
    await wrapper.find('#trigger').trigger('click');
    await flushPromises();

    const dialog = dialogEl();
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.getAttribute('aria-label')).toBe('测试抽屉');
    expect(dialog!.querySelector('#content')).not.toBeNull();
    // 焦点已移入抽屉（aria 区域）
    expect(document.activeElement).not.toBe(trigger);
    wrapper.unmount();
  });

  it('Escape 关闭抽屉', async () => {
    const { wrapper } = mountHost();
    await wrapper.find('#trigger').trigger('click');
    await flushPromises();
    expect(dialogEl()).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => {
      expect(dialogEl()).toBeNull();
    });
    wrapper.unmount();
  });

  it('点击遮罩关闭抽屉', async () => {
    const { wrapper } = mountHost();
    await wrapper.find('#trigger').trigger('click');
    await flushPromises();
    expect(dialogEl()).not.toBeNull();

    const mask = document.querySelector('.drawer-mask') as HTMLElement | null;
    expect(mask).not.toBeNull();
    mask!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await nextTick();
    expect(dialogEl()).toBeNull();
    wrapper.unmount();
  });

  it('关闭后焦点恢复到触发元素', async () => {
    const { wrapper, trigger } = mountHost();
    trigger!.focus();
    await wrapper.find('#trigger').trigger('click');
    await flushPromises();
    expect(document.activeElement).not.toBe(trigger);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await vi.waitFor(() => {
      expect(dialogEl()).toBeNull();
    });
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
  });
});
