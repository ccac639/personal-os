import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DefaultLayout from '@/layouts/default-layout.vue';

/**
 * 应用壳层测试：跳转链接 / 移动端抽屉焦点管理 / 窄屏容器不溢出 /
 * 导航项 hover/focus 预取 / 监听器卸载清理。
 */
const TestPage = { name: 'TestPage', template: '<div class="test-page" />' };

const testRoutes: RouteRecordRaw[] = [
  { path: '/', component: TestPage },
  { path: '/chat', component: TestPage },
  { path: '/workflows', component: TestPage },
  { path: '/settings', component: TestPage },
  { path: '/:pathMatch(.*)*', component: TestPage },
];

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: testRoutes,
  });
}

function stubMatchMedia(query: string, matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((q: string) => ({
      matches: q === query ? matches : !matches,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('app-shell 跳转链接与焦点管理', () => {
  it('点击跳转链接将焦点移到主内容容器', async () => {
    const router = createTestRouter();
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const skip = wrapper.find('a[href="#main-content"]');
    expect(skip.exists()).toBe(true);
    const main = wrapper.find('main#main-content');
    expect(main.attributes('tabindex')).toBe('-1');

    await skip.trigger('click');
    expect(document.activeElement).toBe(main.element);
    wrapper.unmount();
  });

  it('抽屉焦点圈定：Tab 在抽屉内循环，不逃逸到页面', async () => {
    stubMatchMedia('(min-width: 768px)', false);
    const router = createTestRouter();
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    await wrapper.find('button[aria-label="打开导航菜单"]').trigger('click');
    await flushPromises();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();

    const focusables = Array.from(
      dialog!.querySelectorAll<HTMLElement>('a[href], button:not([disabled])'),
    );
    expect(focusables.length).toBeGreaterThanOrEqual(2);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    // 焦点在最后一个元素时按 Tab → 回到第一个
    last.focus();
    const panel = dialog!.querySelector<HTMLElement>('.app-drawer__panel')!;
    panel.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(first);

    // Shift+Tab 在第一个元素 → 跳到最后
    first.focus();
    panel.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(document.activeElement).toBe(last);

    wrapper.unmount();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('app-shell 导航预取与窄屏容器', () => {
  it('hover / focus 导航项触发目标路由预取（不阻塞初始加载，不预取全部页面）', async () => {
    const router = createTestRouter();
    await router.push('/');
    await flushPromises();
    const resolveSpy = vi.spyOn(router, 'resolve').mockClear();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    // RouterLink 渲染时会 resolve 一次（计算 href），此处用计数差分验证预取增量
    const count = (path: string) => resolveSpy.mock.calls.filter((c) => c[0] === path).length;
    const chatBefore = count('/chat');
    const workflowsBefore = count('/workflows');

    const chatLink = wrapper.findAll('nav a')[1];
    await chatLink.trigger('mouseenter');
    expect(count('/chat')).toBe(chatBefore + 1);
    await chatLink.trigger('focusin');
    expect(count('/chat')).toBe(chatBefore + 2);
    // 未被 hover / focus 的导航项不会被预取（不一次加载全部页面）
    expect(count('/workflows')).toBe(workflowsBefore);

    wrapper.unmount();
  });

  it('主容器具备横向溢出兜底（overflow-x-hidden），壳层无固定宽度冲突', async () => {
    const router = createTestRouter();
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const main = wrapper.find('main#main-content');
    expect(main.classes()).toContain('overflow-x-hidden');
    // 顶部区域使用语义令牌与响应式栅格，无固定 px 宽度
    const header = wrapper.find('header');
    expect(header.classes()).not.toContain('backdrop-blur');
    expect(header.classes()).toContain('bg-surface-0');

    wrapper.unmount();
  });

  it('组件卸载后 window 监听器全部移除', async () => {
    vi.useFakeTimers();
    stubMatchMedia('(min-width: 768px)', false);
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const router = createTestRouter();
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const keydownAdds = () => addSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const keydownRemoves = () => removeSpy.mock.calls.filter(([type]) => type === 'keydown').length;
    const addsBefore = keydownAdds();

    // 打开抽屉：注册 Escape keydown 监听
    await wrapper.find('button[aria-label="打开导航菜单"]').trigger('click');
    await flushPromises();
    expect(keydownAdds()).toBe(addsBefore + 1);

    // Escape 关闭：注销监听
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(keydownRemoves()).toBeGreaterThanOrEqual(keydownAdds());

    // 卸载：不遗留监听器 / 定时器（卸载时多余的 remove 为无害 no-op）
    wrapper.unmount();
    await flushPromises();
    // 推进全部计时：一次性定时器（如过渡结束兜底）自然结束，无残留
    await vi.advanceTimersByTimeAsync(1000);
    expect(vi.getTimerCount()).toBe(0);
    vi.useRealTimers();
  });
});
