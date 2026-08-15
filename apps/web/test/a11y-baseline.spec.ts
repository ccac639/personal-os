import { flushPromises, mount } from '@vue/test-utils';
import axe from 'axe-core';
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DefaultLayout from '@/layouts/default-layout.vue';
import RouteFormDialog from '@/features/sub2api/components/route-form-dialog.vue';
import ChatComposer from '@/features/chat/components/chat-composer.vue';

/**
 * a11y 基线（G1 方案 B：axe-core 运行时断言）
 * 覆盖 AppShell（default-layout 导航/容器）、表单（sub2api 路由表单）、
 * 输入（chat composer）。门禁 = 测试套件（全量 vitest，pre-push/CI 天然覆盖）。
 * jsdom 下 axe 跳过需真实布局的规则（color-contrast 等），violations 为确定违规。
 */

const TestPage = { name: 'TestPage', template: '<div class="test-page" />' };

const testRoutes: RouteRecordRaw[] = [
  { path: '/', component: TestPage },
  { path: '/chat', component: TestPage },
  { path: '/sub2api', component: TestPage },
  { path: '/:pathMatch(.*)*', component: TestPage },
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: testRoutes,
});

async function runAxe(element: Element): Promise<axe.Results> {
  const results = await axe.run(element);
  return results;
}

function describeViolations(results: axe.Results): string {
  return results.violations.map((v) => `${v.id} (${v.nodes.length}): ${v.help}`).join('\n');
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('a11y 基线（axe-core）', () => {
  it('AppShell（default-layout）：导航与容器无阻断级违规', async () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation(() => ({
        matches: false,
        media: '',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    await router.push('/');
    await flushPromises();
    const wrapper = mount(DefaultLayout, {
      attachTo: document.body,
      global: { plugins: [router, createPinia()] },
    });
    await flushPromises();

    const results = await runAxe(wrapper.element);
    expect(describeViolations(results), describeViolations(results)).toBe('');
    wrapper.unmount();
  });

  it('表单（RouteFormDialog）：对话框无阻断级违规', async () => {
    const wrapper = mount(RouteFormDialog, {
      props: { visible: true, item: null },
      attachTo: document.body,
    });
    await flushPromises();

    // Teleport 到 body：axe 跑实际挂载的对话框节点
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    const results = await runAxe(dialog!);
    expect(describeViolations(results), describeViolations(results)).toBe('');
    wrapper.unmount();
  });

  it('输入（ChatComposer）：消息输入面板无阻断级违规', async () => {
    const wrapper = mount(ChatComposer, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await flushPromises();

    const results = await runAxe(wrapper.element);
    expect(describeViolations(results), describeViolations(results)).toBe('');
    wrapper.unmount();
  });
});
