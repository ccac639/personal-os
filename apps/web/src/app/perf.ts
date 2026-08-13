/**
 * 开发态性能标记（仅 app 壳层，轻量无侵入）。
 *
 * 边界（见任务约束）：
 * - 仅 `import.meta.env.DEV` 生效，可用 `VITE_PERF_MARKS=off` 关闭；
 * - 不发送任何网络数据、不持久化任何内容（全部内存态）；
 * - 路由加载耗时：router beforeEach → afterEach（router/index.ts 埋点）；
 * - 过渡耗时：beginTransition → transitionState 到达 idle（watch 订阅）；
 * - 长任务：PerformanceObserver('longtask') 计数提示（>50ms）；
 * - 所有订阅 / 观察器都返回 stop()，由宿主组件卸载时调用，不遗留监听器。
 */
import { reactive, watch, type WatchStopHandle } from 'vue';

import { transitionState } from '@/features/page-transition/transition-store';

/** 仅开发态启用；生产构建时全部走 no-op，零开销、零产物残留。 */
export const perfEnabled = import.meta.env.DEV && import.meta.env.VITE_PERF_MARKS !== 'off';

export interface RouteLoadMark {
  path: string;
  ms: number;
  at: number;
}

export interface TransitionMark {
  ms: number;
  at: number;
}

const MAX_MARKS = 10;

export const perfState = reactive<{
  routeLoads: RouteLoadMark[];
  transitions: TransitionMark[];
  longTasks: number;
  latestRouteMs: number | null;
  latestTransitionMs: number | null;
}>({
  routeLoads: [],
  transitions: [],
  longTasks: 0,
  latestRouteMs: null,
  latestTransitionMs: null,
});

function round(ms: number): number {
  return Math.round(ms * 10) / 10;
}

/** 路由加载完成（router.afterEach 调用）。 */
export function markRouteLoad(path: string, ms: number): void {
  if (!perfEnabled) return;
  const mark: RouteLoadMark = { path, ms: round(ms), at: performance.now() };
  perfState.routeLoads.unshift(mark);
  if (perfState.routeLoads.length > MAX_MARKS) perfState.routeLoads.length = MAX_MARKS;
  perfState.latestRouteMs = mark.ms;
}

/** 导航开始（router.beforeEach 调用）：记录过渡计时起点。 */
export function beginTransition(): void {
  if (!perfEnabled) return;
  transitionStartAt = performance.now();
  transitionActive = true;
}

let transitionStartAt = 0;
let transitionActive = false;
let stopTrace: WatchStopHandle | null = null;

/**
 * 订阅过渡状态机：进入 idle 时记录一次过渡耗时。
 * 返回停止函数（宿主组件卸载时调用）。幂等。
 */
export function installPerfTrace(): () => void {
  if (!perfEnabled) return () => undefined;
  if (stopTrace) return stopTrace;
  let lastPhase = transitionState.phase;
  stopTrace = watch(
    () => transitionState.phase,
    (phase) => {
      if (phase === 'idle' && lastPhase !== 'idle' && transitionActive) {
        const mark: TransitionMark = {
          ms: round(performance.now() - transitionStartAt),
          at: performance.now(),
        };
        perfState.transitions.unshift(mark);
        if (perfState.transitions.length > MAX_MARKS) perfState.transitions.length = MAX_MARKS;
        perfState.latestTransitionMs = mark.ms;
        transitionActive = false;
      }
      lastPhase = phase;
    },
  );
  return stopTrace;
}

/** 停止过渡耗时订阅。 */
export function stopPerfTrace(): void {
  stopTrace?.();
  stopTrace = null;
}

let longTaskObserver: PerformanceObserver | null = null;

/**
 * 订阅长任务（>50ms 主线程阻塞）计数。返回停止函数。
 * 环境不支持 PerformanceObserver 时安全降级（no-op）。
 */
export function installLongTaskObserver(): () => void {
  if (!perfEnabled) return () => undefined;
  if (longTaskObserver) return () => undefined;
  if (typeof PerformanceObserver === 'undefined') return () => undefined;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 50) perfState.longTasks += 1;
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] });
  } catch {
    longTaskObserver = null;
  }
  return () => {
    try {
      longTaskObserver?.disconnect();
    } catch {
      /* 忽略断开失败 */
    }
    longTaskObserver = null;
  };
}
