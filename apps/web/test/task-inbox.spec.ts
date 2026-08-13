import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';

describe('任务收件箱（未归属项目任务）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function seedProject(name: string): string {
    const ps = useProjectStore();
    const p = ps.createProject({ name, status: 'active', tags: [], techStack: [] });
    return p.id;
  }

  it('收件箱任务创建：projectId 为空，不出现在任一项目详情，但计入全局汇总', () => {
    const store = useTaskStore();
    const inboxTask = store.createTask({
      projectId: undefined,
      title: '收件箱任务',
      priority: 'medium',
      status: 'todo',
      tags: ['稍后'],
    });
    expect(store.inboxTasks.map((t) => t.id)).toContain(inboxTask.id);
    expect(store.tasksByProject('p-none')).toHaveLength(0);
    expect(store.summary.total).toBeGreaterThanOrEqual(1);
    // 收件箱任务支持子任务 / 估时 / 截止 / 阻塞原因 / 活动记录
    expect(store.addSubtask(inboxTask.id, '步骤一')).toBeUndefined();
    expect(store.taskById(inboxTask.id)?.subtasks).toHaveLength(1);
    store.updateTask(inboxTask.id, {
      projectId: undefined,
      title: '收件箱任务',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-08-14',
      tags: ['稍后'],
      estimatedMinutes: 90,
      dod: '验收通过',
      blockedReason: '等待资料',
    });
    const t = store.taskById(inboxTask.id)!;
    expect(t.estimatedMinutes).toBe(90);
    expect(t.dod).toBe('验收通过');
    expect(t.blockedReason).toBe('等待资料');
    expect(store.taskEvents(inboxTask.id).length).toBeGreaterThan(0);
  });

  it('批量分配到项目：任务移出收件箱并进入项目，写入活动流', () => {
    const ps = useProjectStore();
    const pId = seedProject('项目A');
    const store = useTaskStore();
    const a = store.createTask({
      projectId: undefined,
      title: '甲',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const b = store.createTask({
      projectId: undefined,
      title: '乙',
      priority: 'medium',
      status: 'in-progress',
      tags: [],
    });

    const moved = store.assignToProject([a.id, b.id], pId);
    expect(moved).toBe(2);
    expect(store.inboxTasks).toHaveLength(0);
    expect(
      store
        .tasksByProject(pId)
        .map((t) => t.id)
        .sort(),
    ).toEqual([a.id, b.id].sort());
    expect(ps.projectActivities(pId).some((x) => x.title === '任务分配入项目')).toBe(true);
  });

  it('转今日计划：未在计划中的收件箱任务加入，重复不生效', () => {
    const store = useTaskStore();
    const a = store.createTask({
      projectId: undefined,
      title: '甲',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const b = store.createTask({
      projectId: undefined,
      title: '乙',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    expect(store.addInboxToFocus([a.id, b.id])).toBe(2);
    expect(store.focus.map((f) => f.taskId).sort()).toEqual([a.id, b.id].sort());
    // 重复加入不生效
    expect(store.addInboxToFocus([a.id])).toBe(0);
    // 已加入今日计划的任务
    expect(store.focusTasks.map((t) => t.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('项目删除：cascade 删除任务 / to-inbox 任务转入收件箱', () => {
    const pId = seedProject('项目B');
    const store = useTaskStore();
    store.createTask({ projectId: pId, title: '甲', priority: 'medium', status: 'todo', tags: [] });
    store.createTask({ projectId: pId, title: '乙', priority: 'medium', status: 'done', tags: [] });

    // 模式一：级联删除（seed 任务保留，项目任务清空）
    store.removeByProject(pId, 'cascade');
    expect(store.tasksByProject(pId)).toHaveLength(0);

    // 模式二：转入收件箱
    const p2 = seedProject('项目C');
    store.createTask({ projectId: p2, title: '丙', priority: 'medium', status: 'todo', tags: [] });
    store.removeByProject(p2, 'to-inbox');
    expect(store.inboxTasks.map((t) => t.title)).toContain('丙');
    expect(
      store.taskById(store.inboxTasks.find((t) => t.title === '丙')!.id)?.projectId,
    ).toBeUndefined();
  });

  it('收件箱筛选与分组（inboxGrouped 按状态）', () => {
    const store = useTaskStore();
    store.createTask({
      projectId: undefined,
      title: '甲',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    store.createTask({
      projectId: undefined,
      title: '乙',
      priority: 'medium',
      status: 'done',
      tags: [],
    });
    const g = store.inboxGrouped;
    expect(g.todo).toHaveLength(1);
    expect(g.done).toHaveLength(1);
    expect(g['in-progress']).toHaveLength(0);
  });
});
