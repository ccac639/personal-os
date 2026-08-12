import { createRouter, createWebHistory } from 'vue-router';

import {
  forceHideTransitionOverlay,
  hideTransitionOverlay,
  setTransitionEndHandler,
  showTransitionOverlay,
} from '@/composables/use-page-transition';

import { routes } from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 导航串行化（防抖合并）+ 遮罩驱动的页面切换。
 *
 * 背景：页面组件全部懒加载。旧的实现用 <Transition mode="out-in"> 包裹
 * RouterView，Vue 3.5 的 out-in 状态机在连续/快速切换时不稳定（enter 阶段
 * 被吞，<main> 空白）。现改为：
 * 1. RouterView 直接渲染（key=fullPath，同步切换，无过渡状态机）；
 * 2. 视觉过渡由全局遮罩承担：beforeEach 放行时显示遮罩（盖住旧页，避免
 *    切换瞬间闪烁），afterEach 确认后延迟隐藏（扫描线动画收尾）；
 * 3. 过渡窗口内的新导航在 beforeEach 挂起（只保留最后一次），过渡结束放行。
 *
 * 状态机：
 * - navActive 在放行导航时激活，过渡结束（遮罩隐藏 / NAV_WINDOW_MS 兜底 /
 *   onError 强制清理）时复位；
 * - 重复导航（to.fullPath === from.fullPath，含初始导航）不激活、不显示遮罩。
 */
let navActive = false;
let navTimer: ReturnType<typeof setTimeout> | undefined;
let pendingNav: { abort: () => void; go: () => void } | null = null;

/** 过渡窗口上限：超过则强制结束串行化（防任何异常路径卡死） */
const NAV_WINDOW_MS = 1600;
/** 导航确认后遮罩保留时长（扫描线 520ms + 余量） */
const OVERLAY_HIDE_MS = 700;

function activateNav(): void {
  navActive = true;
  if (navTimer !== undefined) clearTimeout(navTimer);
  navTimer = setTimeout(deactivateNav, NAV_WINDOW_MS);
}

function deactivateNav(): void {
  if (navTimer !== undefined) clearTimeout(navTimer);
  navTimer = undefined;
  navActive = false;
  flushPendingNavigation();
}

function startOverlay(toTitle?: string, fromTitle?: string): void {
  showTransitionOverlay({ toTitle, fromTitle });
}

router.beforeEach((to, from) => {
  if (navActive) {
    // 过渡/导航进行中：中止上一个挂起的导航，仅保留最后一次
    if (pendingNav) pendingNav.abort();
    return new Promise<boolean>((resolve) => {
      pendingNav = {
        abort: () => resolve(false),
        go: () => {
          // 放行：显示遮罩并继续导航（其 afterEach 会隐藏遮罩）
          startOverlay(
            typeof to.meta.title === 'string' ? to.meta.title : undefined,
            typeof from.meta.title === 'string' ? from.meta.title : undefined,
          );
          resolve(true);
        },
      };
    });
  }
  // 重复导航（含初始导航 from=START_LOCATION）不会切换页面内容，
  // 不显示遮罩、不激活串行化，避免状态卡死
  if (to.fullPath === from.fullPath) return true;
  // 导航确认前先显示遮罩：盖住旧页，内容同步切换时用户不可见（无闪烁）
  startOverlay(
    typeof to.meta.title === 'string' ? to.meta.title : undefined,
    typeof from.meta.title === 'string' ? from.meta.title : undefined,
  );
  navActive = true;
  return true;
});

router.afterEach((to, from) => {
  // 导航已确认且目标变化：延迟隐藏遮罩（扫描线收尾），并保持串行化激活
  if (to.fullPath !== from.fullPath) {
    activateNav();
    hideTransitionOverlay(OVERLAY_HIDE_MS);
  }
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  document.title = title ? `${title} · Personal OS` : 'Personal OS';
});

function flushPendingNavigation(): void {
  if (!pendingNav) return;
  const { go } = pendingNav;
  pendingNav = null;
  go(); // go 内部已显示遮罩；其 afterEach 会重新激活串行化并隐藏遮罩
}

// 遮罩完全隐藏（正常流程 / SAFETY_MS 兜底 / router.onError 强制清理）时
// 结束串行化并放行挂起导航；异常路径由 NAV_WINDOW_MS 兜底
setTransitionEndHandler(deactivateNav);

/**
 * 导航 / 懒加载 chunk 失败：Vue Router 会中止本次导航并保留当前页面，
 * 这里只负责兜底清理过渡层（防止遮罩滞留），并记录错误便于排查。
 * 现有页面无独立错误页，失败时不打断用户当前所见内容。
 */
router.onError((error) => {
  forceHideTransitionOverlay();
  console.error('[router] navigation error:', error);
});

export default router;
