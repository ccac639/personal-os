import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 页面过渡状态机单测（features/page-transition/transition-store.ts）。
 *
 * 模块级单例状态跨用例共享，因此每个用例前 vi.resetModules() + 动态 import，
 * 保证状态隔离；过渡全部由定时器驱动，统一使用 fake timers。
 */
async function loadStore() {
  vi.resetModules();
  const store = await import('@/features/page-transition/transition-store');
  const directions = await import('@/features/page-transition/route-transition');
  return { ...store, ...directions };
}

/** 读取过渡样式源文件，做 CSS 契约断言（防未来回归）；vitest cwd = apps/web */
function readTransitionsCss(): string {
  return readFileSync(resolve(process.cwd(), 'src/assets/transitions.css'), 'utf-8');
}

function makeContentEl(): HTMLElement {
  const el = document.createElement('main');
  document.body.appendChild(el);
  return el;
}

/** 构造最小导航对象（getDirection 只读 path/name/matched/fullPath） */
function route(path: string, name?: string) {
  return {
    path,
    name,
    fullPath: path,
    matched: [{ path }],
    meta: {},
  } as never;
}

describe('transition-store 状态机', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
  });

  it('导航流程：leaving → loading → entering → idle，动画 class 正确应用并清理', async () => {
    const store = await loadStore();
    const el = makeContentEl();
    store.registerContentEl(el);

    const token = store.beginNavigation({
      direction: 'forward',
      toTitle: '工作流',
      fromTitle: '首页',
      targetPath: '/workflows',
      fromPath: '/',
    });
    expect(store.transitionState.phase).toBe('leaving');
    expect(el.classList.contains('pt-leave-forward')).toBe(true);

    const leave = store.waitForLeave(token);
    vi.advanceTimersByTime(400);
    expect(await leave).toBe(true);
    expect(store.transitionState.phase).toBe('loading');
    expect(el.classList.contains('pt-leave-forward')).toBe(false);
    expect(store.transitionState.toTitle).toBe('工作流');

    store.notifyPageMounted(); // 未认领 → 自动就绪
    expect(store.transitionState.phase).toBe('entering');
    expect(el.classList.contains('pt-enter-forward')).toBe(true);

    vi.advanceTimersByTime(400);
    expect(store.transitionState.phase).toBe('idle');
    expect(el.classList.contains('pt-enter-forward')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('markPageReady() 立即进入入场；多任务只有全部完成才进入入场', async () => {
    const store = await loadStore();
    const el = makeContentEl();
    store.registerContentEl(el);

    const token = store.beginNavigation({
      direction: 'unknown',
      targetPath: '/chat',
      fromPath: '/',
    });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400);
    expect(store.transitionState.phase).toBe('loading');

    // 认领 + 注册两个任务
    store.claimPage(token);
    let resolve1!: () => void;
    let resolve2!: () => void;
    store.registerTask(token, new Promise<void>((r) => (resolve1 = r)));
    store.registerTask(token, new Promise<void>((r) => (resolve2 = r)));

    resolve1();
    await Promise.resolve();
    expect(store.transitionState.phase).toBe('loading'); // 任务 1 完成，任务 2 未完成

    resolve2();
    await Promise.resolve();
    expect(store.transitionState.phase).toBe('entering'); // 全部完成 → 入场
    expect(store.transitionState.taskCount).toBe(0);
  });

  it('任务失败视为完成（记录警告），不阻塞页面', async () => {
    const store = await loadStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const token = store.beginNavigation({ direction: 'unknown', targetPath: '/x', fromPath: '/' });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400);

    store.claimPage(token);
    store.registerTask(token, Promise.reject(new Error('boom')));
    await Promise.resolve();
    expect(store.transitionState.phase).toBe('entering');
    expect(warn).toHaveBeenCalled();
  });

  it('未接入就绪协议的旧页面：mounted 后自动就绪（兼容降级）', async () => {
    const store = await loadStore();
    const token = store.beginNavigation({ direction: 'unknown', targetPath: '/x', fromPath: '/' });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400);
    expect(store.transitionState.phase).toBe('loading');

    store.notifyPageMounted();
    expect(store.transitionState.phase).toBe('entering');
  });

  it('快速连续切换：新导航取消旧离场，旧 ready 回调不影响新页面', async () => {
    const store = await loadStore();
    const el = makeContentEl();
    store.registerContentEl(el);

    // 导航 A → 工作流
    const tokenA = store.beginNavigation({
      direction: 'forward',
      targetPath: '/workflows',
      fromPath: '/',
    });
    const leaveA = store.waitForLeave(tokenA);

    // 导航 B 接管（用户快速点 Chat）
    const tokenB = store.beginNavigation({
      direction: 'backward',
      targetPath: '/chat',
      fromPath: '/workflows',
    });
    expect(await leaveA).toBe(false); // A 被取消

    // 旧 token 的回调全部被忽略
    store.markPageReady(tokenA);
    store.registerTask(tokenA, Promise.resolve());
    await Promise.resolve();
    expect(store.transitionState.phase).toBe('leaving');

    const leaveB = store.waitForLeave(tokenB);
    vi.advanceTimersByTime(400);
    expect(await leaveB).toBe(true);

    // B 完成后，旧的 markPageReady(tokenA) 不能把 B 变成 entering 的错状态
    store.notifyPageMounted();
    expect(store.transitionState.phase).toBe('entering');
    expect(store.transitionState.direction).toBe('backward');
    expect(el.classList.contains('pt-enter-backward')).toBe(true);
  });

  it('query-only 轻量过渡：无离场阶段，直接等待就绪，入场用轻量 class', async () => {
    const store = await loadStore();
    const el = makeContentEl();
    store.registerContentEl(el);

    const token = store.beginNavigation({
      direction: 'query',
      targetPath: '/?tab=2',
      fromPath: '/',
    });
    expect(store.transitionState.phase).toBe('loading'); // 跳过 leaving

    const leave = store.waitForLeave(token); // 不应挂起
    expect(await leave).toBe(true);
    store.notifyPageMounted();
    expect(store.transitionState.phase).toBe('entering');
    expect(el.classList.contains('pt-enter-query')).toBe(true);
  });

  it('软超时后 softElapsed=true（loading 层提示 + 显示取消）；硬超时强制就绪并降级', async () => {
    const store = await loadStore();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const token = store.beginNavigation({
      direction: 'unknown',
      targetPath: '/slow',
      fromPath: '/',
    });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400);
    expect(store.transitionState.softElapsed).toBe(false);

    vi.advanceTimersByTime(1200 - 1);
    expect(store.transitionState.softElapsed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(store.transitionState.softElapsed).toBe(true);
    expect(store.transitionState.phase).toBe('loading'); // 软超时不强制就绪

    vi.advanceTimersByTime(5000 - 1200);
    expect(store.transitionState.phase).toBe('entering'); // 硬超时降级
    expect(warn).toHaveBeenCalled();
  });

  it('硬超时后遮罩/过渡不会永久存在：进入 idle 且无残留定时器', async () => {
    const store = await loadStore();
    const token = store.beginNavigation({
      direction: 'unknown',
      targetPath: '/stuck',
      fromPath: '/',
    });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400); // loading
    vi.advanceTimersByTime(5000); // 硬超时 → entering
    expect(store.transitionState.phase).toBe('entering');
    vi.advanceTimersByTime(400); // 入场结束
    expect(store.transitionState.phase).toBe('idle');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('路由组件加载失败：进入 error 层，提供重试/返回回调；当前页面保持可见', async () => {
    const store = await loadStore();
    const retry = vi.fn();
    const goBack = vi.fn();
    store.setNavCallbacks({ retry, goBack });

    const el = makeContentEl();
    store.registerContentEl(el);
    const token = store.beginNavigation({
      direction: 'forward',
      targetPath: '/broken',
      fromPath: '/',
    });
    store.waitForLeave(token);
    vi.advanceTimersByTime(400);
    expect(el.classList.contains('pt-leave-forward')).toBe(false); // 离场 class 已清理

    store.failNavigation(new Error('chunk load failed'));
    expect(store.transitionState.phase).toBe('error');
    expect(store.transitionState.errorMessage).toBe('chunk load failed');
    expect(el.classList.contains('pt-leave-forward')).toBe(false); // 当前页面恢复可见

    store.retryNavigation();
    expect(retry).toHaveBeenCalled();
    store.goBack();
    expect(goBack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Escape：leaving 阶段取消导航（URL 未变），loading 阶段回退上一页', async () => {
    const store = await loadStore();
    const goBack = vi.fn();
    store.setNavCallbacks({ retry: vi.fn(), goBack });

    // leaving 阶段取消
    const token = store.beginNavigation({ direction: 'forward', targetPath: '/x', fromPath: '/' });
    const leave = store.waitForLeave(token);
    store.handleEscape();
    expect(await leave).toBe(false);
    expect(store.transitionState.phase).toBe('idle');
    expect(goBack).not.toHaveBeenCalled();

    // loading 阶段取消 → 回退
    store.beginNavigation({ direction: 'forward', targetPath: '/y', fromPath: '/' });
    store.waitForLeave(store.getCurrentToken());
    vi.advanceTimersByTime(400);
    expect(store.transitionState.phase).toBe('loading');
    store.handleEscape();
    expect(store.transitionState.phase).toBe('idle');
    expect(goBack).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('prefers-reduced-motion：跳过离场等待与位移动画，直接放行', async () => {
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
    const store = await loadStore();
    const el = makeContentEl();
    store.registerContentEl(el);

    const token = store.beginNavigation({ direction: 'forward', targetPath: '/x', fromPath: '/' });
    expect(store.transitionState.phase).toBe('leaving');
    expect(el.classList.contains('pt-leave-forward')).toBe(false); // 无位移 class

    const leave = store.waitForLeave(token);
    expect(await leave).toBe(true); // 立即放行，不等 400ms
    expect(store.transitionState.phase).toBe('loading');
  });
});

describe('route-transition 方向判定', () => {
  it('同层前进为 forward，返回为 backward', async () => {
    const { getDirection } = await loadStore();
    expect(getDirection(route('/'), route('/chat'))).toBe('forward');
    expect(getDirection(route('/chat'), route('/'))).toBe('backward');
    expect(getDirection(route('/projects'), route('/achievements'))).toBe('forward');
    expect(getDirection(route('/admin'), route('/settings'))).toBe('forward');
  });

  it('进入更深子页为 forward，返回父级为 backward', async () => {
    const { getDirection } = await loadStore();
    expect(getDirection(route('/projects'), route('/projects/123'))).toBe('forward');
    expect(getDirection(route('/projects/123'), route('/projects'))).toBe('backward');
    expect(getDirection(route('/chat'), route('/chat/agents', 'chat-agents'))).toBe('forward');
  });

  it('无法判定方向（同层不同参数/未知路由）→ unknown', async () => {
    const { getDirection } = await loadStore();
    expect(getDirection(route('/projects/a'), route('/projects/b'))).toBe('unknown');
    expect(getDirection(route('/agents'), route('/weird'))).toBe('unknown');
  });

  it('同一 path 仅 query 变化 → query（轻量过渡）', async () => {
    const { getDirection } = await loadStore();
    const from = {
      path: '/projects',
      fullPath: '/projects',
      name: undefined,
      matched: [],
      meta: {},
    } as never;
    const to = {
      path: '/projects',
      fullPath: '/projects?tab=done',
      name: undefined,
      matched: [],
      meta: {},
    } as never;
    expect(getDirection(from, to)).toBe('query');
  });

  it('首航判定：START_LOCATION（matched 为空）为 true', async () => {
    const { isInitialNavigation } = await loadStore();
    expect(isInitialNavigation({ matched: [] } as never)).toBe(true);
    expect(isInitialNavigation({ matched: [{ path: '/' }] } as never)).toBe(false);
  });
});

describe('transitions.css 契约（克制 · 方向感 · 无障碍）', () => {
  it('离场/入场动画时长控制在 180-320ms（query 轻量过渡单独更短）', () => {
    const css = readTransitionsCss();
    // 只统计 pt-leave-* / pt-enter-* 内容动画（排除 pt-layer-in / pt-spin）
    const durations = [...css.matchAll(/animation:\s*pt-(?:leave|enter)-[\w-]+\s+(\d+)ms/g)].map(
      (m) => Number(m[1]),
    );
    expect(durations.length).toBeGreaterThanOrEqual(7);
    const queryMs = Number(
      css.match(/\.pt-enter-query\s*{[^}]*animation:\s*pt-enter-fade\s+(\d+)ms/)?.[1],
    );
    expect(queryMs).toBeGreaterThanOrEqual(100);
    expect(queryMs).toBeLessThan(180);
    for (const d of durations) {
      if (d === queryMs) continue;
      expect(d).toBeGreaterThanOrEqual(180);
      expect(d).toBeLessThanOrEqual(320);
    }
  });

  it('四种方向均有对应 class：forward / backward / unknown / query', () => {
    const css = readTransitionsCss();
    for (const cls of [
      'pt-leave-forward',
      'pt-leave-backward',
      'pt-leave-unknown',
      'pt-enter-forward',
      'pt-enter-backward',
      'pt-enter-unknown',
      'pt-enter-query',
    ]) {
      expect(css).toContain(`.${cls}`);
    }
  });

  it('过渡层 z-index 低于弹窗（z-50+），背景使用主题变量（亮/暗自适应）', () => {
    const css = readTransitionsCss();
    const layer = css.match(/\.pt-layer\s*{[^}]*}/)?.[0] ?? '';
    expect(layer).toMatch(/z-index:\s*45/);
    expect(layer).toMatch(/var\(--color-page/);
    expect(layer).not.toMatch(/pointer-events:\s*none/); // 过渡层需可交互（取消/重试按钮）
  });

  it('关键帧只用 transform/opacity，不修改 top/left/width/height 制造动画', () => {
    const css = readTransitionsCss();
    const keyframes = css.match(/@keyframes\s+pt-[\w-]+\s*{[\s\S]*?}/g) ?? [];
    expect(keyframes.length).toBeGreaterThanOrEqual(7);
    for (const kf of keyframes) {
      expect(kf).not.toMatch(/\btop\s*:/);
      expect(kf).not.toMatch(/\bleft\s*:/);
      expect(kf).not.toMatch(/\bwidth\s*:/);
      expect(kf).not.toMatch(/\bheight\s*:/);
    }
  });

  it('reduced-motion：禁止位移/缩放/持续 loading 动画', () => {
    const css = readTransitionsCss();
    const block = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*{([\s\S]*?)\n}/);
    expect(block).not.toBeNull();
    for (const sel of [
      '.pt-leave-forward',
      '.pt-leave-backward',
      '.pt-leave-unknown',
      '.pt-enter-forward',
      '.pt-enter-backward',
      '.pt-enter-unknown',
      '.pt-enter-query',
      '.page-content-section',
      '.pt-spinner',
    ]) {
      expect(block![1]).toContain(sel);
    }
    expect(block![1]).toMatch(/animation:\s*none\s*!important/);
  });

  it('旧页面标记 page-content-section 保留轻量淡入（兼容业务页面）', () => {
    const css = readTransitionsCss();
    expect(css).toContain('.page-content-section');
    expect(css).toMatch(/\.page-content-section\s*{[^}]*animation:\s*pt-section-fade\s+\d+ms/);
  });
});
