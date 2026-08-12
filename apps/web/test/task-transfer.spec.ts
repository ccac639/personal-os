import { describe, expect, it } from 'vitest';

import {
  hasTaskCycle,
  parseTasksJson,
  removeTaskCycles,
  serializeTasks,
} from '@/features/tasks/transfer';
import type { TaskItem } from '@/features/tasks/types';

function makeTask(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't-1',
    projectId: 'p-old',
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

describe('任务导出 / 导入安全处理', () => {
  it('serializeTasks：可序列化并重新解析（信封格式）', () => {
    const tasks = [makeTask({ id: 'a', title: 'A' })];
    const text = serializeTasks(tasks);
    const parsed = JSON.parse(text);
    expect(Array.isArray(parsed.tasks)).toBe(true);
  });

  it('parseTasksJson：非法 JSON / 错误格式返回可读原因', () => {
    expect(parseTasksJson('{broken', 'p-1').ok).toBe(false);
    const wrong = parseTasksJson('{"foo": 1}', 'p-1');
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.reason).toContain('格式不合法');
  });

  it('parseTasksJson：无效条目跳过并报告；有效任务归属当前项目且重新生成 id', () => {
    const text = JSON.stringify({
      tasks: [
        {
          id: 'a',
          title: '有效',
          projectId: 'p-old',
          status: 'todo',
          priority: 'medium',
          createdAt: 'x',
          updatedAt: 'x',
          order: 0,
          tags: [],
          subtasks: [],
          dependsOn: [],
        },
        { garbage: true },
        null,
      ],
    });
    const result = parseTasksJson(text, 'p-new');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.skippedInvalid).toBe(2);
    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0]!.projectId).toBe('p-new');
    expect(result.tasks[0]!.id).not.toBe('a');
  });

  it('parseTasksJson：依赖按旧 id 重映射；指向不存在任务的依赖被清理', () => {
    const text = JSON.stringify({
      tasks: [
        {
          id: 'a',
          title: 'A',
          projectId: 'p',
          status: 'todo',
          priority: 'low',
          createdAt: 'x',
          updatedAt: 'x',
          order: 0,
          tags: [],
          subtasks: [],
          dependsOn: [],
        },
        {
          id: 'b',
          title: 'B',
          projectId: 'p',
          status: 'todo',
          priority: 'low',
          createdAt: 'x',
          updatedAt: 'x',
          order: 1,
          tags: [],
          subtasks: [],
          dependsOn: ['a', 'ghost'],
        },
      ],
    });
    const result = parseTasksJson(text, 'p-new');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.cleanedDeps).toBe(1);
    const b = result.tasks.find((t) => t.title === 'B')!;
    const a = result.tasks.find((t) => t.title === 'A')!;
    expect(b.dependsOn).toEqual([a.id]); // 已重映射到新 id
  });

  it('parseTasksJson：循环依赖被移除并报告', () => {
    const text = JSON.stringify({
      tasks: [
        {
          id: 'a',
          title: 'A',
          projectId: 'p',
          status: 'todo',
          priority: 'low',
          createdAt: 'x',
          updatedAt: 'x',
          order: 0,
          tags: [],
          subtasks: [],
          dependsOn: ['b'],
        },
        {
          id: 'b',
          title: 'B',
          projectId: 'p',
          status: 'todo',
          priority: 'low',
          createdAt: 'x',
          updatedAt: 'x',
          order: 1,
          tags: [],
          subtasks: [],
          dependsOn: ['a'],
        },
      ],
    });
    const result = parseTasksJson(text, 'p-new');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.removedCycles).toBeGreaterThanOrEqual(1);
    const tasks = result.tasks;
    expect(hasTaskCycle(tasks)).toBe(false);
  });

  it('hasTaskCycle / removeTaskCycles：纯函数检测与修复', () => {
    const a = makeTask({ id: 'a', dependsOn: ['b'] });
    const b = makeTask({ id: 'b', dependsOn: ['a'] });
    const c = makeTask({ id: 'c', dependsOn: ['a'] });
    expect(hasTaskCycle([a, b, c])).toBe(true);

    const { tasks, removedEdges } = removeTaskCycles([a, b, c]);
    expect(removedEdges).toBe(1);
    expect(hasTaskCycle(tasks)).toBe(false);
    // 非环边保留
    expect(tasks.find((t) => t.id === 'c')!.dependsOn).toEqual(['a']);

    expect(hasTaskCycle([makeTask({ id: 'a' }), makeTask({ id: 'b', dependsOn: ['a'] })])).toBe(
      false,
    );
  });

  it('parseTasksJson：全部条目非法时拒绝导入', () => {
    const result = parseTasksJson(JSON.stringify([{ garbage: true }]), 'p-1');
    expect(result.ok).toBe(false);
  });
});
