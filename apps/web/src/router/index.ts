import { createRouter, createWebHistory } from 'vue-router';

import {
  beginNavigation,
  confirmNavigation,
  failNavigation,
  getDirection,
  isInitialNavigation,
  setNavCallbacks,
  transitionState,
  waitForLeave,
} from '@/features/page-transition';

import { beginTransition, markRouteLoad } from '@/app/perf';

import { routes } from './routes';

/** 当前时间（ms；jsdom / 无 performance 时回退 Date.now） */
function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** beforeEach 记录的导航起点（afterEach 计算路由加载耗时，仅开发态使用） */
let navStart = 0;

const router = createRouter({
  history: createWebHistory(),
  routes,
});

/**
 * 页面切换状态机（见 features/page-transition/transition-store.ts）：
 *
 *   beforeEach → beginNavigation（离场动画 + token 递增）→ waitForLeave
 *   → 导航确认 → afterEach → confirmNavigation（等待页面就绪）
 *   → 页面 mounted / 关键任务完成 → 入场动画 → idle
 *
 * - 首航 / 刷新 / 直接输入 URL（from 为 START_LOCATION）：不播放离场、不显示
 *   loading 层，直接进入就绪等待；
 * - 同一路由仅 query 变化：轻量内容过渡，不挂起导航；
 * - 快速连续切换：新导航的 beginNavigation 会取消上一个离场等待，旧导航
 *   的守卫 resolve(false) 被 Vue Router 忽略（导航已取消）；
 * - 路由组件加载失败：failNavigation 进入错误层（重试 / 返回）。
 */
setNavCallbacks({
  retry: () => {
    // 组件加载失败时 currentRoute 仍是旧页，用状态机记录的目标路径重试
    const target = transitionState.targetPath || router.currentRoute.value.fullPath;
    try {
      void Promise.resolve(router.replace(target)).catch(() => {
        /* 导航失败忽略（错误层仍在，用户可再次重试） */
      });
    } catch {
      /* 历史 API 不可用（如 jsdom）时忽略 */
    }
  },
  goBack: () => {
    if (window.history.length <= 1) {
      // 无可回退历史（如直接输入 URL 后失败）：回到来源页
      const fromPath = transitionState.fromPath || '/';
      try {
        void Promise.resolve(router.replace(fromPath)).catch(() => {
          /* 忽略 */
        });
      } catch {
        /* 忽略 */
      }
      return;
    }
    try {
      void Promise.resolve(router.back()).catch(() => {
        /* jsdom / 无历史记录等场景忽略 */
      });
    } catch {
      /* 忽略 */
    }
  },
});

router.beforeEach(async (to, from) => {
  // 性能标记：路由加载耗时起点（仅开发态生效）
  navStart = now();
  beginTransition();

  // 重复导航（含初始导航 from=START_LOCATION 到当前 URL）：直接放行
  if (to.fullPath === from.fullPath) return true;

  const initial = isInitialNavigation(from);
  const direction = getDirection(from, to);
  const token = beginNavigation({
    direction,
    initial,
    fromTitle: typeof from.meta.title === 'string' ? from.meta.title : undefined,
    toTitle: typeof to.meta.title === 'string' ? to.meta.title : undefined,
    targetPath: to.fullPath,
    fromPath: from.fullPath,
  });

  // 首航 / query-only：不等待离场动画
  if (initial || direction === 'query') return true;

  const proceed = await waitForLeave(token);
  return proceed;
});

router.afterEach((to, from) => {
  if (to.fullPath !== from.fullPath) {
    confirmNavigation();
    markRouteLoad(to.fullPath, now() - navStart);
  }
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  document.title = title ? `${title} · Personal OS` : 'Personal OS';
});

/**
 * 导航 / 懒加载 chunk 失败：Vue Router 中止本次导航并保留当前页面，
 * 进入应用级错误层（重试 / 返回），不破坏当前已可用页面状态。
 */
router.onError((error) => {
  failNavigation(error);
  console.error('[router] navigation error:', error);
});

export default router;
