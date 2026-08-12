import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { buildHealthStats, buildRetroTemplate, buildSnapshot } from '@/features/projects/health';
import { PROJECTS_VERSION, SNAPSHOTS_KEY } from '@/features/projects/persistence';
import { SEED_PROJECTS } from '@/features/projects/mock';
import type { ProjectSnapshot } from '@/features/projects/types';

describe('健康统计（纯函数）', () => {
  const base = {
    tasks: [
      {
        id: 't1',
        title: 'A',
        status: 'done' as const,
        dueDate: undefined,
        updatedAt: '2026-08-13T09:00:00+08:00',
      },
      {
        id: 't2',
        title: 'B',
        status: 'todo' as const,
        dueDate: '2026-08-01',
        updatedAt: '2026-08-12T09:00:00+08:00',
      },
    ],
    milestones: [
      { id: 'm1', title: 'M1', status: 'done' as const, dueDate: '2026-08-10', taskIds: ['t1'] },
      {
        id: 'm2',
        title: 'M2',
        status: 'in-progress' as const,
        dueDate: '2026-08-15',
        taskIds: ['t2'],
      },
    ],
    activities: [
      { id: 'a1', title: '创建任务', createdAt: '2026-08-12T09:00:00+08:00' },
      { id: 'a2', title: '完成任务', createdAt: '2026-08-13T09:00:00+08:00' },
    ],
    focusSessions: [{ id: 'f1', taskId: 't1', minutes: 25, status: 'completed' as const }],
    today: '2026-08-13',
  };

  it('完成率 / 逾期 / 专注分钟 / 活动数统计正确', () => {
    const h = buildHealthStats(base as never);
    expect(h.completionRate).toBe(50);
    expect(h.overdueCount).toBe(1);
    expect(h.focusMinutes).toBe(25);
    expect(h.activity7d).toBe(2);
    expect(h.activity30d).toBe(2);
  });

  it('里程碑摘要：done / at-risk / overdue 分类', () => {
    const h = buildHealthStats(base as never);
    expect(h.milestones.total).toBe(2);
    expect(h.milestones.done).toBe(1);
    expect(h.milestones.atRisk).toBe(1);
    expect(h.milestones.overdue).toBe(0);
    // M2 关联 t2（未完成）且 8-15 截止（2 天内）→ at-risk
    expect(h.milestoneDetails.find((m) => m.id === 'm2')?.risk).toBe('at-risk');
  });

  it('趋势：最近 7 天完成 / 未完成计数', () => {
    const h = buildHealthStats(base as never);
    expect(h.doneTrend).toHaveLength(7);
    expect(h.doneTrend[6]?.count).toBe(1);
    expect(h.pendingTrend[6]?.count).toBe(0);
  });

  it('复盘模板：基于健康统计预填四段文本', () => {
    const h = buildHealthStats(base as never);
    const tpl = buildRetroTemplate(h);
    expect(tpl.done).toContain('50%');
    expect(tpl.blockers).toContain('1 个任务逾期');
    expect(tpl.lessons).toContain('2 个里程碑');
  });
});

describe('归档快照与级联清理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('快照构建：包含项目 / 任务 / 里程碑 / 活动 / 复盘，导出结构完整', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    const project = store.projectById('p-personal-os')!;
    const t = taskStore.createTask({
      projectId: 'p-personal-os',
      title: '快照任务',
      priority: 'high',
      status: 'todo',
      tags: [],
    });
    const m = store.createMilestone('p-personal-os', {
      title: '快照里程碑',
      status: 'planned',
      taskIds: [t.id],
    });
    store.saveRetrospective('p-personal-os', {
      done: '完成 X',
      blockers: '',
      next: '',
      lessons: '',
    });

    const snap = buildSnapshot({
      project,
      tasks: taskStore.tasksByProject('p-personal-os'),
      milestones: store.milestonesOf('p-personal-os'),
      activities: store.projectActivities('p-personal-os'),
      retrospective: store.retrospectiveOf('p-personal-os'),
      now: '2026-08-13T12:00:00+08:00',
    });

    expect(snap.projectId).toBe('p-personal-os');
    expect(snap.data.project.name).toBe(project.name);
    expect(snap.data.tasks.some((x) => x.id === t.id)).toBe(true);
    expect(snap.data.milestones.some((x) => x.id === m.id)).toBe(true);
    expect(snap.data.retrospective?.done).toContain('完成 X');

    // 导出结构 = JSON 可序列化快照对象
    const json = JSON.stringify(snap);
    const parsed = JSON.parse(json) as ProjectSnapshot;
    expect(parsed.data.tasks).toHaveLength(snap.data.tasks.length);
    expect(parsed.data.milestones[0]?.title).toBe('快照里程碑');
  });

  it('生成快照：持久化到本地、查看 / 删除', () => {
    const store = useProjectStore();
    const project = store.projectById('p-personal-os')!;
    const snap = buildSnapshot({
      project,
      tasks: [],
      milestones: [],
      activities: [],
      retrospective: null,
      now: '2026-08-13T12:00:00+08:00',
    });
    store.addSnapshot(snap);
    expect(store.snapshotsOf('p-personal-os')).toHaveLength(1);
    expect(store.snapshotById(snap.id)?.projectId).toBe('p-personal-os');

    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).version).toBe(PROJECTS_VERSION);

    store.deleteSnapshot(snap.id);
    expect(store.snapshotsOf('p-personal-os')).toHaveLength(0);
  });

  it('永久删除项目：级联清理里程碑、复盘、快照', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    const project = store.projectById('p-personal-os')!;
    const t = taskStore.createTask({
      projectId: 'p-personal-os',
      title: '级联任务',
      priority: 'low',
      status: 'todo',
      tags: [],
    });
    store.createMilestone('p-personal-os', {
      title: '级联里程碑',
      status: 'planned',
      taskIds: [t.id],
    });
    store.saveRetrospective('p-personal-os', { done: 'X', blockers: '', next: '', lessons: '' });
    const snap = buildSnapshot({
      project,
      tasks: taskStore.tasksByProject('p-personal-os'),
      milestones: store.milestonesOf('p-personal-os'),
      activities: store.projectActivities('p-personal-os'),
      retrospective: store.retrospectiveOf('p-personal-os'),
      now: '2026-08-13T12:00:00+08:00',
    });
    store.addSnapshot(snap);

    taskStore.removeByProject('p-personal-os');
    store.deleteProject('p-personal-os');

    expect(store.projectById('p-personal-os')).toBeNull();
    expect(store.milestonesOf('p-personal-os')).toHaveLength(0);
    expect(store.retrospectiveOf('p-personal-os')).toBeNull();
    expect(store.snapshotsOf('p-personal-os')).toHaveLength(0);
    expect(taskStore.tasksByProject('p-personal-os')).toHaveLength(0);
    expect(store.projectActivities('p-personal-os')).toHaveLength(0);

    // 其余项目不受影响
    expect(store.projects.length).toBe(SEED_PROJECTS.length - 1);
  });
});
