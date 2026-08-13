import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 开发态性能标记测试（app/perf.ts）。
 *
 * - markRouteLoad：路由加载耗时记录（dev 态生效）；
 * - installPerfTrace：过渡状态机到达 idle 时记录过渡耗时，stop 后停止；
 * - installLongTaskObserver：环境不支持时安全降级（jsdom 无 PerformanceObserver）；
 * - 真实 router 守卫埋点：afterEach 记录加载耗时。
 */
async function loadPerf() {
  vi.resetModules();
  return await import('@/app/perf');
}

describe('app-perf 路由加载标记', () => {
  it('markRouteLoad 记录最近一次耗时（dev 态）', async () => {
    const perf = await loadPerf();
    perf.markRouteLoad('/chat', 123.456);
    expect(perf.perfState.latestRouteMs).toBe(123.5);
    expect(perf.perfState.routeLoads[0]).toMatchObject({ path: '/chat', ms: 123.5 });

    // 队列上限 10 条
    for (let i = 0; i < 12; i += 1) perf.markRouteLoad(`/p/${i}`, i);
    expect(perf.perfState.routeLoads.length).toBe(10);
  });

  it('installPerfTrace 订阅过渡：idle 时记录耗时；stop 后不再记录', async () => {
    vi.useFakeTimers();
    const perf = await loadPerf();
    const store = await import('@/features/page-transition/transition-store');

    const stop = perf.installPerfTrace();
    perf.beginTransition();
    expect(perf.perfState.latestTransitionMs).toBeNull();

    // 驱动一次完整过渡：leaving →(400ms)→ loading → mounted → entering →(400ms)→ idle
    const el = document.createElement('main');
    document.body.appendChild(el);
    store.registerContentEl(el);
    const token = store.beginNavigation({ direction: 'forward', targetPath: '/x', fromPath: '/' });
    const leave = store.waitForLeave(token);
    await vi.advanceTimersByTimeAsync(400); // 离场兜底
    expect(await leave).toBe(true);
    store.notifyPageMounted(); // 未认领 → 自动就绪 → entering
    await vi.advanceTimersByTimeAsync(400); // 入场结束 → idle
    expect(store.transitionState.phase).toBe('idle');
    expect(perf.perfState.latestTransitionMs).not.toBeNull();
    expect(perf.perfState.transitions.length).toBe(1);

    // stop 后不再跟踪
    stop();
    perf.beginTransition();
    const token2 = store.beginNavigation({
      direction: 'unknown',
      targetPath: '/y',
      fromPath: '/x',
    });
    store.waitForLeave(token2);
    await vi.advanceTimersByTimeAsync(400);
    store.notifyPageMounted();
    await vi.advanceTimersByTimeAsync(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(perf.perfState.transitions.length).toBe(1); // 未新增

    document.body.innerHTML = '';
  });

  it('installLongTaskObserver：jsdom 无 PerformanceObserver 时安全降级', async () => {
    const perf = await loadPerf();
    const stop = perf.installLongTaskObserver();
    expect(typeof stop).toBe('function');
    stop(); // 不抛错
  });
});

describe('app-perf 路由守卫埋点', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('真实 router 导航后记录路由加载耗时（beforeEach→afterEach）', async () => {
    vi.resetModules();
    const perf = await import('@/app/perf');
    const { default: router } = await import('@/router');

    // 未知路径命中轻量 404 页（真实业务页为重型 chunk，避免在单测中全量加载）
    const p = router.push('/no-such-page');
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(perf.perfState.latestRouteMs).not.toBeNull();
    expect(perf.perfState.routeLoads[0]?.path).toBe('/no-such-page');
  });
});
