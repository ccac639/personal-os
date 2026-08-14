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
    children: [
      {
        path: '',
        name: 'chat-dialog',
        component: () => import('@/pages/chat/dialog.vue'),
        meta: { title: '对话' },
      },
      {
        path: 'agents',
        name: 'chat-agents',
        component: () => import('@/pages/chat/agents.vue'),
        meta: { title: '智能体' },
      },
      {
        path: 'inspiration',
        name: 'chat-inspiration',
        component: () => import('@/pages/chat/inspiration.vue'),
        meta: { title: '灵感广场' },
      },
      {
        path: '3d',
        name: 'chat-3d',
        component: () => import('@/pages/chat/three-d.vue'),
        meta: { title: '3D 工作台' },
      },
    ],
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
    path: '/projects/inbox',
    name: 'project-inbox',
    component: () => import('@/pages/projects/inbox.vue'),
    meta: { title: '任务收件箱' },
  },
  {
    path: '/projects/:id',
    name: 'project-detail',
    component: () => import('@/pages/projects/[id].vue'),
    meta: { title: '项目详情' },
  },
  {
    path: '/achievements',
    name: 'achievements',
    component: () => import('@/pages/achievements/index.vue'),
    meta: { title: '已完成' },
  },
  {
    path: '/sub2api',
    name: 'sub2api',
    component: () => import('@/pages/sub2api/index.vue'),
    meta: { title: 'Sub2API 控制台' },
  },
  {
    path: '/ai',
    name: 'ai',
    component: () => import('@/pages/ai/index.vue'),
    meta: { title: 'AI 工作台' },
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
  // 兜底 404：可恢复页面（返回首页 / 上一页），避免未知路径白屏
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: () => import('@/pages/not-found.vue'),
    meta: { title: '页面不存在' },
  },
];
