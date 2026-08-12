import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
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

/** 读取过渡样式源文件，做 CSS 契约断言（防未来回归）；vitest cwd = apps/web */
function readTransitionsCss(): string {
  return readFileSync(resolve(process.cwd(), 'src/assets/transitions.css'), 'utf-8');
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

  it('forceHide 立即清理（路由失败 / 页面卸载路径）且不残留定时器', async () => {
    const { showTransitionOverlay, forceHideTransitionOverlay, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    expect(isTransitioning.value).toBe(true);
    expect(vi.getTimerCount()).toBe(1); // safety timer

    forceHideTransitionOverlay();
    expect(isTransitioning.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('show 携带 meta：状态文本（来源/目标页标题）随遮罩暴露', async () => {
    const { showTransitionOverlay, usePageTransition } = await loadComposable();
    const { transitionMeta } = usePageTransition();

    expect(transitionMeta.value).toEqual({});
    showTransitionOverlay({ fromTitle: '首页', toTitle: '工作流' });
    expect(transitionMeta.value).toEqual({ fromTitle: '首页', toTitle: '工作流' });
  });

  it('hide / forceHide / 安全兜底后 meta 清空，不留脏状态', async () => {
    const {
      showTransitionOverlay,
      hideTransitionOverlay,
      forceHideTransitionOverlay,
      PAGE_TRANSITION,
      usePageTransition,
    } = await loadComposable();
    const { transitionMeta } = usePageTransition();

    showTransitionOverlay({ toTitle: 'Chat' });
    hideTransitionOverlay(0);
    vi.advanceTimersByTime(0);
    expect(transitionMeta.value).toEqual({});

    showTransitionOverlay({ toTitle: 'Chat' });
    forceHideTransitionOverlay();
    expect(transitionMeta.value).toEqual({});

    showTransitionOverlay({ toTitle: 'Chat' });
    vi.advanceTimersByTime(PAGE_TRANSITION.SAFETY_MS);
    expect(transitionMeta.value).toEqual({});
  });

  it('快速连续切换后 hide 完成时不残留任何定时器', async () => {
    const { showTransitionOverlay, hideTransitionOverlay, usePageTransition } =
      await loadComposable();
    const { isTransitioning } = usePageTransition();

    showTransitionOverlay();
    showTransitionOverlay(); // 幂等
    hideTransitionOverlay(50);
    showTransitionOverlay(); // 清除旧 hide
    hideTransitionOverlay(0);
    vi.advanceTimersByTime(0);

    expect(isTransitioning.value).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('getRouteTransition：前进 / 后退 / 同层切换统一使用同一过渡名 page', async () => {
    const { getRouteTransition } = await loadComposable();
    // 模拟不同方向导航的路由对象，返回值必须一致（后退/前进使用相同过渡状态）
    const forward = { path: '/chat', meta: { title: 'Chat' } };
    const backward = { path: '/', meta: { title: '首页' } };
    const detail = { path: '/projects/123', meta: { title: '项目详情' } };

    expect(getRouteTransition(forward)).toBe('page');
    expect(getRouteTransition(backward)).toBe('page');
    expect(getRouteTransition(detail)).toBe('page');
    expect(getRouteTransition()).toBe('page');
  });
});

describe('transitions.css 契约（炫技层安全边界）', () => {
  it('遮罩 pointer-events: none，不阻塞任何用户操作', () => {
    const css = readTransitionsCss();
    expect(css).toMatch(/\.page-transition-overlay\s*{[^}]*pointer-events:\s*none/);
  });

  it('遮罩 z-index 低于项目既有 modal/toast（z-50+），不遮挡弹窗', () => {
    const css = readTransitionsCss();
    const match = css.match(/--page-transition-z,\s*(\d+)/);
    expect(match).not.toBeNull();
    const z = Number(match![1]);
    expect(z).toBeGreaterThan(40); // 高于页面 header
    expect(z).toBeLessThan(50); // 低于最低弹窗 z-50
  });

  it('reduced-motion 完全禁用复杂动画，遮罩不渲染', () => {
    const css = readTransitionsCss();
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*?)\n}/);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/\.page-transition-overlay\s*{[^}]*display:\s*none\s*!important/);
    // 扫描线 / 网格 / 光束 / 环 / 六边形 / 分层全部纳入禁用清单
    for (const sel of [
      '.page-enter-active',
      '.page-leave-active',
      '.page-content-section',
      '.page-transition-scanline',
      '.page-transition-beam',
      '.page-transition-rings',
      '.page-transition-hex',
      '.page-transition-status',
      '.page-transition-progress',
    ]) {
      expect(block![1]).toContain(sel);
    }
  });

  it('新页面入场含 clip-path 展开且保留 opacity 淡入降级路径', () => {
    const css = readTransitionsCss();
    expect(css).toMatch(/\.page-enter-from\s*{[^}]*clip-path:\s*inset\(0\s*46%/);
    expect(css).toMatch(/\.page-enter-from\s*{[^}]*opacity:\s*0/);
    expect(css).toMatch(/\.page-enter-active\s*{[^}]*transition:[\s\S]*?clip-path/);
  });

  it('关键帧只用 transform/opacity，不修改 top/left/width/height 制造动画', () => {
    const css = readTransitionsCss();
    const keyframes = css.match(/@keyframes\s+page-[\w-]+\s*{[\s\S]*?}/g) ?? [];
    expect(keyframes.length).toBeGreaterThan(5);
    for (const kf of keyframes) {
      expect(kf).not.toMatch(/\btop\s*:/);
      expect(kf).not.toMatch(/\bleft\s*:/);
      expect(kf).not.toMatch(/\bwidth\s*:/);
      expect(kf).not.toMatch(/\bheight\s*:/);
    }
  });

  it('分层延迟上限为 60 / 120 / 180ms', () => {
    const css = readTransitionsCss();
    expect(css).toMatch(/\.page-content-section:nth-child\(1\)\s*{[^}]*animation-delay:\s*60ms/);
    expect(css).toMatch(/\.page-content-section:nth-child\(2\)\s*{[^}]*animation-delay:\s*120ms/);
    expect(css).toMatch(/\.page-content-section:nth-child\(3\)\s*{[^}]*animation-delay:\s*180ms/);
  });
});
