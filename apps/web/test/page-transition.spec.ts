import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 页面过渡层状态管理器单测。
 *
 * 模块级单例状态跨用例共享，因此每个用例前 vi.resetModules() + 动态 import，
 * 保证状态隔离；遮罩生命周期全部由定时器驱动，统一使用 fake timers。
 */
async function loadComposable() {
  vi.resetModules();
  return await import('@/composables/use-page-transition');
}

describe('use-page-transition 过渡层状态', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('show 后进入过渡中状态，hide(0) 立即销毁', async () => {
    const { showTransitionOverlay, hideTransitionOverlay, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    expect(isTransitioning.value).toBe(true);

    hideTransitionOverlay(0);
    vi.advanceTimersByTime(0);
    expect(isTransitioning.value).toBe(false);
  });

  it('hide 支持延迟隐藏（留出扫描线收尾窗口）', async () => {
    const { showTransitionOverlay, hideTransitionOverlay, PAGE_TRANSITION, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    hideTransitionOverlay(PAGE_TRANSITION.HIDE_DELAY_MS);

    vi.advanceTimersByTime(PAGE_TRANSITION.HIDE_DELAY_MS - 1);
    expect(isTransitioning.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isTransitioning.value).toBe(false);
  });

  it('安全计时兜底：异常路径（无 hide 调用）下遮罩最长存活 SAFETY_MS', async () => {
    const { showTransitionOverlay, PAGE_TRANSITION, usePageTransition } = await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    vi.advanceTimersByTime(PAGE_TRANSITION.SAFETY_MS - 1);
    expect(isTransitioning.value).toBe(true);

    vi.advanceTimersByTime(1);
    expect(isTransitioning.value).toBe(false);
  });

  it('快速连续导航：show 幂等并清除旧隐藏计时，只保留最后一次导航结果', async () => {
    const { showTransitionOverlay, hideTransitionOverlay, PAGE_TRANSITION, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    // 第一次导航：旧页离场完成 → show，入场完成 → 延迟隐藏
    showTransitionOverlay();
    hideTransitionOverlay(PAGE_TRANSITION.HIDE_DELAY_MS);

    // 隐藏触发前发生第二次导航 → 再次 show（若旧 hide 未清除，遮罩会被错误销毁）
    vi.advanceTimersByTime(PAGE_TRANSITION.HIDE_DELAY_MS - 1);
    showTransitionOverlay();
    vi.advanceTimersByTime(1);
    expect(isTransitioning.value).toBe(true);

    // 第二次导航入场完成 → 隐藏
    hideTransitionOverlay(0);
    vi.advanceTimersByTime(0);
    expect(isTransitioning.value).toBe(false);
  });

  it('forceHide 立即清理（路由失败 / 页面卸载路径）', async () => {
    const { showTransitionOverlay, forceHideTransitionOverlay, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    expect(isTransitioning.value).toBe(true);

    forceHideTransitionOverlay();
    expect(isTransitioning.value).toBe(false);
  });

  it('getRouteTransition 默认返回统一过渡名 page', async () => {
    const { getRouteTransition } = await loadComposable();
    expect(getRouteTransition()).toBe('page');
  });
});
