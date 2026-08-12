import { describe, expect, it } from 'vitest';

import type { TaskItem } from '@/features/tasks/types';
import {
  daysFromToday,
  dueGroupOf,
  filterTasksByDate,
  groupTasksByDue,
  toDateStr,
} from '@/features/tasks/filter';

const TODAY = '2026-08-13';

function makeTask(partial: Partial<TaskItem> & Pick<TaskItem, 'id'>): TaskItem {
  return {
    projectId: 'p-test',
    title: '任务',
    status: 'todo',
    priority: 'medium',
    tags: [],
    order: 0,
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    subtasks: [],
    ...partial,
  };
}

describe('task date filter（纯函数）', () => {
  it('daysFromToday：今天=0，未来为正，过去为负，无日期为 null', () => {
    expect(daysFromToday('2026-08-13', TODAY)).toBe(0);
    expect(daysFromToday('2026-08-20', TODAY)).toBe(7);
    expect(daysFromToday('2026-08-12', TODAY)).toBe(-1);
    expect(daysFromToday(undefined, TODAY)).toBeNull();
    expect(daysFromToday('bad-date', TODAY)).toBeNull();
  });

  it('逾期筛选：仅未完成且截止早于今天的任务', () => {
    const list = [
      makeTask({ id: 'a', dueDate: '2026-08-10' }),
      makeTask({ id: 'b', dueDate: '2026-08-10', status: 'done' }),
      makeTask({ id: 'c', dueDate: '2026-08-13' }),
      makeTask({ id: 'd' }),
    ];
    expect(filterTasksByDate(list, 'overdue', TODAY).map((t) => t.id)).toEqual(['a']);
  });

  it('今天 / 即将到期（7 天内）/ 无截止日期筛选', () => {
    const list = [
      makeTask({ id: 'today', dueDate: '2026-08-13' }),
      makeTask({ id: 'soon', dueDate: '2026-08-14' }),
      makeTask({ id: 'week', dueDate: '2026-08-20' }),
      makeTask({ id: 'later', dueDate: '2026-08-21' }),
      makeTask({ id: 'past', dueDate: '2026-08-01' }),
      makeTask({ id: 'none' }),
    ];
    expect(filterTasksByDate(list, 'today', TODAY).map((t) => t.id)).toEqual(['today']);
    // 即将到期：今天起 7 天内（含今天与第 7 天）
    expect(filterTasksByDate(list, 'upcoming', TODAY).map((t) => t.id)).toEqual([
      'today',
      'soon',
      'week',
    ]);
    expect(filterTasksByDate(list, 'none', TODAY).map((t) => t.id)).toEqual(['none']);
    expect(filterTasksByDate(list, 'all', TODAY)).toHaveLength(6);
  });

  it('dueGroupOf：逾期 < 今天 < 7 天内 < 更晚 < 无日期', () => {
    expect(dueGroupOf('2026-08-01', TODAY)).toBe('overdue');
    expect(dueGroupOf('2026-08-13', TODAY)).toBe('today');
    expect(dueGroupOf('2026-08-19', TODAY)).toBe('upcoming');
    expect(dueGroupOf('2026-08-20', TODAY)).toBe('upcoming');
    expect(dueGroupOf('2026-08-21', TODAY)).toBe('later');
    expect(dueGroupOf(undefined, TODAY)).toBe('none');
  });

  it('groupTasksByDue：按组顺序聚合，空组不出现', () => {
    const list = [
      makeTask({ id: 'n1' }),
      makeTask({ id: 'o1', dueDate: '2026-08-01' }),
      makeTask({ id: 't1', dueDate: '2026-08-13' }),
      makeTask({ id: 'l1', dueDate: '2026-09-01' }),
    ];
    const groups = groupTasksByDue(list, TODAY);
    expect(groups.map((g) => g.group)).toEqual(['overdue', 'today', 'later', 'none']);
    const all = groups.flatMap((g) => g.tasks.map((t) => t.id));
    expect(all.sort()).toEqual(['l1', 'n1', 'o1', 't1']);
  });

  it('toDateStr：本地时区下输出 YYYY-MM-DD', () => {
    expect(toDateStr(new Date(2026, 7, 13))).toBe('2026-08-13');
    expect(toDateStr(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
