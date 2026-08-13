import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';

import { buildProjectCardMetrics } from '@/features/projects/health';
import type { ProjectCardMetrics } from '@/features/projects/health';
import ProjectCard from '@/features/projects/project-card.vue';
import type { ProjectDetail } from '@/features/projects/types';

function makeProject(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-test',
    name: '测试项目',
    description: '这是一段描述，紧凑卡片不应展示',
    status: 'active',
    ownerId: 'me',
    tags: ['tag-a'],
    techStack: ['vue', 'ts'],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-10T00:00:00+08:00',
    favorite: false,
    progressMode: 'auto',
    ...over,
  };
}

const metrics: ProjectCardMetrics = {
  progress: 60,
  unfinished: 3,
  nextDate: { label: '里程碑', date: '2026-08-20' },
  health: 'warn',
};

function mountCard(project: ProjectDetail, cardMetrics: ProjectCardMetrics = metrics) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/projects/:id', component: { template: '<div />' } }],
  });
  return mount(ProjectCard, {
    props: { project, metrics: cardMetrics },
    global: { plugins: [router] },
  });
}

describe('project card（紧凑卡片）', () => {
  it('卡片只展示：名称 / 状态 / 进度 / 下一个关键日期 / 未完成任务 / 健康状态', () => {
    const wrapper = mountCard(makeProject());
    const text = wrapper.text();
    expect(text).toContain('测试项目');
    expect(text).toContain('进行中'); // 状态
    expect(text).toContain('60%'); // 进度
    expect(text).toContain('里程碑 · 2026-08-20'); // 下一个关键日期
    expect(text).toContain('3 个未完成'); // 未完成任务
    expect(text).toContain('需关注'); // 健康状态

    // 收敛：描述 / 技术栈 / 任务计数等低频信息不在卡片主体
    expect(text).not.toContain('这是一段描述');
    expect(text).not.toContain('vue');
    expect(text).not.toContain('done/');
    wrapper.unmount();
  });

  it('收藏、归档、删除等低频操作收纳在菜单中，仅在展开时出现', async () => {
    const wrapper = mountCard(makeProject());
    expect(wrapper.find('button[aria-label="项目菜单：测试项目"]').exists()).toBe(true);
    // 菜单默认收起
    expect(wrapper.text()).not.toContain('快速任务');
    expect(wrapper.text()).not.toContain('删除');

    await wrapper.find('button[aria-label="项目菜单：测试项目"]').trigger('click');
    expect(wrapper.text()).toContain('编辑');
    expect(wrapper.text()).toContain('快速任务');
    expect(wrapper.text()).toContain('归档');
    expect(wrapper.text()).toContain('删除');

    // 菜单项触发对应事件
    await wrapper.findAll('button[role="menuitem"]')[2]!.trigger('click');
    expect(wrapper.emitted('archive')?.[0]?.[0]?.id).toBe('p-test');
    wrapper.unmount();
  });

  it('收藏按钮触发 favorite 事件', async () => {
    const wrapper = mountCard(makeProject());
    await wrapper.find('button[aria-label="收藏项目"]').trigger('click');
    expect(wrapper.emitted('favorite')?.[0]?.[0]?.id).toBe('p-test');
    wrapper.unmount();
  });

  it('已归档项目菜单显示「恢复」而非「归档」', async () => {
    const wrapper = mountCard(makeProject({ status: 'archived' }));
    await wrapper.find('button[aria-label="项目菜单：测试项目"]').trigger('click');
    const items = wrapper.findAll('button[role="menuitem"]').map((b) => b.text());
    expect(items).toContain('恢复');
    expect(items).not.toContain('归档');
    wrapper.unmount();
  });
});

describe('buildProjectCardMetrics（纯函数，列表页一次性预计算）', () => {
  const today = '2026-08-13';

  function mkTask(over: Record<string, unknown>): Record<string, unknown> {
    return {
      id: 't-1',
      projectId: 'p-test',
      title: '任务',
      status: 'todo',
      priority: 'medium',
      tags: [],
      order: 0,
      subtasks: [],
      dependsOn: [],
      createdAt: '2026-08-01T00:00:00+08:00',
      updatedAt: '2026-08-01T00:00:00+08:00',
      ...over,
    };
  }

  it('未完成任务数只计未完成未取消；进度按任务完成比例', () => {
    const project = makeProject();
    const tasks = [
      mkTask({ id: 'a', status: 'done' }),
      mkTask({ id: 'b', status: 'todo' }),
      mkTask({ id: 'c', status: 'in-progress' }),
      mkTask({ id: 'd', status: 'cancelled' }),
    ];
    const m = buildProjectCardMetrics({
      project,
      tasks: tasks as never,
      milestones: [],
      activities: [],
      focusSessions: [],
      today,
    });
    expect(m.unfinished).toBe(2);
    expect(m.progress).toBe(33);
    expect(m.nextDate).toBeNull();
  });

  it('手动进度模式优先使用 manualProgress', () => {
    const project = makeProject({ progressMode: 'manual', manualProgress: 45 });
    const m = buildProjectCardMetrics({
      project,
      tasks: [mkTask({ id: 'a', status: 'done' })] as never,
      milestones: [],
      activities: [],
      focusSessions: [],
      today,
    });
    expect(m.progress).toBe(45);
  });

  it('下一个关键日期取今天及以后最早的 目标 / 里程碑 / 任务截止', () => {
    const project = makeProject({ targetDate: '2026-08-30' });
    const tasks = [
      mkTask({ id: 'a', dueDate: '2026-08-20', status: 'todo' }),
      mkTask({ id: 'b', dueDate: '2026-08-25', status: 'todo' }),
      mkTask({ id: 'c', dueDate: '2026-08-10', status: 'todo' }), // 已过 → 不计
    ];
    const milestones = [
      {
        id: 'm1',
        projectId: 'p-test',
        title: 'M',
        status: 'planned',
        dueDate: '2026-08-22',
        order: 0,
        taskIds: [],
        createdAt: '2026-08-01T00:00:00+08:00',
        updatedAt: '2026-08-01T00:00:00+08:00',
      },
    ];
    const m = buildProjectCardMetrics({
      project,
      tasks: tasks as never,
      milestones: milestones as never,
      activities: [],
      focusSessions: [],
      today,
    });
    expect(m.nextDate).toEqual({ label: '任务', date: '2026-08-20' });
  });

  it('健康状态：danger 优先于 warn，无规则为 ok', () => {
    // 逾期任务 → danger（进度落后规则）
    const project = makeProject({ targetDate: '2026-08-01' });
    const m = buildProjectCardMetrics({
      project,
      tasks: [] as never,
      milestones: [],
      activities: [],
      focusSessions: [],
      today,
    });
    expect(m.health).toBe('danger');

    const ok = buildProjectCardMetrics({
      project: makeProject(),
      tasks: [mkTask({ id: 'a', status: 'done' })] as never,
      milestones: [],
      activities: [
        { id: 'x', projectId: 'p-test', type: 'created', title: '创建', createdAt: today },
      ] as never,
      focusSessions: [],
      today,
    });
    expect(ok.health).toBe('ok');
  });
});
