import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import {
  TASKS_KEY,
  TASKS_V2_KEY,
  TASKS_LEGACY_KEY,
  TASKS_VERSION,
} from '@/features/tasks/persistence';
import { cleanupInvalidRefs } from '@/features/tasks/persistence';
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

describe('task 持久化迁移（v1 / v2 → v3）与无效引用清理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('v1 裸对象 → v3：补 subtasks / dependsOn / focus 字段，旧 key 保留', () => {
    localStorage.setItem(
      TASKS_LEGACY_KEY,
      JSON.stringify({ tasks: [legacyTask('t-legacy')], sortBy: 'priority', sortDir: 'desc' }),
    );
    useProjectStore();
    const store = useTaskStore();

    const t = store.taskById('t-legacy')!;
    expect(t.subtasks).toEqual([]);
    expect(t.dependsOn).toEqual([]);
    expect(store.focus).toEqual([]);
    expect(store.focusSessions).toEqual([]);

    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.version).toBe(TASKS_VERSION);
    expect(envelope.data.tasks).toHaveLength(1);
    expect(envelope.data.sortBy).toBe('priority');
    expect(localStorage.getItem(TASKS_LEGACY_KEY)).not.toBeNull();
  });

  it('v2 旧信封 → v3：补 dependsOn 与 focus 字段', () => {
    localStorage.setItem(
      TASKS_V2_KEY,
      JSON.stringify({
        version: 2,
        data: {
          tasks: [legacyTask('t-v2')],
          events: [],
          sortBy: 'order',
          sortDir: 'asc',
        },
      }),
    );
    useProjectStore();
    const store = useTaskStore();
    expect(store.taskById('t-v2')?.dependsOn).toEqual([]);
    const envelope = JSON.parse(localStorage.getItem(TASKS_KEY)!);
    expect(envelope.data.focus).toEqual([]);
  });

  it('无效引用清理：任务指向不存在项目被移除；依赖指向不存在任务被清理并报告', () => {
    const state: PersistedTaskState = {
      tasks: [
        { ...legacyTask('t-ok'), id: 't-ok' },
        { ...legacyTask('t-ghost-project'), id: 't-ghost-project', projectId: 'p-does-not-exist' },
        { ...legacyTask('t-dep'), id: 't-dep', dependsOn: ['t-ok', 't-missing'] },
      ],
      events: [],
      sortBy: 'order',
      sortDir: 'asc',
      focus: [{ taskId: 't-ghost-project', plannedMinutes: 25 }],
      focusSessions: [],
      runningFocus: null,
    };
    const { state: cleaned, report } = cleanupInvalidRefs(
      state,
      new Set(['p-personal-os', 'p-blog']),
    );

    expect(cleaned.tasks.map((t) => t.id)).toEqual(['t-ok', 't-dep']);
    expect(cleaned.tasks[1]?.dependsOn).toEqual(['t-ok']);
    expect(report.cleanedProjectRefs).toBe(1);
    expect(report.cleanedDependencyRefs).toBe(1);
    // 无效任务的 focus 引用一并清理
    expect(cleaned.focus).toHaveLength(0);
  });

  it('store 初始化：自动清理无效引用并展示迁移提示', () => {
    localStorage.setItem(
      TASKS_V2_KEY,
      JSON.stringify({
        version: 2,
        data: {
          tasks: [
            legacyTask('t-bad', 'p-gone'),
            { ...legacyTask('t-dep'), id: 't-dep', dependsOn: ['t-bad'] },
          ],
          events: [],
          sortBy: 'order',
          sortDir: 'asc',
        },
      }),
    );
    useProjectStore();
    const store = useTaskStore();
    // 指向不存在项目的任务被移除，其依赖引用也被清理
    expect(store.taskById('t-bad')).toBeNull();
    expect(store.taskById('t-dep')?.dependsOn).toEqual([]);
    expect(store.migrationNotice).toContain('无效');
  });

  it('损坏 / 版本过新：回退种子并提示', () => {
    useProjectStore();
    localStorage.setItem(TASKS_KEY, 'not json');
    setActivePinia(createPinia());
    const s1 = useTaskStore();
    expect(s1.tasks.length).toBe(SEED_TASKS.length);
    expect(s1.storageWarning).toContain('无法读取');

    setActivePinia(createPinia());
    localStorage.setItem(TASKS_KEY, JSON.stringify({ version: 99, data: null }));
    const s2 = useTaskStore();
    expect(s2.tasks.length).toBe(SEED_TASKS.length);
    expect(s2.storageWarning).toContain('版本过新');
  });

  it('写入失败：内存继续工作并提示', () => {
    useProjectStore();
    const store = useTaskStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      store.createTask({
        projectId: 'p-personal-os',
        title: '写失败',
        priority: 'low',
        status: 'todo',
        tags: [],
      });
      expect(store.tasks.some((t) => t.title === '写失败')).toBe(true);
      expect(store.storageWarning).toContain('存储空间不足');
    } finally {
      spy.mockRestore();
    }
  });
});
