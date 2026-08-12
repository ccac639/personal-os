import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { createPinia } from 'pinia';
import { describe, expect, it } from 'vitest';

import DefaultLayout from '@/layouts/default-layout.vue';

/**
 * 轻量测试路由：不引用真实页面（真实路由为懒加载 chunk，全量并行跑单测时
 * 导入开销会把 5s 超时打满）。导航项断言只依赖 path 匹配，
 * 同时 RouterView + Transition + KeepAlive 的过渡结构会被真实执行。
 */
const TestPage = { name: 'TestPage', template: '<div class="test-page" />' };

const testRoutes: RouteRecordRaw[] = [
  { path: '/', component: TestPage },
  { path: '/chat', component: TestPage },
  { path: '/projects/:id', component: TestPage },
  { path: '/:pathMatch(.*)*', component: TestPage },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: testRoutes,
});

async function mountLayout(path: string) {
  await router.push(path);
  await flushPromises();
  return mount(DefaultLayout, { global: { plugins: [router, createPinia()] } });
}

describe('default-layout 顶部导航', () => {
  it('渲染品牌 + 全部导航项 + 设置按钮', async () => {
    const wrapper = await mountLayout('/');
    const links = wrapper.findAll('a');
    const labels = wrapper.findAll('nav a').map((a) => a.text());
    expect(labels).toEqual(['首页', 'Chat', '工作流', '开发中', '已完成', '管理系统']);
    // 第一个链接是品牌区，最后一个链接是设置（幽灵按钮）
    // 品牌字母动画将空格渲染为 \u00A0（非断行空格），需归一化
    expect(links[0].text().replace(/\u00A0/g, ' ')).toBe('Personal OS');
    expect(links.at(-1)?.text()).toBe('设置');
  });

  it('首页精确匹配高亮（子路径不高亮首页）', async () => {
    const wrapper = await mountLayout('/chat');
    const homeLink = wrapper.findAll('nav a')[0];
    expect(homeLink.classes()).not.toContain('text-surface-900');
    const chatLink = wrapper.findAll('nav a')[1];
    expect(chatLink.classes()).toContain('text-surface-900');
  });

  it('前缀匹配：/projects 子路由高亮"开发中"', async () => {
    const wrapper = await mountLayout('/projects/123');
    const projectLink = wrapper.findAll('nav a')[3];
    expect(projectLink.classes()).toContain('text-surface-900');
  });
});
