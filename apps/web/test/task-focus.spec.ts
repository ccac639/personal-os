import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { FOCUS_MAX } from '@/features/tasks/types';
import {
  settleMs,
  msToMinutes,
  formatTimer,
  pausedFocus,
  resumedFocus,
} from '@/features/tasks/focus';

describe('focus 纯函数', () => {
  it('settleMs / msToMinutes / formatTimer', () => {
    const focus = {
      taskId: 't1',
      startedAt: '2026-08-13T12:00:00+08:00',
      accumulatedMs: 90_000,
      status: 'running' as const,
      lastResumeAt: '2026-08-13T12:00:10+08:00',
    };
    const now = new Date('2026-08-13T12:01:10+08:00').getTime(); // 当前段 60s
    expect(settleMs(focus, now)).toBe(150_000);
    expect(msToMinutes(150_000)).toBe(3);
    expect(formatTimer(150_000)).toBe('02:30');

    // 暂停后不再累加当前段
    const paused = pausedFocus(focus, now);
    expect(paused.status).toBe('paused');
    expect(paused.accumulatedMs).toBe(150_000);
    expect(settleMs(paused, now + 60_000)).toBe(150_000);

    // 继续后恢复计时
    const resumed = resumedFocus(paused, now + 60_000);
    expect(resumed.status).toBe('running');
    expect(settleMs(resumed, now + 120_000)).toBe(210_000);
  });
});

describe('task store 今日聚焦与专注', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function seedTasks(store: ReturnType<typeof useTaskStore>, n: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      ids.push(
        store.createTask({
          projectId: 'p-personal-os',
          title: `任务 ${i}`,
          priority: 'medium',
          status: 'todo',
          tags: [],
        }).id,
      );
    }
    return ids;
  }

  it('今日聚焦：上限 5 个，超限拒绝；重复添加更新预计时长', () => {
    useProjectStore();
    const store = useTaskStore();
    const ids = seedTasks(store, 6);

    for (let i = 0; i < FOCUS_MAX; i++) expect(store.addToFocus(ids[i]!, 25)).toBe(true);
    expect(store.focus).toHaveLength(FOCUS_MAX);
    // 第 6 个拒绝
    expect(store.addToFocus(ids[5]!, 25)).toBe(false);
    expect(store.focusTasks).toHaveLength(FOCUS_MAX);

    // 更新已存在项的预计时长
    expect(store.addToFocus(ids[0]!, 45)).toBe(true);
    expect(store.focus.find((f) => f.taskId === ids[0])?.plannedMinutes).toBe(45);

    store.removeFromFocus(ids[0]!);
    expect(store.focus).toHaveLength(FOCUS_MAX - 1);
  });

  it('专注开始 / 暂停 / 完成：记录实际时长到 sessions，挂活动历史，不自动完成任务', () => {
    useProjectStore();
    const store = useTaskStore();
    const id = seedTasks(store, 1)[0]!;

    expect(store.startFocus(id)).toBe(true);
    expect(store.runningFocus?.status).toBe('running');

    // 运行 30 分钟后暂停
    vi.setSystemTime(new Date('2026-08-13T12:30:00+08:00'));
    store.pauseFocus();
    expect(store.runningFocus?.status).toBe('paused');

    // 暂停 5 分钟后完成（不累加暂停段）
    vi.setSystemTime(new Date('2026-08-13T12:35:00+08:00'));
    const session = store.completeFocus();
    expect(session?.minutes).toBe(30);
    expect(store.focusSessions).toHaveLength(1);
    expect(store.runningFocus).toBeNull();

    // 任务未被标记完成
    expect(store.taskById(id)?.status).toBe('todo');
    // 活动历史挂 focus 事件
    expect(store.taskEvents(id).some((e) => e.type === 'focus')).toBe(true);
    expect(store.taskFocusMinutes(id)).toBe(30);
    expect(store.lastFocusAt(id)).not.toBeNull();
  });

  it('放弃专注：记录 abandoned session，不改变任务状态', () => {
    useProjectStore();
    const store = useTaskStore();
    const id = seedTasks(store, 1)[0]!;
    store.startFocus(id);
    vi.setSystemTime(new Date('2026-08-13T12:10:00+08:00'));
    const session = store.abandonFocus();
    expect(session?.status).toBe('abandoned');
    expect(session?.minutes).toBeGreaterThanOrEqual(1);
    expect(store.taskById(id)?.status).toBe('todo');
  });

  it('不同任务重复开始被拒绝；同一任务可继续', () => {
    useProjectStore();
    const store = useTaskStore();
    const ids = seedTasks(store, 2);
    expect(store.startFocus(ids[0]!)).toBe(true);
    // 同一任务返回 true（视为继续）
    expect(store.startFocus(ids[0]!)).toBe(true);
    // 不同任务返回 false 且不切换
    expect(store.startFocus(ids[1]!)).toBe(false);
    expect(store.runningFocus?.taskId).toBe(ids[0]);
  });

  it('级联：删除项目清理今日聚焦与专注记录', () => {
    useProjectStore();
    const store = useTaskStore();
    const id = seedTasks(store, 1)[0]!;
    store.addToFocus(id, 25);
    store.startFocus(id);
    vi.setSystemTime(new Date('2026-08-13T12:20:00+08:00'));
    store.completeFocus();

    store.removeByProject('p-personal-os');
    expect(store.focus).toHaveLength(0);
    expect(store.focusSessions).toHaveLength(0);
    expect(store.runningFocus).toBeNull();
  });
});
