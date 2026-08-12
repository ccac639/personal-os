import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import ProjectDetailPage from '@/pages/projects/[id].vue';

describe('项目详情二级导航（概览 / 任务 / 计划 / 复盘 / 活动）', () => {
  let pinia: ReturnType<typeof createPinia>;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));

    router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/projects/:id', component: ProjectDetailPage }],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountPage() {
    await router.push('/projects/p-personal-os');
    await router.isReady();
    return mount(ProjectDetailPage, {
      global: {
        plugins: [pinia, router],
        stubs: {
          ProjectContextBar: { template: '<div data-test="ctx-bar" />' },
          ProgressEditor: { template: '<div data-test="progress-editor" />' },
          ProjectPlanView: { template: '<div data-test="plan-view" />' },
          RetroView: { template: '<div data-test="retro-view" />' },
          TaskKanban: { template: '<div data-test="task-kanban" />' },
          StorageWarningBanner: { template: '<div />' },
          ProjectForm: { template: '<div />' },
          TaskForm: { template: '<div />' },
          ProjectDeleteDialog: { template: '<div />' },
          ConfirmDialog: { template: '<div />' },
        },
      },
    });
  }

  it('渲染五个二级导航 tab：概览 / 任务 / 计划 / 复盘 / 活动记录', async () => {
    const wrapper = await mountPage();
    const labels = wrapper.findAll('nav button').map((b) => b.text());
    expect(labels).toEqual(['概览', '任务', '计划', '复盘', '活动记录']);
    wrapper.unmount();
  });

  it('默认显示概览；点击「计划」切换到计划视图', async () => {
    const wrapper = await mountPage();
    // 默认概览：显示项目信息与进度编辑器 stub
    expect(wrapper.find('[data-test="progress-editor"]').exists()).toBe(true);

    const tabs = wrapper.findAll('nav button');
    const planTab = tabs.find((b) => b.text() === '计划')!;
    await planTab.trigger('click');

    expect(wrapper.find('[data-test="plan-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="progress-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('点击「复盘」与「任务」「活动记录」均能正确切换', async () => {
    const wrapper = await mountPage();
    const clickTab = async (label: string) => {
      const tab = wrapper.findAll('nav button').find((b) => b.text() === label)!;
      await tab.trigger('click');
    };

    await clickTab('复盘');
    expect(wrapper.find('[data-test="retro-view"]').exists()).toBe(true);

    await clickTab('任务');
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(true);

    await clickTab('活动记录');
    expect(wrapper.find('[data-test="retro-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('活动记录');
    wrapper.unmount();
  });

  it('活动 tab 选中状态高亮当前导航项', async () => {
    const wrapper = await mountPage();
    const tabs = wrapper.findAll('nav button');
    const planTab = tabs.find((b) => b.text() === '计划')!;
    await planTab.trigger('click');
    expect(planTab.classes()).toContain('text-brand-600');
    wrapper.unmount();
  });
});
