import { createRouter, createWebHistory } from 'vue-router';

import { routes } from './routes';

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  document.title = title ? `${title} · Personal OS` : 'Personal OS';
});

export default router;
