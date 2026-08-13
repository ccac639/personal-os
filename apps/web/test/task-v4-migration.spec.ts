import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import {
  TASKS_KEY,
  TASKS_V3_KEY,
  TASKS_V2_KEY,
  TASKS_LEGACY_KEY,
  TASKS_VERSION,
  cleanupInvalidRefs,
} from '@/features/tasks/persistence';
import { SEED_TASKS } from '@/features/tasks/mock';
import type { PersistedTaskState } from '@/features/tasks/persistence';

function legacyTask(id: string, projectId = 'p-personal-os', dependsOn: string[] = []) {
  const t = SEED_TASKS[0]!;
  return {
    id,
    projectId,
    title: `旧任务 ${id}`,
    description: t.description,
    status: 'todo',
    priority: 'medium',
    dueDate: undefined,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    tags: [],
    order: 0,
    dependsOn,
  };
}

describe('task 持久化 v4 迁移（v1 / v2 / v3 → v4）与无效引用清理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('v1 裸对象 → v4：补全字段并写入 v4 key，旧 key 保留', () => {
    localStorage.setItem(
      TASKS_LEGACY_KEY,
      JSON.stringify({ tasks: [legacyTask('t-legacy')], sortBy: 'priority', sortDir: 'desc' }),
    );
    useProjectStore();
    const store = useTaskStore();

    expect(store.taskById('t-legacy')?.subtasks).toEqual([]);
    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(TASKS_VERSION);
    expect(envelope.version).toBe(4);
    expect(localStorage.getItem(TASKS_LEGACY_KEY)).not.toBeNull();
  });

  it('v2 旧信封 → v4', () => {
    localStorage.setItem(
      TASKS_V2_KEY,
      JSON.stringify({
        version: 2,
        data: {
          tasks: [legacyTask('t-v2')],
          events: [],
          sortBy: 'createdAt',
          sortDir: 'desc',
        },
      }),
    );
    useProjectStore();
    const store = useTaskStore();
    expect(store.taskById('t-v2')).not.toBeNull();
    expect(store.focusDone).toEqual([]);
    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(4);
  });

  it('v3 信封（含 focusDone / focusHistory / 估时字段）→ v4：数据完整迁移', () => {
    const v3Data: PersistedTaskState = {
      tasks: [legacyTask('t-v3')],
      events: [],
      sortBy: 'order',
      sortDir: 'asc',
      focus: [{ taskId: 't-v3', plannedMinutes: 25 }],
      focusSessions: [],
      runningFocus: null,
      focusDone: ['t-v3'],
      focusHistory: [],
    };
    localStorage.setItem(TASKS_V3_KEY, JSON.stringify({ version: 3, data: v3Data }));
    useProjectStore();
    const store = useTaskStore();
    expect(store.taskById('t-v3')).not.toBeNull();
    expect(store.focus.map((f) => f.taskId)).toEqual(['t-v3']);
    expect(store.isPlanDone('t-v3')).toBe(true);
    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(4);
    // 旧 v3 key 保留可回滚
    expect(localStorage.getItem(TASKS_V3_KEY)).not.toBeNull();
  });

  it('版本过新（v99）：降级示例数据并提示，不白屏', () => {
    localStorage.setItem(TASKS_KEY, JSON.stringify({ version: 99, data: [] }));
    useProjectStore();
    const store = useTaskStore();
    expect(store.storageWarning).toContain('版本过新');
    expect(store.tasks.length).toBeGreaterThan(0);
  });

  it('损坏 JSON：降级示例数据并提示', () => {
    localStorage.setItem(TASKS_KEY, '{broken json');
    useProjectStore();
    const store = useTaskStore();
    expect(store.storageWarning).not.toBeNull();
    expect(store.tasks.length).toBeGreaterThan(0);
  });

  it('写入失败（QuotaExceededError）：内存继续工作并提示', () => {
    useProjectStore();
    const store = useTaskStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    const t = store.createTask({
      projectId: undefined,
      title: '收件箱',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    expect(store.taskById(t.id)).not.toBeNull();
    expect(store.storageWarning).not.toBeNull();
    spy.mockRestore();
  });

  it('无效引用清理：projectId 指向不存在项目 → 移除；收件箱任务（无 projectId）保留', () => {
    const state: PersistedTaskState = {
      tasks: [
        legacyTask('t-orphan', 'p-不存在'),
        legacyTask('t-inbox', undefined),
        legacyTask('t-bad-dep', 'p-personal-os', ['t-不存在']),
      ],
      events: [],
      sortBy: 'order',
      sortDir: 'asc',
      focus: [],
      focusSessions: [],
      runningFocus: null,
      focusDone: [],
      focusHistory: [],
    };
    const cleaned = cleanupInvalidRefs(state, new Set(['p-personal-os']));
    expect(cleaned.state.tasks.map((t) => t.id)).toEqual(['t-inbox', 't-bad-dep']);
    expect(cleaned.state.tasks[1]!.dependsOn).toEqual([]);
    expect(cleaned.report.cleanedProjectRefs).toBe(1);
    expect(cleaned.report.cleanedDependencyRefs).toBe(1);
  });

  it('收件箱任务在 v4 持久化中往返保留（projectId 为空）', () => {
    useProjectStore();
    const store = useTaskStore();
    const t = store.createTask({
      projectId: undefined,
      title: '收件箱',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(4);
    const stored = envelope.data.tasks.find((x: { id: string }) => x.id === t.id);
    expect(stored.projectId).toBeUndefined();
  });
});
