/**
 * 全局页面过渡状态（模块级单例）
 *
 * 设计要点：
 * - 状态放在模块作用域而不是组件内部，使 router.onError 等非组件代码也能强制清理遮罩；
 * - 所有定时器集中管理：show 时先清除旧的 hide / safety 定时器，保证快速连续切换时
 *   「只保留最后一次导航」的遮罩生命周期（不会叠出多个遮罩实例）；
 * - SAFETY_MS 兜底：任何异常路径（路由失败 / 动画被取消且未恢复）下遮罩都会被强制
 *   销毁，绝不长期遮挡页面；
 * - 遮罩本身 pointer-events: none，且只存在约 0.9s，不阻塞任何用户操作；
 * - meta 承载过渡期间的状态文本（来源页 / 目标页标题），随遮罩一起创建与清理。
 */
import { readonly, ref } from 'vue';

/** 过渡节奏（与 assets/transitions.css 中的时长保持一致） */
export const PAGE_TRANSITION = {
  /** 旧页面退场时长（.page-leave-*） */
  LEAVE_MS: 420,
  /** 扫描线动画时长（@keyframes page-scanline） */
  SCANLINE_MS: 520,
  /** 新页面入场时长（.page-enter-*，含 clip-path 视口展开） */
  ENTER_MS: 480,
  /** 入场完成后延迟隐藏遮罩，让扫描线完整收尾（520 < 480 + 200） */
  HIDE_DELAY_MS: 200,
  /** 兜底上限：任何情况下遮罩最长存活时间（整体切换 ≤ 900ms） */
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

function clearTimers(): void {
  if (hideTimer !== undefined) clearTimeout(hideTimer);
  if (safetyTimer !== undefined) clearTimeout(safetyTimer);
  hideTimer = undefined;
  safetyTimer = undefined;
}

/** 显示过渡遮罩（旧页面离场完成后调用）。重复调用幂等，并重置安全计时。 */
export function showTransitionOverlay(meta: TransitionMeta = {}): void {
  clearTimers();
  transitionMeta.value = meta;
  isTransitioning.value = true;
  safetyTimer = setTimeout(() => {
    transitionMeta.value = {};
    isTransitioning.value = false;
  }, PAGE_TRANSITION.SAFETY_MS);
}

/** 隐藏过渡遮罩（新页面入场完成后调用），可延迟让扫描线动画完整收尾。 */
export function hideTransitionOverlay(delayMs = 0): void {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    clearTimers();
    transitionMeta.value = {};
    isTransitioning.value = false;
  }, delayMs);
}

/** 立即强制隐藏（路由失败 / 页面卸载等异常路径）。 */
export function forceHideTransitionOverlay(): void {
  clearTimers();
  transitionMeta.value = {};
  isTransitioning.value = false;
}

/**
 * 返回当前路由应使用的过渡动画名。
 * 前进 / 后退 / 同层切换统一使用「page」：视觉节奏一致，配合 motion-v 的
 * layoutId 下划线，任何方向的导航都走同一套系统切换效果。
 * 保留该函数作为扩展点（例如按导航方向区分 page-forward / page-back，
 * 只需在 transitions.css 增加同名类并在此返回）。
 */
export function getRouteTransition(_route?: unknown): string {
  void _route; // 参数预留为扩展点：当前统一「page」
  return 'page';
}

/** 供布局组件消费的过渡状态与控制器 */
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
