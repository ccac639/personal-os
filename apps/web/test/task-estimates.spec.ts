import { describe, expect, it } from 'vitest';

import {
  estimateSummary,
  formatHoursShort,
  taskActualMinutes,
  taskEstimate,
} from '@/features/tasks/estimates';
import type { FocusSession, TaskItem } from '@/features/tasks/types';

function makeTask(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't-1',
    projectId: 'p-1',
    title: '任务',
    description: undefined,
    status: 'todo',
    priority: 'medium',
    dueDate: undefined,
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    tags: [],
    order: 0,
    subtasks: [],
    dependsOn: [],
    ...over,
  };
}

function makeSession(over: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's-1',
    taskId: 't-1',
    startedAt: '2026-08-13T10:00:00+08:00',
    endedAt: '2026-08-13T10:25:00+08:00',
    minutes: 25,
    status: 'completed',
    ...over,
  };
}

describe('任务估时 / 实际投入', () => {
  it('taskActualMinutes = 手动记录 + 专注分钟', () => {
    const t = makeTask({ actualMinutes: 30 });
    const sessions = [makeSession(), makeSession({ id: 's-2', minutes: 15 })];
    expect(taskActualMinutes(t, sessions)).toBe(70);
  });

  it('taskEstimate：有估时返回偏差；无估时 variance 为 null；负值估时视为未设置', () => {
    const sessions = [makeSession({ minutes: 40 })];
    const est = taskEstimate(makeTask({ estimatedMinutes: 120 }), sessions);
    expect(est).toEqual({ estimatedMinutes: 120, actualMinutes: 40, varianceMinutes: 80 });

    const noEst = taskEstimate(makeTask(), sessions);
    expect(noEst.estimatedMinutes).toBeNull();
    expect(noEst.varianceMinutes).toBeNull();

    const invalid = taskEstimate(makeTask({ estimatedMinutes: -10 }), sessions);
    expect(invalid.estimatedMinutes).toBeNull();
  });
});

describe('项目估时偏差汇总', () => {
  it('有估时任务：Σ估时 / Σ实际 / 偏差方向', () => {
    const tasks = [
      makeTask({ id: 'a', estimatedMinutes: 120 }),
      makeTask({ id: 'b', estimatedMinutes: 60 }),
      makeTask({ id: 'c' }), // 无估时，不计入估时但计入实际
    ];
    const sessions = [
      makeSession({ id: 's1', taskId: 'a', minutes: 30 }),
      makeSession({ id: 's2', taskId: 'c', minutes: 10 }),
    ];
    const sum = estimateSummary(tasks, sessions);
    expect(sum.estimatedCount).toBe(2);
    expect(sum.estimatedMinutes).toBe(180);
    expect(sum.actualMinutes).toBe(40);
    expect(sum.varianceMinutes).toBe(140);
    expect(sum.varianceDirection).toBe('ahead');
  });

  it('实际投入超出估时 → behind', () => {
    const tasks = [makeTask({ estimatedMinutes: 60 })];
    const sessions = [makeSession({ minutes: 120 })];
    const sum = estimateSummary(tasks, sessions);
    expect(sum.varianceMinutes).toBe(-60);
    expect(sum.varianceDirection).toBe('behind');
  });

  it('无估时任务：direction = none，variance = null', () => {
    const sum = estimateSummary([makeTask()], []);
    expect(sum).toMatchObject({
      estimatedCount: 0,
      estimatedMinutes: 0,
      varianceMinutes: null,
      varianceDirection: 'none',
    });
  });

  it('已取消任务不计入实际投入', () => {
    const tasks = [
      makeTask({ id: 'a', estimatedMinutes: 60 }),
      makeTask({ id: 'b', status: 'cancelled', estimatedMinutes: 60 }),
    ];
    const sessions = [makeSession({ taskId: 'b', minutes: 200 })];
    const sum = estimateSummary(tasks, sessions);
    expect(sum.actualMinutes).toBe(0);
    expect(sum.estimatedMinutes).toBe(60);
  });

  it('formatHoursShort 人类可读', () => {
    expect(formatHoursShort(0)).toBe('0 分钟');
    expect(formatHoursShort(60)).toBe('1 小时');
    expect(formatHoursShort(90)).toBe('1.5 小时');
  });
});
