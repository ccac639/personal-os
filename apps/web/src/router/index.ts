import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/pages/index.vue'),
    meta: { title: 'Dashboard' },
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('@/pages/chat/index.vue'),
    meta: { title: 'Chat' },
  },
  {
    path: '/agents',
    name: 'agents',
    component: () => import('@/pages/agents/index.vue'),
    meta: { title: 'Agents' },
  },
  {
    path: '/workflows',
    name: 'workflows',
    component: () => import('@/pages/workflows/index.vue'),
    meta: { title: 'Workflows' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/pages/projects/index.vue'),
    meta: { title: 'Projects' },
  },
  {
    path: '/achievements',
    name: 'achievements',
    component: () => import('@/pages/achievements/index.vue'),
    meta: { title: 'Achievements' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/settings/index.vue'),
    meta: { title: 'Settings' },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.afterEach((to) => {
  const title = typeof to.meta.title === 'string' ? to.meta.title : undefined;
  document.title = title ? `${title} · Personal OS` : 'Personal OS';
});

export default router;
