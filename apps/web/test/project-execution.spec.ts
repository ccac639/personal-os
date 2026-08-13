import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useWeeklyGoalStore } from '@/features/projects/weekly-goals-store';
import {
  buildThroughput,
  buildPriorities,
  weekStartOf,
  weekProgress,
  trimWeeklyGoalHistory,
  WEEKLY_GOAL_HISTORY_LIMIT,
} from '@/features/projects/execution';
import type { WeeklyGoal } from '@/features/projects/execution';

describe('执行仪表盘纯函数', () => {
  const today = '2026-08-13';

  function mkTask(over: Record<string, unknown>): Record<string, unknown> {
    return {
      id: 't-1',
      projectId: 'p-1',
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

  it('buildThroughput：近 7/30 天完成、创建、延期、专注', () => {
    const tasks = [
      mkTask({ id: 'a', status: 'done', updatedAt: '2026-08-10T10:00:00+08:00' }), // 7d 内完成
      mkTask({ id: 'b', status: 'done', updatedAt: '2026-07-20T10:00:00+08:00' }), // 30d 内完成
      mkTask({ id: 'c', status: 'done', updatedAt: '2026-06-01T10:00:00+08:00' }), // 窗口外
      mkTask({
        id: 'd',
        status: 'todo',
        dueDate: '2026-08-01',
        updatedAt: '2026-08-11T10:00:00+08:00',
      }), // 7d 内延期
      mkTask({
        id: 'e',
        status: 'todo',
        dueDate: '2026-07-01',
        updatedAt: '2026-08-03T10:00:00+08:00',
      }), // 30d 内延期
      mkTask({ id: 'f', createdAt: '2026-08-12T10:00:00+08:00' }), // 7d 内创建
      mkTask({ id: 'g', createdAt: '2026-07-25T10:00:00+08:00' }), // 30d 内创建
    ] as never;
    const sessions = [
      {
        id: 's1',
        taskId: 'a',
        minutes: 30,
        endedAt: '2026-08-11T10:00:00+08:00',
        status: 'completed',
      },
      {
        id: 's2',
        taskId: 'a',
        minutes: 20,
        endedAt: '2026-07-25T10:00:00+08:00',
        status: 'completed',
      },
    ] as never;

    const tp = buildThroughput(tasks as never, sessions as never, today);
    expect(tp.done7d).toBe(1);
    expect(tp.done30d).toBe(2);
    expect(tp.created7d).toBe(1);
    expect(tp.created30d).toBe(7); // a-e 默认 createdAt 08-01 + f/g 均在 30d 窗口
    expect(tp.delayed7d).toBe(1);
    expect(tp.delayed30d).toBe(2);
    expect(tp.focusMinutes7d).toBe(30);
    expect(tp.focusMinutes30d).toBe(50);
  });

  it('buildPriorities：今日计划 / 本周截止 / 逾期 / 受阻 / 长期未活动', () => {
    const projects = [
      { id: 'p-1', name: 'P1', status: 'active' },
      { id: 'p-2', name: 'P2', status: 'archived' },
    ] as never;
    const tasks = [
      mkTask({ id: 't-today', projectId: 'p-1', status: 'todo' }),
      mkTask({ id: 't-week', projectId: 'p-1', status: 'todo', dueDate: '2026-08-14' }), // 本周五
      mkTask({ id: 't-overdue', projectId: 'p-1', status: 'todo', dueDate: '2026-08-01' }),
      mkTask({ id: 't-blocked', projectId: 'p-1', status: 'todo', dependsOn: ['t-dep'] }),
      mkTask({ id: 't-dep', projectId: 'p-1', status: 'todo' }),
    ] as never;
    const rows = buildPriorities({
      tasks: tasks as never,
      projects: projects as never,
      focus: [{ taskId: 't-today', plannedMinutes: 25 }],
      focusDone: [],
      today,
      latestActivityAt: new Map([
        ['p-1', '2026-07-01T00:00:00+08:00'], // 43 天前 → 长期未活动
      ]),
      staleDays: 14,
    });

    expect(rows.find((r) => r.kind === 'today')?.count).toBe(1);
    expect(rows.find((r) => r.kind === 'week-due')?.count).toBe(1);
    expect(rows.find((r) => r.kind === 'overdue')?.count).toBe(1);
    expect(rows.find((r) => r.kind === 'blocked')?.count).toBe(1);
    expect(rows.find((r) => r.kind === 'stale')?.count).toBe(1);
    // 已归档项目任务不计入
    const archived = buildPriorities({
      tasks: [
        mkTask({ id: 'x', projectId: 'p-2', dueDate: '2026-08-01', status: 'todo' }),
      ] as never,
      projects: projects as never,
      focus: [],
      focusDone: [],
      today,
      latestActivityAt: new Map(),
    });
    expect(archived.find((r) => r.kind === 'overdue')?.count ?? 0).toBe(0);
  });

  it('buildPriorities：空数据不产生虚假行', () => {
    const rows = buildPriorities({
      tasks: [],
      projects: [],
      focus: [],
      focusDone: [],
      today,
      latestActivityAt: new Map(),
    });
    expect(rows).toEqual([]);
  });

  it('周目标：weekStartOf / weekProgress / 历史裁剪', () => {
    expect(weekStartOf('2026-08-13')).toBe('2026-08-10'); // 周四 → 周一
    expect(weekStartOf('2026-08-16')).toBe('2026-08-10'); // 周日仍属本周
    expect(weekStartOf('2026-08-17')).toBe('2026-08-17'); // 下周一

    const goal: WeeklyGoal = {
      id: 'wg-1',
      projectId: 'p-1',
      weekStart: '2026-08-10',
      description: '完成迁移',
      targetTasks: 4,
      targetFocusMinutes: 200,
      createdAt: '2026-08-10T00:00:00+08:00',
      updatedAt: '2026-08-10T00:00:00+08:00',
    };
    const tasks = [
      mkTask({ id: 'a', status: 'done', updatedAt: '2026-08-11T10:00:00+08:00' }),
      mkTask({ id: 'b', status: 'done', updatedAt: '2026-08-12T10:00:00+08:00' }),
      mkTask({ id: 'c', status: 'done', updatedAt: '2026-08-05T10:00:00+08:00' }), // 上周完成不计
    ] as never;
    const sessions = [
      {
        id: 's1',
        taskId: 'a',
        minutes: 80,
        endedAt: '2026-08-11T10:00:00+08:00',
        status: 'completed',
      },
      {
        id: 's2',
        taskId: 'b',
        minutes: 40,
        endedAt: '2026-08-12T10:00:00+08:00',
        status: 'completed',
      },
    ] as never;

    const p = weekProgress(goal, tasks as never, sessions as never, today);
    expect(p.doneTasks).toBe(2);
    expect(p.focusMinutes).toBe(120);
    expect(p.taskProgress).toBe(50);
    expect(p.focusProgress).toBe(60);
    expect(p.overall).toBe(55);
    // 周四已过周中且进度 < 70% → behind
    expect(p.risk).toBe('behind');
  });

  it('周目标历史裁剪：保留最近 N 条', () => {
    const goals: WeeklyGoal[] = Array.from({ length: 20 }, (_, i) => ({
      id: `wg-${i}`,
      projectId: 'p-1',
      weekStart: `2026-01-${String(1 + i).padStart(2, '0')}`,
      description: '',
      targetTasks: 1,
      targetFocusMinutes: 60,
      createdAt: '',
      updatedAt: '',
    }));
    const trimmed = trimWeeklyGoalHistory(goals);
    expect(trimmed).toHaveLength(WEEKLY_GOAL_HISTORY_LIMIT);
    expect(trimmed[0]!.weekStart).toBe('2026-01-20'); // 最近在前
  });
});

describe('执行仪表盘 store 集成（周目标）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('周目标：设定 / 历史保留 / 删除 / 存储失败提示', () => {
    const ps = useProjectStore();
    const p = ps.createProject({ name: 'P', status: 'active', tags: [], techStack: [] });
    const gs = useWeeklyGoalStore();

    const g = gs.setGoal({
      projectId: p.id,
      weekStart: '2026-08-10',
      description: '本周目标',
      targetTasks: 3,
      targetFocusMinutes: 150,
    });
    expect(gs.currentGoalOf(p.id, '2026-08-13')?.id).toBe(g.id);
    expect(gs.historyOf(p.id, '2026-08-13')).toHaveLength(0);

    // 上周目标进历史
    gs.setGoal({
      projectId: p.id,
      weekStart: '2026-08-03',
      description: '上周目标',
      targetTasks: 2,
      targetFocusMinutes: 100,
    });
    expect(gs.historyOf(p.id, '2026-08-13')).toHaveLength(1);

    // 删除
    gs.deleteGoal(g.id);
    expect(gs.currentGoalOf(p.id, '2026-08-13')).toBeNull();
  });
});
