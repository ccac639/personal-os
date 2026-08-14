/**
 * Sub2API 导航与路由测试：
 * - 路由 /sub2api 注册且可直接访问 / 刷新保持；
 * - 桌面导航「Sub2API」位于「已完成」旁边；
 * - 移动端抽屉导航同样包含「Sub2API」。
 */
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DefaultLayout from '@/layouts/default-layout.vue';
import { routes } from '@/router/routes';

const TestPage = { name: 'TestPage', template: '<div class="test-page" />' };

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

describe('路由注册', () => {
  it('/sub2api 路由存在且可直接访问（直达 + 刷新等价）', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes });
    await router.push('/sub2api');
    await router.isReady();
    expect(router.currentRoute.value.name).toBe('sub2api');
    expect(router.currentRoute.value.meta.title).toBe('Sub2API 控制台');

    // 再次 push（模拟刷新后重新进入）仍可解析
    await router.replace('/sub2api?tab=logs');
    expect(router.currentRoute.value.name).toBe('sub2api');
    expect(router.currentRoute.value.query.tab).toBe('logs');
  });
});

describe('桌面导航', () => {
  it('导航项包含 Sub2API，且位于「已完成」旁边', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: TestPage },
        { path: '/achievements', component: TestPage },
        { path: '/sub2api', component: TestPage },
      ],
    });
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const nav = wrapper.find('nav[aria-label="主导航"]');
    const links = nav.findAll('a');
    const labels = links.map((link) => link.text().trim());
    expect(labels).toContain('Sub2API');
    expect(labels).toContain('已完成');

    // DOM 顺序：已完成 → Sub2API 相邻
    const doneIndex = labels.indexOf('已完成');
    const sub2apiIndex = labels.indexOf('Sub2API');
    expect(sub2apiIndex).toBe(doneIndex + 1);

    wrapper.unmount();
  });

  it('导航到 /sub2api 时该项高亮（aria-current=page）', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: TestPage },
        { path: '/sub2api', component: TestPage },
      ],
    });
    await router.push('/sub2api');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const active = wrapper.find('nav[aria-label="主导航"] a[aria-current="page"]');
    expect(active.exists()).toBe(true);
    expect(active.text()).toContain('Sub2API');
    wrapper.unmount();
  });
});

describe('移动端抽屉导航', () => {
  it('窄屏抽屉包含 Sub2API 入口', async () => {
    stubMatchMedia('(min-width: 768px)', false);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: TestPage },
        { path: '/sub2api', component: TestPage },
      ],
    });
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    await wrapper.find('button[aria-label="打开导航菜单"]').trigger('click');
    await flushPromises();

    // AppDrawer 使用 Teleport 渲染到 body
    const drawer = document.body.querySelector('.app-drawer-nav');
    expect(drawer).not.toBeNull();
    const labels = Array.from(drawer!.querySelectorAll('a')).map((link) =>
      link.textContent?.trim(),
    );
    expect(labels).toContain('Sub2API');
    wrapper.unmount();
  });
});
