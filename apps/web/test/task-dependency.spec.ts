import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import {
  validateDependencies,
  canAddDependency,
  isBlocked,
  blockingDependencies,
} from '@/features/tasks/dependencies';
import type { TaskItem } from '@/features/tasks/types';

function task(id: string, deps: string[] = [], status: TaskItem['status'] = 'todo'): TaskItem {
  return {
    id,
    title: `任务 ${id}`,
    status,
    priority: 'medium',
    order: 0,
    tags: [],
    subtasks: [],
    dependsOn: deps,
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
  };
}

const byId = (tasks: TaskItem[]) => new Map(tasks.map((t) => [t.id, t]));

describe('validateDependencies（纯函数）', () => {
  it('自依赖：检测并报告', () => {
    const r = validateDependencies([task('a', ['a'])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues[0]?.type).toBe('self');
      expect(r.issues[0]?.taskId).toBe('a');
    }
  });

  it('重复依赖：同一前置出现多次', () => {
    const r = validateDependencies([task('a', ['b', 'b']), task('b')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.type === 'duplicate')).toBe(true);
  });

  it('循环依赖：a→b→c→a 检出环', () => {
    const r = validateDependencies([task('a', ['b']), task('b', ['c']), task('c', ['a'])]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.type === 'cycle')).toBe(true);
  });

  it('引用不存在的任务：missing', () => {
    const r = validateDependencies([task('a', ['ghost'])]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]?.type).toBe('missing');
  });

  it('合法依赖图：ok', () => {
    const r = validateDependencies([task('a', ['b', 'c']), task('b'), task('c')]);
    expect(r.ok).toBe(true);
  });
});

describe('isBlocked / canAddDependency（纯函数）', () => {
  it('前置未完成 → 受阻；全部完成 → 解除阻塞', () => {
    const tasks = [task('a', ['b']), task('b', [], 'todo')];
    expect(isBlocked(tasks[0]!, byId(tasks))).toBe(true);

    tasks[1] = { ...tasks[1]!, status: 'done' };
    expect(isBlocked(tasks[0]!, byId(tasks))).toBe(false);
  });

  it('blockingDependencies：只返回未完成的前置', () => {
    const tasks = [task('a', ['b', 'c']), task('b', [], 'done'), task('c', [], 'todo')];
    const blockers = blockingDependencies(tasks[0]!, byId(tasks));
    expect(blockers.map((t) => t.id)).toEqual(['c']);
  });

  it('canAddDependency：拒绝自依赖 / 重复 / 循环 / 不存在', () => {
    const tasks = [task('a', ['b']), task('b', ['c']), task('c')];
    const map = byId(tasks);
    expect(canAddDependency(tasks[0]!, 'a', map).ok).toBe(false);
    expect(canAddDependency(tasks[0]!, 'b', map).ok).toBe(false);
    expect(canAddDependency(tasks[0]!, 'ghost', map).ok).toBe(false);
    // a 已依赖 b，b 依赖 c；给 a 加 c 合法（不构成环）
    expect(canAddDependency(tasks[0]!, 'c', map).ok).toBe(true);
    // 给 c 加 a 会成环 c→a→b→c
    expect(canAddDependency(tasks[2]!, 'a', map).ok).toBe(false);
  });
});

describe('task store 依赖管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('addDependency：成功添加并记录事件；违规操作被拒绝', () => {
    useProjectStore();
    const store = useTaskStore();
    const a = store.createTask({
      projectId: 'p-personal-os',
      title: 'A',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const b = store.createTask({
      projectId: 'p-personal-os',
      title: 'B',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    const ok = store.addDependency(a.id, b.id);
    expect(ok.ok).toBe(true);
    expect(store.taskById(a.id)?.dependsOn).toEqual([b.id]);

    // 自依赖拒绝
    expect(store.addDependency(a.id, a.id).ok).toBe(false);
    // 重复拒绝
    expect(store.addDependency(a.id, b.id).ok).toBe(false);

    const events = store.taskEvents(a.id);
    expect(events.some((e) => e.title.includes('前置依赖'))).toBe(true);
  });

  it('完成前置依赖后自动解除阻塞；删除依赖任务清理引用', () => {
    useProjectStore();
    const store = useTaskStore();
    const a = store.createTask({
      projectId: 'p-personal-os',
      title: 'A',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const b = store.createTask({
      projectId: 'p-personal-os',
      title: 'B',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    store.addDependency(a.id, b.id);

    expect(store.isBlockedTask(a.id)).toBe(true);
    store.moveTask(b.id, 'done');
    expect(store.isBlockedTask(a.id)).toBe(false);

    // 删除前置任务 → 引用被清理（不再阻塞，不再引用 ghost）
    const c = store.createTask({
      projectId: 'p-personal-os',
      title: 'C',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    store.addDependency(c.id, b.id);
    store.deleteTask(b.id);
    expect(store.taskById(c.id)?.dependsOn).toEqual([]);
  });
});
