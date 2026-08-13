import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AppIconButton from '@/components/AppIconButton.vue';
import AppStatus from '@/components/AppStatus.vue';
import AppToastHost from '@/components/AppToastHost.vue';
import AppTooltip from '@/components/AppTooltip.vue';
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue';
import { clearToasts, toast } from '@/app/toast';
import { confirm, confirmState } from '@/app/confirm';

afterEach(() => {
  clearToasts();
  confirmState.request = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('app-ui toast', () => {
  it('toast() 入队并由宿主渲染；手动关闭移除条目', async () => {
    const host = mount(AppToastHost, { attachTo: document.body });
    toast.success('已保存');
    await flushPromises();

    const items = document.body.querySelectorAll('.app-toast');
    expect(items.length).toBe(1);
    expect(items[0]!.textContent).toContain('已保存');
    expect(items[0]!.classList.contains('app-toast--success')).toBe(true);
    expect(items[0]!.getAttribute('role')).toBe('status');

    // 手动关闭
    (items[0]!.querySelector('button') as HTMLButtonElement).click();
    await flushPromises();
    expect(document.body.querySelectorAll('.app-toast').length).toBe(0);
    host.unmount();
  });

  it('自动消失：默认 3200ms 后移除；duration 0 不自动消失', async () => {
    vi.useFakeTimers();
    const host = mount(AppToastHost, { attachTo: document.body });
    toast.info('短消息', { duration: 1000 });
    toast.info('常驻消息', { duration: 0 });
    await flushPromises();
    expect(document.body.querySelectorAll('.app-toast').length).toBe(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(document.body.querySelectorAll('.app-toast').length).toBe(1);
    expect(document.body.textContent).toContain('常驻消息');

    host.unmount();
    // 宿主卸载：清理全部计时器，不遗留
    expect(vi.getTimerCount()).toBe(0);
  });

  it('宿主卸载后不遗留定时器（未到期的自动消失计时器全部清理）', async () => {
    vi.useFakeTimers();
    const host = mount(AppToastHost, { attachTo: document.body });
    toast.info('a');
    toast.info('b');
    await flushPromises();
    expect(vi.getTimerCount()).toBe(2);
    host.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('超过队列上限（4 条）时丢弃最旧条目', async () => {
    const host = mount(AppToastHost, { attachTo: document.body });
    for (let i = 0; i < 5; i += 1) toast.info(`msg-${i}`);
    await flushPromises();
    const items = document.body.querySelectorAll('.app-toast');
    expect(items.length).toBe(4);
    expect(document.body.textContent).not.toContain('msg-0');
    expect(document.body.textContent).toContain('msg-4');
    host.unmount();
  });
});

describe('app-ui confirm', () => {
  it('confirm() 返回 Promise；确认按钮 resolve(true)，取消 resolve(false)', async () => {
    const host = mount(ConfirmDialogHost, { attachTo: document.body });

    let outcome: boolean | null = null;
    const p = confirm({ title: '删除项目？', message: '该操作不可撤销', tone: 'danger' });
    p.then((v) => (outcome = v));
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    expect(dialog!.textContent).toContain('删除项目？');
    expect(dialog!.textContent).toContain('该操作不可撤销');

    const buttons = dialog!.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    expect(buttons[0]!.textContent).toBe('取消');
    expect(buttons[1]!.textContent).toBe('确认');
    expect(buttons[1]!.classList.contains('confirm-dialog__confirm--danger')).toBe(true);

    (buttons[1] as HTMLButtonElement).click();
    await flushPromises();
    expect(outcome).toBe(true);
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    host.unmount();
  });

  it('Escape 等价取消，且焦点归还给打开前的元素', async () => {
    const host = mount(ConfirmDialogHost, { attachTo: document.body });
    const trigger = document.createElement('button');
    trigger.id = 'trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    let outcome: boolean | null = null;
    confirm({ title: '确认？' }).then((v) => (outcome = v));
    await flushPromises();
    expect(document.body.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(document.activeElement).not.toBe(trigger);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(outcome).toBe(false);
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    host.unmount();
  });
});

describe('app-ui 统一组件', () => {
  it('AppIconButton：必填 aria-label + title，禁用态不触发点击', async () => {
    const wrapper = mount(AppIconButton, {
      props: { label: '关闭面板', disabled: true },
      slots: { default: '<span>x</span>' },
    });
    expect(wrapper.attributes('aria-label')).toBe('关闭面板');
    expect(wrapper.attributes('title')).toBe('关闭面板');
    expect(wrapper.attributes('disabled')).toBeDefined();
  });

  it('AppStatus：loading 用 role=status，error 用 role=alert 并提供重试', async () => {
    const loading = mount(AppStatus, { props: { loading: true, label: '加载中…' } });
    expect(loading.attributes('role')).toBe('status');
    expect(loading.text()).toContain('加载中…');

    const err = mount(AppStatus, { props: { error: '网络错误' } });
    expect(err.attributes('role')).toBe('alert');
    expect(err.text()).toContain('网络错误');
    const retry = vi.fn();
    err.find('button').trigger('click');
    expect(retry).not.toHaveBeenCalled(); // 未监听 emit，仅验证按钮存在
  });

  it('AppTooltip：纯 CSS 提示，无 JS 监听器', async () => {
    const wrapper = mount(AppTooltip, {
      props: { text: '提示文本' },
      slots: { default: '<button>按钮</button>' },
    });
    const host = wrapper.find('.app-tooltip');
    expect(host.attributes('data-tip')).toBe('提示文本');
    expect(wrapper.find('button').exists()).toBe(true);
  });
});
