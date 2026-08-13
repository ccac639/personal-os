import { flushPromises, mount } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 页面就绪协议单测（usePageReady）。
 *
 * 通过真实组件挂载验证：认领、多任务门控、卸载释放、token 隔离。
 * 状态机使用模块级单例，每个用例前 vi.resetModules() 重新加载。
 */
async function loadStore() {
  vi.resetModules();
  return await import('@/features/page-transition/transition-store');
}

/** 测试页面：setup 调用 usePageReady，注册可手动释放的关键任务 */
describe('usePageReady 页面就绪协议', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('组件 setup 调用 usePageReady 即认领当前导航', async () => {
    const store = await loadStore();
    const token = store.beginNavigation({ direction: 'unknown', targetPath: '/x', fromPath: '/' });
    store.waitForLeave(token);
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.claimed).toBe(false);

    // 挂载接入协议的页面
    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const Page = defineComponent({
      setup() {
        usePageReady();
        return {};
      },
      template: '<div />',
    });
    mount(Page, { attachTo: document.body });
    await flushPromises();

    expect(store.transitionState.claimed).toBe(true);
  });

  it('注册多个关键任务：全部完成后才进入入场', async () => {
    const store = await loadStore();
    const token = store.beginNavigation({ direction: 'unknown', targetPath: '/x', fromPath: '/' });
    store.waitForLeave(token);
    await vi.advanceTimersByTimeAsync(400);

    let releaseA!: () => void;
    let releaseB!: () => void;
    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const Page = defineComponent({
      setup() {
        const { registerCriticalTask } = usePageReady();
        registerCriticalTask(new Promise<void>((r) => (releaseA = r)));
        registerCriticalTask(new Promise<void>((r) => (releaseB = r)));
        return {};
      },
      template: '<div />',
    });
    mount(Page, { attachTo: document.body });
    await flushPromises();

    releaseA();
    await flushPromises();
    expect(store.transitionState.phase).toBe('loading'); // A 完成，B 未完成

    releaseB();
    await flushPromises();
    expect(store.transitionState.phase).toBe('entering'); // 全部完成
  });

  it('页面卸载（路由离开）自动释放任务，防旧页面回调污染新页面', async () => {
    const store = await loadStore();
    const tokenA = store.beginNavigation({ direction: 'unknown', targetPath: '/a', fromPath: '/' });
    store.waitForLeave(tokenA);
    await vi.advanceTimersByTimeAsync(400);

    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const PageA = defineComponent({
      setup() {
        const { registerCriticalTask } = usePageReady();
        // 永不 resolve 的任务：仅当页面卸载时由 disposePage 释放
        registerCriticalTask(new Promise<void>(() => {}));
        return {};
      },
      template: '<div />',
    });
    const wrapper = mount(PageA, { attachTo: document.body });
    await flushPromises();
    expect(store.transitionState.taskCount).toBe(1);

    // 页面卸载（模拟路由切换离开）
    wrapper.unmount();
    await flushPromises();
    expect(store.transitionState.taskCount).toBe(0);
    // 卸载触发 disposePage → 若仍等待中则自动就绪（防卡死）
    expect(store.transitionState.phase).not.toBe('loading');
  });

  it('旧导航 token 的 ready 回调不影响新导航', async () => {
    const store = await loadStore();
    const tokenA = store.beginNavigation({ direction: 'unknown', targetPath: '/a', fromPath: '/' });
    store.waitForLeave(tokenA);
    await vi.advanceTimersByTimeAsync(400);

    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const controllerA = { current: null as null | ReturnType<typeof usePageReady> };
    const PageA = defineComponent({
      setup() {
        controllerA.current = usePageReady();
        return {};
      },
      template: '<div />',
    });
    const wrapper = mount(PageA, { attachTo: document.body });
    await flushPromises();

    // 新导航接管（页面 A 被卸载）
    wrapper.unmount();
    const tokenB = store.beginNavigation({
      direction: 'backward',
      targetPath: '/b',
      fromPath: '/a',
    });
    store.waitForLeave(tokenB);
    await vi.advanceTimersByTimeAsync(400);

    // 旧页面的 controller 调用（已 dispose）必须被忽略
    controllerA.current!.markPageReady();
    expect(store.transitionState.phase).toBe('loading');
    expect(store.transitionState.token).toBe(tokenB);
  });

  it('markPageReady() 立即就绪（不等待未注册任务）', async () => {
    const store = await loadStore();
    const token = store.beginNavigation({ direction: 'unknown', targetPath: '/x', fromPath: '/' });
    store.waitForLeave(token);
    await vi.advanceTimersByTimeAsync(400);

    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const Page = defineComponent({
      setup() {
        const { markPageReady } = usePageReady();
        // 数据就绪后手动调用
        markPageReady();
        return {};
      },
      template: '<div />',
    });
    mount(Page, { attachTo: document.body });
    await flushPromises();
    expect(store.transitionState.phase).toBe('entering');
  });
});
