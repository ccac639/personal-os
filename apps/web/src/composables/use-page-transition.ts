/**
 * 全局页面过渡遮罩状态（模块级单例）
 *
 * 设计要点：
 * - 状态放在模块作用域而不是组件内部，使 router 守卫 / router.onError 等
 *   非组件代码也能显示与强制清理遮罩；
 * - 所有定时器集中管理：show 时先清除旧的 hide / safety 定时器，保证快速
 *   连续切换时不会叠出多个遮罩实例；
 * - SAFETY_MS 兜底：任何异常路径（路由失败 / 定时器未恢复）下遮罩都会被
 *   强制销毁，绝不长期遮挡页面；
 * - 遮罩本身 pointer-events: none，不阻塞任何用户操作；
 * - meta 承载过渡期间的状态文本（来源页 / 目标页标题），随遮罩一起创建与清理；
 * - 遮罩是独立组件（PageTransitionOverlay.vue），状态变化不波及路由内容子树。
 */
import { readonly, ref } from 'vue';

/** 过渡节奏（与 assets/transitions.css 中的时长保持一致） */
export const PAGE_TRANSITION = {
  /** 扫描线动画时长（@keyframes page-scanline） */
  SCANLINE_MS: 520,
  /** 兜底上限：任何情况下遮罩最长存活时间 */
  SAFETY_MS: 1500,
} as const;

export interface TransitionMeta {
  /** 来源页标题（首次加载 / 无 meta.title 时为空） */
  fromTitle?: string;
  /** 目标页标题（路由无 meta.title 时为空） */
  toTitle?: string;
}

const isTransitioning = ref(false);
const transitionMeta = ref<TransitionMeta>({});

let hideTimer: ReturnType<typeof setTimeout> | undefined;
let safetyTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * 过渡完全结束的回调（isTransitioning 变回 false 时触发）。
 * 供路由导航串行化使用：过渡期间挂起的新导航在此放行（见 router/index.ts）。
 */
let transitionEndHandler: (() => void) | undefined;

export function setTransitionEndHandler(fn: (() => void) | undefined): void {
  transitionEndHandler = fn;
}

function notifyTransitionEnd(): void {
  transitionEndHandler?.();
}

function clearTimers(): void {
  if (hideTimer !== undefined) clearTimeout(hideTimer);
  if (safetyTimer !== undefined) clearTimeout(safetyTimer);
  hideTimer = undefined;
  safetyTimer = undefined;
}

/** 显示过渡遮罩（路由导航放行时调用）。重复调用幂等，并重置安全计时。 */
export function showTransitionOverlay(meta: TransitionMeta = {}): void {
  clearTimers();
  transitionMeta.value = meta;
  isTransitioning.value = true;
  safetyTimer = setTimeout(() => {
    transitionMeta.value = {};
    isTransitioning.value = false;
    notifyTransitionEnd();
  }, PAGE_TRANSITION.SAFETY_MS);
}

/** 隐藏过渡遮罩（导航确认后延迟调用），可让扫描线动画完整收尾。 */
export function hideTransitionOverlay(delayMs = 0): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    clearTimers();
    transitionMeta.value = {};
    isTransitioning.value = false;
    notifyTransitionEnd();
  }, delayMs);
}

/** 立即强制隐藏（路由失败 / 页面卸载等异常路径）。 */
export function forceHideTransitionOverlay(): void {
  clearTimers();
  transitionMeta.value = {};
  isTransitioning.value = false;
  notifyTransitionEnd();
}

/** 供遮罩组件消费的过渡状态与控制器 */
export function usePageTransition() {
  return {
    isTransitioning: readonly(isTransitioning),
    transitionMeta: readonly(transitionMeta),
    showTransitionOverlay,
    hideTransitionOverlay,
    forceHideTransitionOverlay,
    PAGE_TRANSITION,
  };
}
