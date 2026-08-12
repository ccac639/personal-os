import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { TaskPriority } from '@personal-os/types';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { SEED_TASKS } from '@/features/tasks/mock';
import { TASK_PRIORITY_META } from '@/features/tasks/types';

describe('task store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    // 固定系统时间，保证逾期计算与排序断言可复现
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始状态：无持久化数据时加载种子任务', () => {
    const store = useTaskStore();
    expect(store.tasks.length).toBe(SEED_TASKS.length);
    expect(store.taskById('t-pos-1')?.title).toContain('项目与任务管理');
    expect(store.taskById('not-exist')).toBeNull();
  });

  it('创建任务：追加到目标列末尾，并写入项目活动记录', () => {
    const store = useTaskStore();
    const projectStore = useProjectStore();
    const todoOrders = store.tasksInColumn('p-personal-os', 'todo').map((t) => t.order);
    const next = Math.max(...todoOrders) + 1;

    const task = store.createTask({
      projectId: 'p-personal-os',
      title: '新增的待办任务',
      priority: 'high',
      status: 'todo',
      tags: ['前端'],
    });

    expect(store.taskById(task.id)?.title).toBe('新增的待办任务');
    expect(store.taskById(task.id)?.priority).toBe('high');
    expect(store.taskById(task.id)?.order).toBe(next);
    expect(store.tasksInColumn('p-personal-os', 'todo').length).toBe(todoOrders.length + 1);

    const acts = projectStore.projectActivities('p-personal-os');
    expect(acts[0]?.type).toBe('task');
    expect(acts[0]?.title).toBe('创建任务');
    expect(acts[0]?.description).toBe('新增的待办任务');
  });

  it('更新任务：字段合并；状态变更时移到目标列末尾', () => {
    const store = useTaskStore();
    const t = store.taskById('t-pos-3')!;
    const doneCount = store.tasksInColumn('p-personal-os', 'done').length;

    store.updateTask(t.id, {
      projectId: 'p-personal-os',
      title: '更新后的标题',
      description: '新描述',
      priority: 'urgent',
      status: 'done',
      dueDate: '2026-08-30',
      tags: ['AI'],
    });

    const updated = store.taskById(t.id)!;
    expect(updated.title).toBe('更新后的标题');
    expect(updated.priority).toBe('urgent');
    expect(updated.tags).toEqual(['AI']);
    expect(updated.status).toBe('done');
    expect(updated.order).toBeGreaterThanOrEqual(doneCount);
  });

  it('跨列移动：状态切换、追加到列尾并记录活动', () => {
    const store = useTaskStore();
    const projectStore = useProjectStore();
    const id = 't-pos-1';

    store.moveTask(id, 'done');

    const t = store.taskById(id)!;
    expect(t.status).toBe('done');
    expect(t.order).toBeGreaterThanOrEqual(store.tasksInColumn('p-personal-os', 'done').length - 1);
    expect(projectStore.projectActivities('p-personal-os')[0]?.title).toBe('任务移至「已完成」');
  });

  it('移动幂等：同列移动不产生变化与活动', () => {
    const store = useTaskStore();
    const projectStore = useProjectStore();
    const id = 't-pos-2'; // 已是 done
    const orderBefore = store.taskById(id)!.order;
    const actsBefore = projectStore.projectActivities('p-personal-os').length;

    store.moveTask(id, 'done');

    expect(store.taskById(id)!.order).toBe(orderBefore);
    expect(projectStore.projectActivities('p-personal-os').length).toBe(actsBefore);
  });

  it('列内重排：按传入顺序重写 order', () => {
    const store = useTaskStore();
    const ids = store.tasksInColumn('p-personal-os', 'todo').map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);

    store.reorderColumn('p-personal-os', 'todo', [...ids].reverse());

    const after = store.tasksInColumn('p-personal-os', 'todo').map((t) => t.id);
    expect(after).toEqual([...ids].reverse());
    store.tasksInColumn('p-personal-os', 'todo').forEach((t, i) => {
      expect(t.order).toBe(i);
    });
  });

  it('删除任务：移除并记录活动；removeByProject 级联清理', () => {
    const store = useTaskStore();
    const projectStore = useProjectStore();

    store.deleteTask('t-pos-1');
    expect(store.taskById('t-pos-1')).toBeNull();
    expect(projectStore.projectActivities('p-personal-os')[0]?.title).toBe('删除任务');

    const countBefore = store.tasksByProject('p-habit-app').length;
    store.removeByProject('p-habit-app');
    expect(store.tasksByProject('p-habit-app')).toHaveLength(0);
    expect(store.tasks.length).toBe(SEED_TASKS.length - 1 - countBefore);
  });

  it('排序：优先级按 rank、截止日期无值排最后、同键再点翻转方向', () => {
    const store = useTaskStore();
    const rankOf = (p: TaskPriority) => TASK_PRIORITY_META[p].rank;

    // 默认手动排序
    expect(store.sortBy).toBe('order');

    // 按优先级：urgent > high > medium > low（rank 降序）
    store.setSort('priority');
    expect(store.sortBy).toBe('priority');
    expect(store.sortDir).toBe('asc');
    const ranks = store.tasksInColumn('p-personal-os', 'todo').map((t) => rankOf(t.priority));
    expect(ranks).toEqual([...ranks].sort((a, b) => b - a));

    // 同一键再点一次 → 翻转方向
    store.setSort('priority');
    expect(store.sortDir).toBe('desc');
    const descRanks = store.tasksInColumn('p-personal-os', 'todo').map((t) => rankOf(t.priority));
    expect(descRanks).toEqual([...descRanks].sort((a, b) => a - b));

    // 按截止日期：无截止日期的任务排最后
    store.createTask({
      projectId: 'p-personal-os',
      title: '无截止日期的任务',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    store.setSort('dueDate');
    const byDue = store.tasksInColumn('p-personal-os', 'todo');
    expect(byDue[byDue.length - 1]?.title).toBe('无截止日期的任务');
    // 其余任务按日期升序
    const dated = byDue.filter((t) => t.dueDate);
    for (let i = 1; i < dated.length; i += 1) {
      expect(dated[i - 1]!.dueDate! <= dated[i]!.dueDate!).toBe(true);
    }
  });

  it('统计：progress 只计未取消任务，overdue 只计未完成且已过期', () => {
    const store = useTaskStore();
    const stats = store.projectStats('p-personal-os');

    const list = store.tasksByProject('p-personal-os');
    const done = list.filter((t) => t.status === 'done').length;
    const nonCancelled = list.filter((t) => t.status !== 'cancelled').length;
    const overdue = list.filter(
      (t) => t.status !== 'done' && t.dueDate !== undefined && t.dueDate < '2026-08-13',
    ).length;

    expect(stats.total).toBe(list.length);
    expect(stats.done).toBe(done);
    expect(stats.cancelled).toBe(list.filter((t) => t.status === 'cancelled').length);
    expect(stats.progress).toBe(Math.round((done / nonCancelled) * 100));
    expect(stats.overdue).toBe(overdue);
    // 固定时间下：博客项目有一条已逾期任务
    expect(useTaskStore().projectStats('p-blog').overdue).toBe(1);
  });

  it('全局摘要：计数与完成率正确', () => {
    const store = useTaskStore();
    const s = store.summary;
    const nonCancelled = store.tasks.filter((t) => t.status !== 'cancelled').length;
    const done = store.tasks.filter((t) => t.status === 'done').length;

    expect(s.total).toBe(store.tasks.length);
    expect(s.done).toBe(done);
    expect(s.todo).toBe(store.tasks.filter((t) => t.status === 'todo').length);
    expect(s.completion).toBe(Math.round((done / nonCancelled) * 100));
    // 固定时间下：逾期仅 1 条（博客项目迁移任务）
    expect(s.overdue).toBe(1);
  });

  it('持久化：任务与排序策略写入 localStorage，重新加载可恢复', () => {
    const store = useTaskStore();
    store.createTask({
      projectId: 'p-cli-toolkit',
      title: '持久化测试任务',
      priority: 'low',
      status: 'todo',
      tags: [],
    });
    store.setSort('dueDate');

    const raw = localStorage.getItem('personal-os.tasks.v1');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.tasks.length).toBe(SEED_TASKS.length + 1);
    expect(parsed.sortBy).toBe('dueDate');

    setActivePinia(createPinia());
    const reloaded = useTaskStore();
    expect(reloaded.tasks.length).toBe(SEED_TASKS.length + 1);
    expect(reloaded.tasks.some((t) => t.title === '持久化测试任务')).toBe(true);
    expect(reloaded.sortBy).toBe('dueDate');
  });
});
