import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';

import ProjectDetailPage from '@/pages/projects/[id].vue';

describe('项目详情二级导航（概览 / 任务 / 计划 / 执行 / 发布 / 知识 / 复盘）', () => {
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
          ArchiveDialog: { template: '<div data-test="archive-dialog" />' },
          ExecutionTab: { template: '<div data-test="execution-tab" />' },
          ReleasePanel: { template: '<div data-test="release-panel" />' },
          KnowledgePanel: { template: '<div data-test="knowledge-panel" />' },
        },
      },
    });
  }

  it('渲染七个二级导航 tab：概览 / 任务 / 计划 / 执行 / 发布 / 知识 / 复盘', async () => {
    const wrapper = await mountPage();
    const labels = wrapper.findAll('nav button').map((b) => b.text());
    expect(labels).toEqual(['概览', '任务', '计划', '执行', '发布', '知识', '复盘']);
    wrapper.unmount();
  });

  it('默认显示概览：项目上下文（进度编辑器）+ 下一步行动 + 风险 + 近期活动', async () => {
    const wrapper = await mountPage();
    // 概览包含进度编辑器（项目上下文）与三个分区
    expect(wrapper.find('[data-test="progress-editor"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('项目上下文');
    expect(wrapper.text()).toContain('下一步行动');
    expect(wrapper.text()).toContain('风险');
    expect(wrapper.text()).toContain('近期活动');
    wrapper.unmount();
  });

  it('点击「计划」切换到计划视图，概览内容卸载', async () => {
    const wrapper = await mountPage();
    const tabs = wrapper.findAll('nav button');
    const planTab = tabs.find((b) => b.text() === '计划')!;
    await planTab.trigger('click');

    expect(wrapper.find('[data-test="plan-view"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="progress-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('点击「复盘」「任务」「执行」均能正确切换', async () => {
    const wrapper = await mountPage();
    const clickTab = async (label: string) => {
      const tab = wrapper.findAll('nav button').find((b) => b.text() === label)!;
      await tab.trigger('click');
    };

    await clickTab('复盘');
    expect(wrapper.find('[data-test="retro-view"]').exists()).toBe(true);

    await clickTab('任务');
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(true);

    await clickTab('执行');
    expect(wrapper.find('[data-test="execution-tab"]').exists()).toBe(true);

    await clickTab('发布');
    expect(wrapper.find('[data-test="release-panel"]').exists()).toBe(true);

    await clickTab('知识');
    expect(wrapper.find('[data-test="knowledge-panel"]').exists()).toBe(true);

    await clickTab('复盘');
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="knowledge-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('视图懒初始化：未访问的视图不挂载，切换后旧视图卸载清理', async () => {
    const wrapper = await mountPage();
    // 初始只渲染概览
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="plan-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="execution-tab"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="release-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="knowledge-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="retro-view"]').exists()).toBe(false);

    const clickTab = async (label: string) => {
      const tab = wrapper.findAll('nav button').find((b) => b.text() === label)!;
      await tab.trigger('click');
    };

    // 访问任务 → 仅任务挂载
    await clickTab('任务');
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(true);
    expect(wrapper.find('[data-test="execution-tab"]').exists()).toBe(false);

    // 切到执行 → 任务卸载（v-if 按需初始化 + 离开清理），执行挂载
    await clickTab('执行');
    expect(wrapper.find('[data-test="task-kanban"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="execution-tab"]').exists()).toBe(true);

    // 从未访问的计划 / 发布 / 知识 / 复盘仍未挂载
    expect(wrapper.find('[data-test="plan-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="release-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="knowledge-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-test="retro-view"]').exists()).toBe(false);
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
