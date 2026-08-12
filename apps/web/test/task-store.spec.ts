import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { TaskPriority } from '@personal-os/types';

import { useProjectStore } from '@/features/projects/store';
import { TASKS_KEY, TASKS_LEGACY_KEY, TASKS_VERSION } from '@/features/tasks/persistence';
import { useTaskStore } from '@/features/tasks/store';
import { SEED_TASKS } from '@/features/tasks/mock';
import { subtaskStats } from '@/features/tasks/subtasks';
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

  it('持久化：任务与排序策略写入 localStorage（版本信封），重新加载可恢复', () => {
    const store = useTaskStore();
    store.createTask({
      projectId: 'p-cli-toolkit',
      title: '持久化测试任务',
      priority: 'low',
      status: 'todo',
      tags: [],
    });
    store.setSort('dueDate');

    const raw = localStorage.getItem(TASKS_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.version).toBe(TASKS_VERSION);
    expect(envelope.data.tasks.length).toBe(SEED_TASKS.length + 1);
    expect(envelope.data.sortBy).toBe('dueDate');

    setActivePinia(createPinia());
    const reloaded = useTaskStore();
    expect(reloaded.tasks.length).toBe(SEED_TASKS.length + 1);
    expect(reloaded.tasks.some((t) => t.title === '持久化测试任务')).toBe(true);
    expect(reloaded.sortBy).toBe('dueDate');
  });

  it('子任务：添加 / 完成 / 删除，父任务所属列不变，完成状态计入任务进度', () => {
    const store = useTaskStore();
    const id = 't-pos-3'; // todo 列
    const columnBefore = store.taskById(id)!.status;

    store.addSubtask(id, '拆分子步骤');
    const t = store.taskById(id)!;
    expect(t.subtasks).toHaveLength(3); // 种子已有 2 条
    const added = t.subtasks[t.subtasks.length - 1]!;
    expect(added.done).toBe(false);

    store.toggleSubtask(id, added.id);
    expect(store.taskById(id)!.subtasks.find((s) => s.id === added.id)?.done).toBe(true);
    // 父任务仍在原列
    expect(store.taskById(id)!.status).toBe(columnBefore);

    const stats = subtaskStats(store.taskById(id)!);
    expect(stats.total).toBe(3);
    expect(stats.done).toBe(2);
    expect(stats.progress).toBe(67);

    store.removeSubtask(id, added.id);
    expect(store.taskById(id)!.subtasks.some((s) => s.id === added.id)).toBe(false);
  });

  it('活动历史：创建 / 更新 / 移动 / 子任务都会记录，新的在前', () => {
    const store = useTaskStore();
    const task = store.createTask({
      projectId: 'p-nas-monitor',
      title: '历史测试任务',
      priority: 'low',
      status: 'todo',
      tags: [],
    });
    store.updateTask(task.id, {
      projectId: 'p-nas-monitor',
      title: '历史测试任务（改）',
      priority: 'high',
      status: 'todo',
      tags: [],
    });
    store.moveTask(task.id, 'done');
    store.addSubtask(task.id, '小步骤');

    const evts = store.taskEvents(task.id);
    expect(evts).toHaveLength(4);
    expect(evts[0]?.type).toBe('subtask');
    expect(evts.map((e) => e.type)).toEqual(
      expect.arrayContaining(['created', 'updated', 'moved', 'subtask']),
    );
    // 按时间倒序
    for (let i = 1; i < evts.length; i += 1) {
      expect(evts[i - 1]!.createdAt >= evts[i]!.createdAt).toBe(true);
    }
  });

  it('日期筛选：store 内 dateFilter 作用于可见列，原始列不受影响', () => {
    const store = useTaskStore();
    const all = store.tasksInColumn('p-personal-os', 'todo').length;

    store.dateFilter = 'overdue';
    const overdueVisible = store.visibleColumnTasks('p-personal-os', 'todo');
    expect(overdueVisible.length).toBeLessThan(all);
    for (const t of overdueVisible) {
      expect(t.status).not.toBe('done');
      expect(t.dueDate !== undefined && t.dueDate < '2026-08-13').toBe(true);
    }

    store.dateFilter = 'none';
    const noneVisible = store.visibleColumnTasks('p-personal-os', 'todo');
    for (const t of noneVisible) expect(t.dueDate).toBeUndefined();

    // 原始列仍返回全部任务（既有 API 不变）
    store.dateFilter = 'overdue';
    expect(store.tasksInColumn('p-personal-os', 'todo').length).toBe(all);
  });

  it('批量移动：全部迁移状态并支持撤销恢复原列与原顺序', () => {
    const store = useTaskStore();
    const ids = store
      .tasksByProject('p-personal-os')
      .filter((t) => t.status === 'todo')
      .map((t) => t.id);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    const before = store
      .tasksByProject('p-personal-os')
      .map((t) => ({ id: t.id, status: t.status, order: t.order }));

    store.batchMove(ids, 'done');
    for (const id of ids) expect(store.taskById(id)?.status).toBe('done');
    expect(store.undoInfo).not.toBeNull();

    store.undo();
    const after = store
      .tasksByProject('p-personal-os')
      .map((t) => ({ id: t.id, status: t.status, order: t.order }));
    expect(after).toEqual(before);
    expect(store.undoInfo).toBeNull();
  });

  it('批量设置优先级 / 标签：生效且可撤销', () => {
    const store = useTaskStore();
    const ids = store.tasksByProject('p-nas-monitor').map((t) => t.id);

    store.batchSetPriority(ids, 'urgent');
    for (const id of ids) expect(store.taskById(id)?.priority).toBe('urgent');

    store.batchAddTag(ids, '批量标签');
    for (const id of ids) expect(store.taskById(id)?.tags).toContain('批量标签');

    store.batchRemoveTag(ids, '批量标签');
    for (const id of ids) expect(store.taskById(id)?.tags).not.toContain('批量标签');

    store.undo();
    for (const id of ids) expect(store.taskById(id)?.tags).toContain('批量标签');
  });

  it('批量删除：移除全部选中任务，撤销恢复', () => {
    const store = useTaskStore();
    const ids = store.tasksByProject('p-nas-monitor').map((t) => t.id);
    const totalBefore = store.tasks.length;

    store.batchDelete(ids);
    expect(store.taskById(ids[0]!)).toBeNull();
    expect(store.tasks.length).toBe(totalBefore - ids.length);
    expect(store.taskEvents(ids[0]!)).toHaveLength(0); // 事件级联清理

    store.undo();
    expect(store.tasks.length).toBe(totalBefore);
    expect(store.taskById(ids[0]!)).not.toBeNull();
  });

  it('拖拽撤销：跨列移动与列内重排均可恢复到原始状态', () => {
    const store = useTaskStore();
    const id = 't-pos-1';
    const before = { status: store.taskById(id)!.status, order: store.taskById(id)!.order };

    store.moveTask(id, 'done');
    expect(store.taskById(id)?.status).toBe('done');
    store.undo();
    expect(store.taskById(id)?.status).toBe(before.status);
    expect(store.taskById(id)?.order).toBe(before.order);

    // 列内重排撤销
    const ids = store.tasksInColumn('p-personal-os', 'todo').map((t) => t.id);
    const ordersBefore = new Map(ids.map((tid) => [tid, store.taskById(tid)!.order]));
    store.reorderColumn('p-personal-os', 'todo', [...ids].reverse());
    store.undo();
    for (const tid of ids) {
      expect(store.taskById(tid)!.order).toBe(ordersBefore.get(tid));
    }
  });

  it('损坏数据安全恢复：JSON 损坏回退种子并给出提示', () => {
    localStorage.setItem(TASKS_KEY, 'not-json{{{');
    const store = useTaskStore();
    expect(store.tasks.length).toBe(SEED_TASKS.length);
    expect(store.storageWarning).toContain('无法读取');
  });

  it('损坏数据安全恢复：结构校验失败（任务缺字段）回退种子', () => {
    localStorage.setItem(
      TASKS_KEY,
      JSON.stringify({
        version: TASKS_VERSION,
        data: { tasks: [{ id: 'x', title: 1 }], events: [], sortBy: 'order', sortDir: 'asc' },
      }),
    );
    const store = useTaskStore();
    expect(store.tasks.length).toBe(SEED_TASKS.length);
    expect(store.storageWarning).not.toBeNull();
  });

  it('版本过新：拒绝读取并回退种子，提示升级', () => {
    localStorage.setItem(
      TASKS_KEY,
      JSON.stringify({ version: TASKS_VERSION + 1, data: { tasks: [], events: [] } }),
    );
    const store = useTaskStore();
    expect(store.tasks.length).toBe(SEED_TASKS.length);
    expect(store.storageWarning).toContain('版本过新');
  });

  it('旧版本迁移：v1 数据自动升级为 v2（补 subtasks / events），旧 key 保留', () => {
    // 模拟 v1 数据：无 subtasks / events 字段
    const legacy = {
      tasks: SEED_TASKS.map((t) => ({
        id: t.id,
        projectId: t.projectId,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        tags: t.tags,
        order: t.order,
      })),
      sortBy: 'priority',
      sortDir: 'desc',
    };
    localStorage.setItem(TASKS_LEGACY_KEY, JSON.stringify(legacy));

    const store = useTaskStore();
    expect(store.tasks.length).toBe(SEED_TASKS.length);
    expect(store.sortBy).toBe('priority');
    expect(store.sortDir).toBe('desc');
    for (const t of store.tasks) expect(Array.isArray(t.subtasks)).toBe(true);
    expect(store.storageWarning).toContain('旧版本升级');

    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(TASKS_VERSION);
    expect(localStorage.getItem(TASKS_LEGACY_KEY)).not.toBeNull();

    setActivePinia(createPinia());
    expect(useTaskStore().storageWarning).toBeNull();
  });

  it('写入失败不阻塞页面：操作仍在内存生效，并给出存储提示', () => {
    const store = useTaskStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    try {
      store.createTask({
        projectId: 'p-blog',
        title: '写失败的任务',
        priority: 'medium',
        status: 'todo',
        tags: [],
      });
    } finally {
      spy.mockRestore();
    }
    expect(store.tasks.some((t) => t.title === '写失败的任务')).toBe(true);
    expect(store.storageWarning).toContain('存储空间不足');
  });
});
