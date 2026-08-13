import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { defineComponent, onBeforeUnmount, onMounted, ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 页面过渡系统集成测试：真实 router 接线（router/index.ts 的守卫）+ 布局壳
 * （与 default-layout 一致的 main 注册 / mounted 通知）+ TransitionManager UI。
 *
 * 每个用例 vi.resetModules() + 动态 import，保证模块级单例（store / router）
 * 状态隔离；所有过渡定时器由 fake timers 驱动。
 *
 * 注意：首航 / 刷新（from=START_LOCATION）设计上不显示 loading 层（没有旧
 * 页面被替换）。因此每个用例先导航到稳定页完成首航（idle），再对目标导航
 * 验证 loading/入场/错误行为。
 */
async function loadApp() {
  vi.resetModules();
  const [store, router, manager] = await Promise.all([
    import('@/features/page-transition/transition-store'),
    import('@/router'),
    import('@/features/page-transition/transition-manager.vue'),
  ]);
  return { store, router: router.default, Manager: manager.default };
}

/** 布局壳：与 default-layout 相同的过渡接线（main 注册 + mounted 通知） */
function makeShell(
  registerContentEl: (el: HTMLElement | null) => void,
  notifyPageMounted: () => void,
) {
  return defineComponent({
    name: 'TestShell',
    setup() {
      const el = ref<HTMLElement | null>(null);
      onMounted(() => registerContentEl(el.value));
      onBeforeUnmount(() => registerContentEl(null));
      // 模板需要访问 notifyPageMounted（@vue:mounted 绑定）
      return { el, notifyPageMounted };
    },
    template: `<div class="test-shell">
      <div ref="el" tabindex="-1" class="test-main">
        <RouterView v-slot="{ Component, route }">
          <component :is="Component" :key="route.fullPath" @vue:mounted="notifyPageMounted" />
        </RouterView>
      </div>
      <slot />
    </div>`,
  });
}

type RouterLike = { push(path: string): Promise<unknown> };

/** 导航并推进到 idle（离场 400ms 兜底 + 入场 400ms） */
async function navToIdle(router: RouterLike, path: string) {
  const p = router.push(path);
  await vi.advanceTimersByTimeAsync(400);
  await p;
  await flushPromises();
  await vi.advanceTimersByTimeAsync(400);
}

describe('页面过渡集成', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('路由组件已加载但页面未 ready：目标内容不提前暴露（loading 层遮挡），markPageReady() 后才入场', async () => {
    const { store, router, Manager } = await loadApp();

    let release!: () => void;
    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const GatePage = defineComponent({
      name: 'GatePage',
      setup() {
        const { registerCriticalTask } = usePageReady();
        registerCriticalTask(new Promise<void>((r) => (release = r)));
        return {};
      },
      template: '<section class="gate-page"><h1>Gate 页</h1></section>',
    });
    const BasePage = defineComponent({
      name: 'BasePage',
      template: '<section class="base-page" />',
    });
    router.addRoute({ path: '/pt-base', name: 'pt-base', component: BasePage });
    router.addRoute({
      path: '/pt-gate',
      name: 'pt-gate',
      component: GatePage,
      meta: { title: 'PT 测试' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    // 首航到稳定页完成（idle），再导航到 gate 页（第二次导航）
    await navToIdle(router, '/pt-base');
    expect(store.transitionState.phase).toBe('idle');

    const nav = router.push('/pt-gate');
    await vi.advanceTimersByTimeAsync(400); // 离场完成
    await nav;
    await flushPromises();

    expect(store.transitionState.phase).toBe('loading');
    const layer = document.querySelector('.pt-layer');
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute('aria-busy')).toBe('true');
    expect(layer!.textContent).toContain('PT 测试');
    // 目标组件已挂载（DOM 存在）但被 loading 层遮挡 → 不提前可交互
    expect(document.querySelector('.gate-page')).not.toBeNull();

    // 关键任务完成 → 才入场
    release();
    await flushPromises();
    expect(store.transitionState.phase).toBe('entering');
    const main = document.querySelector('.test-main');
    expect(main!.classList.contains('pt-enter-unknown')).toBe(true);

    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(document.querySelector('.pt-layer')).toBeNull();
    expect(document.querySelector('.gate-page')).not.toBeNull();

    mgr.unmount();
    shell.unmount();
  });

  it('超时安全降级：软超时提示 + 硬超时强制显示，遮罩不永久存在', async () => {
    const { store, router, Manager } = await loadApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const NeverPage = defineComponent({
      name: 'NeverPage',
      setup() {
        usePageReady(); // 认领但不注册任务 → 永不自动 ready
        return {};
      },
      template: '<section class="never-page" />',
    });
    const BasePage = defineComponent({
      name: 'BasePage',
      template: '<section class="base-page" />',
    });
    router.addRoute({ path: '/pt-base', name: 'pt-base', component: BasePage });
    router.addRoute({
      path: '/pt-never',
      name: 'pt-never',
      component: NeverPage,
      meta: { title: '卡住页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    await navToIdle(router, '/pt-base');

    const nav = router.push('/pt-never');
    await vi.advanceTimersByTimeAsync(400);
    await nav;
    await flushPromises();
    expect(store.transitionState.phase).toBe('loading');

    // 软超时：提示「正在准备页面内容」+ 取消按钮
    await vi.advanceTimersByTimeAsync(1200);
    expect(store.transitionState.softElapsed).toBe(true);
    const layer = document.querySelector('.pt-layer');
    expect(layer!.textContent).toContain('正在准备页面内容');
    expect(layer!.querySelector('button')).not.toBeNull();

    // 硬超时：强制就绪 → 入场 → idle，遮罩消失
    await vi.advanceTimersByTimeAsync(5000 - 1200);
    expect(store.transitionState.phase).toBe('entering');
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(document.querySelector('.pt-layer')).toBeNull();
    expect(warn).toHaveBeenCalled();

    mgr.unmount();
    shell.unmount();
  });

  it('快速连续切换：旧导航被取消，只展示最后一次导航目标', async () => {
    const { store, router, Manager } = await loadApp();

    let release!: () => void;
    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const SlowPage = defineComponent({
      name: 'SlowPage',
      setup() {
        const { registerCriticalTask } = usePageReady();
        registerCriticalTask(new Promise<void>((r) => (release = r)));
        return {};
      },
      template: '<section class="slow-page" />',
    });
    const PlainPage = defineComponent({
      name: 'PlainPage',
      template: '<section class="plain-page"><h1>Plain</h1></section>',
    });
    const BasePage = defineComponent({
      name: 'BasePage',
      template: '<section class="base-page" />',
    });
    router.addRoute({ path: '/pt-base', name: 'pt-base', component: BasePage });
    router.addRoute({
      path: '/pt-slow',
      name: 'pt-slow',
      component: SlowPage,
      meta: { title: '慢页' },
    });
    router.addRoute({
      path: '/pt-plain',
      name: 'pt-plain',
      component: PlainPage,
      meta: { title: '快页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    await navToIdle(router, '/pt-base');

    // 导航到慢页（挂起在 loading）
    const nav1 = router.push('/pt-slow');
    await vi.advanceTimersByTimeAsync(400);
    await nav1;
    await flushPromises();
    expect(store.transitionState.phase).toBe('loading');
    expect(document.querySelector('.slow-page')).not.toBeNull();

    // 未 release 前快速导航到快页
    const nav2 = router.push('/pt-plain');
    await vi.advanceTimersByTimeAsync(400);
    await nav2;
    await flushPromises();

    // 旧慢页的 release 不应影响新页面（token 隔离）
    release();
    await flushPromises();
    expect(store.transitionState.phase).toBe('entering');
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(document.querySelector('.plain-page')).not.toBeNull();

    mgr.unmount();
    shell.unmount();
  });

  it('路由组件加载失败：显示错误层（重试/返回），不破坏当前页面', async () => {
    const { store, router, Manager } = await loadApp();

    const PlainPage = defineComponent({
      name: 'PlainPage',
      template: '<section class="plain-page"><h1>Plain</h1></section>',
    });
    router.addRoute({
      path: '/pt-base',
      name: 'pt-base',
      component: PlainPage,
      meta: { title: '稳定页' },
    });
    router.addRoute({
      path: '/pt-broken',
      name: 'pt-broken',
      component: PlainPage,
      meta: { title: '失败页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    // 先进入一个稳定页面（idle）
    await navToIdle(router, '/pt-base');
    expect(store.transitionState.phase).toBe('idle');

    // 模拟一次真实失败导航：开始导航到 /pt-broken（离场完成、组件加载失败）
    const token = store.beginNavigation({
      direction: 'forward',
      targetPath: '/pt-broken',
      fromPath: '/pt-base',
    });
    store.waitForLeave(token);
    await vi.advanceTimersByTimeAsync(400);
    store.failNavigation(new Error('chunk load failed'));
    await flushPromises();

    const errorLayer = document.querySelector('.pt-layer--error');
    expect(errorLayer).not.toBeNull();
    expect(errorLayer!.textContent).toContain('页面加载失败');
    expect(errorLayer!.textContent).toContain('chunk load failed');
    const buttons = errorLayer!.querySelectorAll('button');
    expect(buttons.length).toBe(2); // 重试 + 返回
    // 当前稳定页面仍在 DOM（未被破坏）
    expect(document.querySelector('.plain-page')).not.toBeNull();

    // 重试按钮触发重试回调（真实 router.replace 重新导航到失败目标）
    (buttons[0] as HTMLButtonElement).click();
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(store.transitionState.targetPath).toBe('/pt-broken');

    mgr.unmount();
    shell.unmount();
  });

  it('Escape 取消尚未完成的过渡并回退，不遗留定时器', async () => {
    const { store, router, Manager } = await loadApp();

    const { usePageReady } = await import('@/features/page-transition/use-page-ready');
    const NeverPage = defineComponent({
      name: 'NeverPage',
      setup() {
        usePageReady();
        return {};
      },
      template: '<section class="never-page" />',
    });
    const BasePage = defineComponent({
      name: 'BasePage',
      template: '<section class="base-page" />',
    });
    router.addRoute({ path: '/pt-base', name: 'pt-base', component: BasePage });
    router.addRoute({
      path: '/pt-escape',
      name: 'pt-escape',
      component: NeverPage,
      meta: { title: 'Escape 页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    await navToIdle(router, '/pt-base');

    const nav = router.push('/pt-escape');
    await vi.advanceTimersByTimeAsync(400);
    await nav;
    await flushPromises();
    expect(store.transitionState.phase).toBe('loading');
    expect(document.querySelector('.pt-layer')).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(store.transitionState.phase).toBe('idle'); // 立即取消 loading
    expect(document.querySelector('.pt-layer')).toBeNull();

    // Escape 触发回退导航（若有），其过渡自然完成：推进足够时间后必须
    // 回到 idle，遮罩不永久存在、定时器不遗留
    await vi.advanceTimersByTimeAsync(2000);
    await flushPromises();
    expect(store.transitionState.phase).toBe('idle');
    expect(document.querySelector('.pt-layer')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    mgr.unmount();
    shell.unmount();
  });

  it('过渡完成后焦点落到主内容（不抢夺表单焦点）', async () => {
    const { store, router, Manager } = await loadApp();

    const PlainPage = defineComponent({
      name: 'PlainPage',
      template: '<section class="plain-page"><h1>Plain</h1></section>',
    });
    router.addRoute({
      path: '/pt-focus',
      name: 'pt-focus',
      component: PlainPage,
      meta: { title: '焦点页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    await navToIdle(router, '/pt-focus');
    expect(store.transitionState.phase).toBe('idle');
    expect(document.activeElement).toBe(document.querySelector('.test-main'));

    mgr.unmount();
    shell.unmount();
  });

  it('prefers-reduced-motion：不使用位移动画，直接切换', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi
        .fn()
        .mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }),
    );
    const { store, router, Manager } = await loadApp();

    const BasePage = defineComponent({
      name: 'BasePage',
      template: '<section class="base-page" />',
    });
    const PlainPage = defineComponent({
      name: 'PlainPage',
      template: '<section class="plain-page"><h1>Plain</h1></section>',
    });
    router.addRoute({ path: '/pt-base', name: 'pt-base', component: BasePage });
    router.addRoute({
      path: '/pt-reduced',
      name: 'pt-reduced',
      component: PlainPage,
      meta: { title: '减动效页' },
    });

    const Shell = makeShell(store.registerContentEl, () => store.notifyPageMounted());
    const shell = mount(Shell, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    const mgr = mount(Manager, { attachTo: document.body, global: { plugins: [router] } });

    // 首航（无动画）到 base
    await navToIdle(router, '/pt-base');
    // 第二次导航：离场立即放行（无动画），入场不加位移 class
    const nav = router.push('/pt-reduced');
    await vi.advanceTimersByTimeAsync(0);
    await nav;
    await flushPromises();

    const main = document.querySelector('.test-main');
    for (const cls of [
      'pt-leave-forward',
      'pt-leave-backward',
      'pt-enter-forward',
      'pt-enter-backward',
      'pt-enter-unknown',
    ]) {
      expect(main!.classList.contains(cls)).toBe(false);
    }
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');

    mgr.unmount();
    shell.unmount();
  });
});
