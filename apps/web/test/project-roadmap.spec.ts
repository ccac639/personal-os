import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import {
  addDays,
  buildTimelineCells,
  collectPlanDates,
  dayDiff,
  isValidDateStr,
  milestoneBar,
  planMissingInfo,
  timelinePosition,
  timelineWindow,
  toDateStr,
} from '@/features/projects/plan';
import type { Milestone, ProjectDetail } from '@/features/projects/types';

function makeProject(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-1',
    name: '测试项目',
    description: undefined,
    status: 'active',
    ownerId: 'me',
    tags: [],
    techStack: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    favorite: false,
    progressMode: 'auto',
    startDate: '2026-08-01',
    targetDate: '2026-09-30',
    ...over,
  };
}

function makeMilestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms-1',
    projectId: 'p-1',
    title: '里程碑',
    status: 'in-progress',
    order: 0,
    taskIds: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

describe('plan 日期工具', () => {
  it('isValidDateStr：真实日期通过，伪造日期与非法输入拒绝', () => {
    expect(isValidDateStr('2026-08-13')).toBe(true);
    expect(isValidDateStr('2026-02-30')).toBe(false);
    expect(isValidDateStr('2026-8-3')).toBe(false);
    expect(isValidDateStr(undefined)).toBe(false);
    expect(isValidDateStr(123)).toBe(false);
    expect(isValidDateStr(null)).toBe(false);
  });

  it('toDateStr / addDays / dayDiff', () => {
    expect(toDateStr(new Date(2026, 7, 3))).toBe('2026-08-03');
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(dayDiff('2026-08-01', '2026-08-13')).toBe(12);
  });
});

describe('路线图时间轴纯函数', () => {
  it('timelineWindow：项目日期跨度', () => {
    const w = timelineWindow(makeProject(), []);
    expect(w).toEqual({ start: '2026-08-01', end: '2026-09-30', spanDays: 60 });
  });

  it('timelineWindow：缺失项目日期时用里程碑日期推断', () => {
    const p = makeProject({ startDate: undefined, targetDate: undefined });
    const ms = [makeMilestone({ startDate: '2026-08-10', dueDate: '2026-08-20' })];
    const w = timelineWindow(p, ms);
    expect(w?.start).toBe('2026-08-10');
    expect(w?.end).toBe('2026-08-20');
  });

  it('timelineWindow：有效日期不足两个时返回 null（降级列表模式）', () => {
    expect(
      timelineWindow(makeProject({ startDate: undefined, targetDate: undefined }), []),
    ).toBeNull();
    expect(
      timelineWindow(makeProject({ startDate: '2026-08-01', targetDate: '2026-08-01' }), []),
    ).toBeNull();
  });

  it('collectPlanDates：去重升序收集项目与里程碑日期', () => {
    const p = makeProject();
    const ms = [
      makeMilestone({ startDate: '2026-09-01', dueDate: '2026-09-01' }),
      makeMilestone({ startDate: '2026-08-15', dueDate: undefined }),
    ];
    expect(collectPlanDates(p, ms)).toEqual([
      '2026-08-01',
      '2026-08-15',
      '2026-09-01',
      '2026-09-30',
    ]);
  });

  it('buildTimelineCells：day / week / month 刻度覆盖窗口并标记今天', () => {
    const days = buildTimelineCells('2026-08-01', '2026-08-03', 'day', '2026-08-02');
    expect(days.map((c) => c.date)).toEqual(['2026-08-01', '2026-08-02', '2026-08-03']);
    expect(days.find((c) => c.isToday)?.date).toBe('2026-08-02');

    const weeks = buildTimelineCells('2026-08-01', '2026-08-22', 'week', '2026-08-13');
    expect(weeks.length).toBeGreaterThanOrEqual(4);

    const months = buildTimelineCells('2026-08-01', '2026-10-31', 'month', '2026-08-13');
    expect(months.map((c) => c.label)).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('timelinePosition：窗口内定位与越界收敛', () => {
    const w = { start: '2026-08-01', end: '2026-08-11', spanDays: 10 };
    const mid = timelinePosition('2026-08-06', w);
    expect(parseFloat(mid.left)).toBeCloseTo(50, 0);
    // 越界：早于窗口起点 / 晚于窗口终点 → 收敛到 0-100
    expect(parseFloat(timelinePosition('2026-07-01', w).left)).toBe(0);
    expect(parseFloat(timelinePosition('2026-12-31', w).left)).toBeLessThanOrEqual(100);
  });

  it('milestoneBar：无日期返回 null（禁止强行绘制）', () => {
    const w = { start: '2026-08-01', end: '2026-09-30', spanDays: 60 };
    expect(milestoneBar(makeMilestone({ startDate: undefined, dueDate: undefined }), w)).toBeNull();
    expect(milestoneBar(makeMilestone({ dueDate: '2026-09-01' }), w)).not.toBeNull();
  });

  it('planMissingInfo：缺失字段说明（有窗口但缺日期时仍给出提示）', () => {
    const info = planMissingInfo(makeProject({ startDate: undefined }), [
      makeMilestone({ id: 'ms-a', startDate: '2026-09-01', dueDate: '2026-09-10' }),
      makeMilestone({ id: 'ms-b', startDate: undefined, dueDate: undefined }),
    ]);
    // 有 ms-a 与 targetDate 两个日期 → 可绘制窗口
    expect(info.hasWindow).toBe(true);
    expect(info.missing.join(' ')).toContain('开始日期');
    expect(info.missing.join(' ')).toContain('里程碑未设置日期');
  });
});

describe('里程碑拖拽：排序与日期变更（store）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('reorderMilestones：按拖拽结果重写顺序', () => {
    const store = useProjectStore();
    const a = store.createMilestone('p-1', {
      title: 'A',
      status: 'in-progress',
      taskIds: [],
    });
    const b = store.createMilestone('p-1', {
      title: 'B',
      status: 'in-progress',
      taskIds: [],
    });
    const c = store.createMilestone('p-1', {
      title: 'C',
      status: 'in-progress',
      taskIds: [],
    });
    store.reorderMilestones('p-1', [c.id, a.id, b.id]);
    expect(store.milestoneById(a.id)!.order).toBe(1);
    expect(store.milestoneById(b.id)!.order).toBe(2);
    expect(store.milestoneById(c.id)!.order).toBe(0);
  });

  it('updateMilestoneDates：调整截止日期；startDate 晚于 dueDate 时自动校正', () => {
    const store = useProjectStore();
    const m = store.createMilestone('p-1', {
      title: 'M',
      status: 'in-progress',
      taskIds: [],
      startDate: '2026-09-01',
      dueDate: '2026-09-15',
    });
    store.updateMilestoneDates(m.id, { dueDate: '2026-08-20' });
    const updated = store.milestoneById(m.id)!;
    expect(updated.dueDate).toBe('2026-08-20');
    expect(updated.startDate).toBe('2026-08-20'); // 校正：start ≤ due

    // 非法日期忽略
    store.updateMilestoneDates(m.id, { dueDate: '2026-13-99' });
    expect(store.milestoneById(m.id)!.dueDate).toBe('2026-08-20');
  });

  it('删除任务后里程碑引用级联清理（cleanupMilestoneRefs）', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    const m = store.createMilestone('p-1', {
      title: 'M',
      status: 'in-progress',
      taskIds: ['t-gone', 't-keep'],
    });
    // 模拟任务只存在 t-keep
    taskStore.createTask({
      projectId: 'p-1',
      title: '保留任务',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const keptId = taskStore.tasks[0]!.id;
    // 手动把里程碑关联到真实任务
    store.updateMilestone(m.id, {
      title: 'M',
      status: 'in-progress',
      taskIds: ['t-gone', keptId],
    });
    taskStore.deleteTask(keptId);
    expect(store.milestoneById(m.id)!.taskIds).toEqual([]);
  });
});
