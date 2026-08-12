import { createRouter, createWebHistory } from 'vue-router';

import { forceHideTransitionOverlay } from '@/composables/use-page-transition';

import { routes } from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  document.title = title ? `${title} · Personal OS` : 'Personal OS';
});

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
