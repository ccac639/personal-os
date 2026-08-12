import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { milestoneProgress, milestoneRisk, sortMilestones } from '@/features/projects/milestones';
import type { Milestone } from '@/features/projects/types';

function makeMilestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms-1',
    projectId: 'p-personal-os',
    title: '数据层迁移',
    status: 'in-progress',
    order: 0,
    taskIds: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

describe('milestone 纯函数', () => {
  it('milestoneProgress：按关联任务完成比例计算，剩余 = 未完成数', () => {
    const done = new Set(['t-a', 't-b']);
    const p = milestoneProgress({ taskIds: ['t-a', 't-b', 't-c'] }, (id) => done.has(id));
    expect(p).toEqual({ total: 3, done: 2, progress: 67, remaining: 1 });

    const empty = milestoneProgress({ taskIds: [] }, () => false);
    expect(empty).toEqual({ total: 0, done: 0, progress: 0, remaining: 0 });
  });

  it('milestoneRisk：已完成 / 正常 / 临近截止有风险 / 逾期', () => {
    expect(milestoneRisk('done', '2026-08-01', '2026-08-13')).toBe('done');
    expect(milestoneRisk('in-progress', '2026-09-01', '2026-08-13')).toBe('on-track');
    expect(milestoneRisk('in-progress', '2026-08-18', '2026-08-13')).toBe('at-risk');
    expect(milestoneRisk('in-progress', '2026-08-12', '2026-08-13')).toBe('overdue');
    expect(milestoneRisk('planned', undefined, '2026-08-13')).toBe('on-track');
  });

  it('sortMilestones：已完成排最后，其余按 order / dueDate 稳定', () => {
    const list = [
      makeMilestone({ id: 'm2', title: 'B', status: 'done', order: 0, dueDate: '2026-08-01' }),
      makeMilestone({
        id: 'm1',
        title: 'A',
        status: 'in-progress',
        order: 1,
        dueDate: '2026-08-20',
      }),
      makeMilestone({ id: 'm0', title: 'C', status: 'planned', order: 0, dueDate: '2026-08-10' }),
    ];
    const sorted = sortMilestones(list);
    expect(sorted.map((m) => m.id)).toEqual(['m0', 'm1', 'm2']);
  });
});

describe('project store 里程碑', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('里程碑 CRUD：创建 / 编辑 / 完成 / 重开 / 删除，并记录活动', () => {
    const store = useProjectStore();
    const created = store.createMilestone('p-personal-os', {
      title: '完成数据层迁移',
      description: 'v2 → v3',
      status: 'planned',
      startDate: '2026-08-01',
      dueDate: '2026-08-20',
      taskIds: [],
    });
    expect(store.milestoneById(created.id)?.title).toBe('完成数据层迁移');
    expect(store.milestonesOf('p-personal-os')).toHaveLength(1);

    store.updateMilestone(created.id, {
      title: '完成数据层迁移 v3',
      status: 'in-progress',
      startDate: '2026-08-01',
      dueDate: '2026-08-25',
      taskIds: [],
    });
    expect(store.milestoneById(created.id)?.title).toBe('完成数据层迁移 v3');

    store.setMilestoneDone(created.id, true);
    expect(store.milestoneById(created.id)?.status).toBe('done');
    store.setMilestoneDone(created.id, false);
    expect(store.milestoneById(created.id)?.status).toBe('in-progress');

    const acts = store.projectActivities('p-personal-os');
    expect(acts.some((a) => a.type === 'milestone')).toBe(true);

    store.deleteMilestone(created.id);
    expect(store.milestonesOf('p-personal-os')).toHaveLength(0);
  });

  it('任务关联：里程碑进度随任务完成变化，且排序可交换', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    const t1 = taskStore.createTask({
      projectId: 'p-personal-os',
      title: '任务一',
      priority: 'high',
      status: 'todo',
      tags: [],
    });
    const t2 = taskStore.createTask({
      projectId: 'p-personal-os',
      title: '任务二',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    const m1 = store.createMilestone('p-personal-os', {
      title: '里程碑一',
      status: 'in-progress',
      taskIds: [t1.id, t2.id],
    });
    const m2 = store.createMilestone('p-personal-os', {
      title: '里程碑二',
      status: 'planned',
      taskIds: [],
    });

    const progress = milestoneProgress(
      store.milestoneById(m1.id)!,
      (id) => taskStore.taskById(id)?.status === 'done',
    );
    expect(progress.progress).toBe(0);

    taskStore.moveTask(t1.id, 'done');
    const after = milestoneProgress(
      store.milestoneById(m1.id)!,
      (id) => taskStore.taskById(id)?.status === 'done',
    );
    expect(after).toEqual({ total: 2, done: 1, progress: 50, remaining: 1 });

    // 排序：上移 m2（m2 order=1，m1 order=0）→ 交换后 m2 在前
    store.moveMilestone(m2.id, -1);
    const list = store.milestonesOf('p-personal-os');
    expect(list[0]?.id).toBe(m2.id);
  });

  it('自动进度与里程碑进度派生：任务完成比例与里程碑完成比例各自独立', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    // 使用全新项目，避免种子任务干扰完成率
    const project = store.createProject({
      name: '独立进度项目',
      status: 'active',
      tags: [],
      techStack: [],
    });
    const t1 = taskStore.createTask({
      projectId: project.id,
      title: 'A',
      priority: 'high',
      status: 'todo',
      tags: [],
    });
    taskStore.createTask({
      projectId: project.id,
      title: 'B',
      priority: 'high',
      status: 'todo',
      tags: [],
    });
    store.createMilestone(project.id, { title: 'M1', status: 'in-progress', taskIds: [t1.id] });
    store.createMilestone(project.id, { title: 'M2', status: 'done', taskIds: [] });

    // 任务完成 1/2 → 任务进度 50%；里程碑完成 1/2 → 里程碑进度 50%
    taskStore.moveTask(t1.id, 'done');
    expect(taskStore.projectStats(project.id).progress).toBe(50);
    const milestones = store.milestonesOf(project.id);
    const doneCount = milestones.filter((m) => m.status === 'done').length;
    expect(Math.round((doneCount / milestones.length) * 100)).toBe(50);
  });
});
