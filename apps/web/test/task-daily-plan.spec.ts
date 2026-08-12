import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useTaskStore } from '@/features/tasks/store';
import { useProjectStore } from '@/features/projects/store';
import { archivePlanDay, focusStreak, mergePlanItems, migrateUndone } from '@/features/tasks/focus';
import type { FocusPlanDay, FocusSession, TaskItem } from '@/features/tasks/types';

function makeSession(over: Partial<FocusSession>): FocusSession {
  return {
    id: 's',
    taskId: 't-1',
    startedAt: '2026-08-13T10:00:00+08:00',
    endedAt: '2026-08-13T10:25:00+08:00',
    minutes: 25,
    status: 'completed',
    ...over,
  };
}

describe('每日计划纯函数', () => {
  it('focusStreak：从今天回数连续完成专注的天数；今天未专注从昨天开始（不断签）', () => {
    // 今天 08-13 有专注 → 从 08-13 回数：13,12,11 共 3 天
    const sessions = [
      makeSession({ id: 'a', endedAt: '2026-08-13T10:00:00+08:00' }),
      makeSession({ id: 'b', endedAt: '2026-08-12T10:00:00+08:00' }),
      makeSession({ id: 'c', endedAt: '2026-08-11T10:00:00+08:00' }),
    ];
    expect(focusStreak(sessions, '2026-08-13')).toBe(3);

    // 中间断一天 → 2
    const broken = [
      makeSession({ id: 'a', endedAt: '2026-08-13T10:00:00+08:00' }),
      makeSession({ id: 'b', endedAt: '2026-08-11T10:00:00+08:00' }),
    ];
    expect(focusStreak(broken, '2026-08-13')).toBe(1);

    // 今天无专注，昨天有 → 从昨天数（1）
    const todayMiss = [makeSession({ id: 'a', endedAt: '2026-08-12T10:00:00+08:00' })];
    expect(focusStreak(todayMiss, '2026-08-13')).toBe(1);

    // 今天与昨天都无专注 → 0
    expect(
      focusStreak([makeSession({ id: 'a', endedAt: '2026-08-10T10:00:00+08:00' })], '2026-08-13'),
    ).toBe(0);

    // abandoned 不算
    expect(
      focusStreak(
        [makeSession({ id: 'a', endedAt: '2026-08-13T10:00:00+08:00', status: 'abandoned' })],
        '2026-08-13',
      ),
    ).toBe(0);
  });

  it('archivePlanDay：生成归档日计划（去重 doneIds）', () => {
    const day = archivePlanDay(
      '2026-08-12',
      [{ taskId: 'a', plannedMinutes: 25 }],
      ['a', 'a', 'b'],
    );
    expect(day).toEqual({
      date: '2026-08-12',
      items: [{ taskId: 'a', plannedMinutes: 25 }],
      doneIds: ['a', 'b'],
    });
  });

  it('migrateUndone：只迁移未勾选完成的项', () => {
    const day: FocusPlanDay = {
      date: '2026-08-12',
      items: [
        { taskId: 'a', plannedMinutes: 25 },
        { taskId: 'b', plannedMinutes: 40 },
      ],
      doneIds: ['a'],
    };
    expect(migrateUndone(day)).toEqual([{ taskId: 'b', plannedMinutes: 40 }]);
  });

  it('mergePlanItems：按 taskId 去重合并，保序', () => {
    expect(
      mergePlanItems(
        [{ taskId: 'a', plannedMinutes: 25 }],
        [
          { taskId: 'b', plannedMinutes: 30 },
          { taskId: 'a', plannedMinutes: 50 },
        ],
      ),
    ).toEqual([
      { taskId: 'a', plannedMinutes: 25 },
      { taskId: 'b', plannedMinutes: 30 },
    ]);
  });
});

describe('每日计划 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  /** 确保项目存在（loadTaskState 会清理指向不存在项目的任务） */
  function ensureProject(): string {
    const ps = useProjectStore();
    let p = ps.projects.find((x) => x.name === '测试项目');
    if (!p) p = ps.createProject({ name: '测试项目', status: 'active', tags: [], techStack: [] });
    return p.id;
  }

  function seedTask(store: ReturnType<typeof useTaskStore>, title: string): TaskItem {
    return store.createTask({
      projectId: ensureProject(),
      title,
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
  }

  it('togglePlanDone：勾选 / 取消今日计划完成（不改变看板状态）', () => {
    const store = useTaskStore();
    const t = seedTask(store, '任务A');
    expect(store.isPlanDone(t.id)).toBe(false);
    store.togglePlanDone(t.id);
    expect(store.isPlanDone(t.id)).toBe(true);
    expect(store.taskById(t.id)!.status).toBe('todo'); // 看板列不变
    store.togglePlanDone(t.id);
    expect(store.isPlanDone(t.id)).toBe(false);
  });

  it('archiveToday：归档今日计划（含完成状态）并清空今日', () => {
    const store = useTaskStore();
    const a = seedTask(store, 'A');
    const b = seedTask(store, 'B');
    store.addToFocus(a.id, 25);
    store.addToFocus(b.id, 40);
    store.togglePlanDone(a.id);

    store.archiveToday();
    expect(store.focus).toEqual([]);
    expect(store.focusDone).toEqual([]);
    expect(store.focusHistory).toHaveLength(1);
    expect(store.focusHistory[0]!.doneIds).toEqual([a.id]);
    expect(store.focusHistory[0]!.items.map((i) => i.taskId)).toEqual([a.id, b.id]);
  });

  it('rolloverPending：把最近历史日未完成项迁移到今天（去重），不修改历史', () => {
    const store = useTaskStore();
    const a = seedTask(store, 'A');
    const b = seedTask(store, 'B');
    store.addToFocus(a.id, 25);
    store.addToFocus(b.id, 25);
    store.togglePlanDone(a.id);
    store.archiveToday();

    // 今天为空，历史日有 1 项未完成（b）
    const added = store.rolloverPending();
    expect(added).toBe(1);
    expect(store.focus.map((f) => f.taskId)).toEqual([b.id]);
    // 历史记录不变
    expect(store.focusHistory[0]!.items).toHaveLength(2);

    // 再次迁移：无新增
    expect(store.rolloverPending()).toBe(0);
  });

  it('完成专注自动累加实际投入（actualMinutes）', () => {
    const store = useTaskStore();
    const t = seedTask(store, '专注任务');
    store.startFocus(t.id);
    store.completeFocus();
    const minutes = store.focusSessions[0]!.minutes;
    expect(store.taskById(t.id)!.actualMinutes).toBe(minutes);
    // 专注记录与会话都存在
    expect(store.focusSessions).toHaveLength(1);
  });

  it('删除任务级联清理每日计划（今日 + 历史）', () => {
    const store = useTaskStore();
    const a = seedTask(store, 'A');
    const b = seedTask(store, 'B');
    store.addToFocus(a.id, 25);
    store.addToFocus(b.id, 25);
    store.togglePlanDone(b.id);
    store.archiveToday();

    store.deleteTask(a.id);
    // 今日无 a（已归档）→ 历史中 a 被清理
    expect(store.focusHistory[0]!.items.map((i) => i.taskId)).toEqual([b.id]);

    store.deleteTask(b.id);
    expect(store.focusHistory).toEqual([]);
  });

  it('迁移/存储失败提示与每日计划持久化恢复', () => {
    const store = useTaskStore();
    const a = seedTask(store, 'A');
    store.addToFocus(a.id, 25);
    store.togglePlanDone(a.id);
    // 重新挂载 store（模拟刷新）：每日计划与完成状态恢复
    setActivePinia(createPinia());
    const reloaded = useTaskStore();
    const reloadedA = reloaded.tasks.find((t) => t.title === 'A');
    expect(reloadedA).toBeTruthy();
    expect(reloaded.focus.some((f) => f.taskId === reloadedA!.id)).toBe(true);
    expect(reloaded.isPlanDone(reloadedA!.id)).toBe(true);
  });
});
