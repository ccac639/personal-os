import type { RouteRecordRaw } from 'vue-router';

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'dashboard',
    component: () => import('@/pages/index.vue'),
    meta: { title: '首页' },
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
    meta: { title: '工作流' },
  },
  {
    path: '/projects',
    name: 'projects',
    component: () => import('@/pages/projects/index.vue'),
    meta: { title: '开发中' },
  },
  {
    path: '/achievements',
    name: 'achievements',
    component: () => import('@/pages/achievements/index.vue'),
    meta: { title: '已完成' },
  },
  {
    path: '/admin',
    name: 'admin',
    component: () => import('@/pages/admin/index.vue'),
    meta: { title: '管理系统' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@/pages/settings/index.vue'),
    meta: { title: '设置' },
  },
];
