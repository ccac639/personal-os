import { mount, flushPromises } from '@vue/test-utils';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  { path: '/settings', component: TestPage },
  { path: '/:pathMatch(.*)*', component: TestPage },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: testRoutes,
});

async function mountLayout(path: string, attach = false) {
  await router.push(path);
  await flushPromises();
  return mount(DefaultLayout, {
    attachTo: attach ? document.body : undefined,
    global: { plugins: [router, createPinia()] },
  });
}

function stubMatchMedia(query: string, matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((q: string) => ({
      matches: q === query ? matches : !matches,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('default-layout 顶部导航', () => {
  it('渲染跳转链接 + 品牌 + 全部导航项 + 设置按钮', async () => {
    const wrapper = await mountLayout('/');
    const links = wrapper.findAll('a');
    const labels = wrapper.findAll('nav a').map((a) => a.text());
    expect(labels).toEqual(['首页', 'Chat', '工作流', '开发中', 'AI 工作台', '已完成', '管理系统']);
    // 第一个链接是跳转主内容（键盘无障碍），第二个是品牌，最后一个是设置（幽灵按钮）
    expect(links[0].text()).toBe('跳到主内容');
    expect(links[0].attributes('href')).toBe('#main-content');
    expect(links[1].text()).toBe('Personal OS');
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

describe('default-layout 移动端抽屉', () => {
  it('窄屏（<768px）隐藏桌面导航、显示抽屉按钮；打开后焦点进入抽屉并可 Escape 关闭', async () => {
    stubMatchMedia('(min-width: 768px)', false);
    const wrapper = await mountLayout('/', true);
    await flushPromises();

    // 抽屉按钮出现（桌面导航由 Tailwind md: 断点隐藏，行为由按钮接管）
    const menuBtn = wrapper.find('button[aria-label="打开导航菜单"]');
    expect(menuBtn.exists()).toBe(true);
    expect(menuBtn.attributes('aria-expanded')).toBe('false');

    // 打开抽屉：Teleport 到 body，aria-modal 弹层出现，焦点进入第一个可聚焦元素
    await menuBtn.trigger('click');
    await flushPromises();
    const dialog = document.body.querySelector<HTMLElement>('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    const active = document.activeElement;
    expect(active).not.toBeNull();
    expect(dialog!.contains(active)).toBe(true);

    // Escape 关闭抽屉：弹层移除，焦点归还汉堡按钮
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flushPromises();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(menuBtn.element);
    wrapper.unmount();
  });

  it('桌面（≥768px）不渲染抽屉按钮，导航保持可见', async () => {
    stubMatchMedia('(min-width: 768px)', true);
    const wrapper = await mountLayout('/');
    await flushPromises();
    expect(wrapper.find('button[aria-label="打开导航菜单"]').exists()).toBe(false);
    // 桌面导航结构完整（6 项 + 设置；可见性由 md: 断点 CSS 控制）
    const navLabels = wrapper.findAll('nav[aria-label="主导航"] a').map((a) => a.text());
    expect(navLabels).toEqual([
      '首页',
      'Chat',
      '工作流',
      '开发中',
      'AI 工作台',
      '已完成',
      '管理系统',
    ]);
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});
