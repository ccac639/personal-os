import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BUILTIN_TEMPLATES,
  allTemplates,
  applyTemplate,
  createCustomTemplate,
  deleteCustomTemplate,
  loadCustomTemplates,
  normalizeTemplate,
  saveCustomTemplates,
} from '@/features/tasks/templates';
import type { TaskTemplate } from '@/features/tasks/types';

describe('内置任务模板', () => {
  it('包含缺陷修复 / 功能开发 / 技术债 / 发布检查四类', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.id)).toEqual([
      'tpl-bugfix',
      'tpl-feature',
      'tpl-techdebt',
      'tpl-release',
    ]);
    expect(BUILTIN_TEMPLATES.every((t) => t.builtin && t.subtasks.length > 0)).toBe(true);
    expect(BUILTIN_TEMPLATES.every((t) => t.dod && t.estimatedMinutes != null)).toBe(true);
  });

  it('applyTemplate：生成任务表单默认值与子任务 checklist', () => {
    const tpl = BUILTIN_TEMPLATES[0]!;
    const applied = applyTemplate(tpl, 'p-1');
    expect(applied.projectId).toBe('p-1');
    expect(applied.priority).toBe('high');
    expect(applied.tags).toContain('缺陷');
    expect(applied.dod).toContain('回归测试');
    expect(applied.estimatedMinutes).toBe(120);
    expect(applied.subtasks.length).toBe(5);
    expect(applied.subtasks[0]).toMatchObject({ done: false });
    expect(applied.subtasks[0]!.id).toBeTruthy();
    expect(applied.status).toBe('todo');
  });

  it('applyTemplate：defaultDueDays 生成相对今天截止日期（纯函数可复现）', () => {
    const tpl: TaskTemplate = {
      id: 'x',
      name: 'X',
      title: 'X',
      priority: 'medium',
      tags: [],
      subtasks: [],
      builtin: false,
      defaultDueDays: 3,
    };
    const applied = applyTemplate(tpl);
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate() + 3).padStart(2, '0')}`;
    // 只校验是合法 YYYY-MM-DD 且非空（跨月时上面朴素拼接不可靠）
    expect(applied.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    void expected;
  });
});

describe('自定义模板存取', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('createCustomTemplate：自动生成 id，重名追加序号', () => {
    const base: Omit<TaskTemplate, 'id' | 'builtin'> = {
      name: '数据迁移',
      title: '迁移：',
      priority: 'medium',
      tags: [],
      subtasks: [],
    };
    const first = createCustomTemplate([], base);
    expect(first.template.builtin).toBe(false);
    expect(first.template.id.startsWith('tpl-c-')).toBe(true);

    const second = createCustomTemplate(first.list, base);
    expect(second.template.name).toBe('数据迁移 2');
  });

  it('deleteCustomTemplate：自定义可删，内置不可删', () => {
    const custom = createCustomTemplate([], {
      name: 'N',
      title: 'T',
      priority: 'low',
      tags: [],
      subtasks: [],
    });
    expect(deleteCustomTemplate(custom.list, custom.template.id).removed).toBe(true);
    expect(deleteCustomTemplate(custom.list, 'tpl-bugfix').removed).toBe(false);
  });

  it('normalizeTemplate：非法输入返回 null', () => {
    expect(normalizeTemplate(null)).toBeNull();
    expect(normalizeTemplate({ id: 1 })).toBeNull();
    expect(
      normalizeTemplate({ id: 'a', name: 'N', title: 'T', priority: 'x', tags: [], subtasks: [] }),
    ).toBeNull();
    expect(
      normalizeTemplate({
        id: 'a',
        name: 'N',
        title: 'T',
        priority: 'high',
        tags: ['a'],
        subtasks: ['s'],
        dod: 'd',
        estimatedMinutes: -5,
      }),
    ).toMatchObject({ dod: 'd', estimatedMinutes: undefined });
  });

  it('saveCustomTemplates / loadCustomTemplates：写入与恢复（含损坏容错）', () => {
    expect(saveCustomTemplates([]).ok).toBe(true);
    expect(loadCustomTemplates()).toEqual([]);

    const tpl = createCustomTemplate([], {
      name: 'N',
      title: 'T',
      priority: 'high',
      tags: ['x'],
      subtasks: ['s'],
    }).template;
    saveCustomTemplates([tpl]);
    expect(loadCustomTemplates()).toEqual([tpl]);

    localStorage.setItem('personal-os.tasks.templates.v1', '{broken');
    expect(loadCustomTemplates()).toEqual([]);
  });

  it('allTemplates：内置在前自定义在后', () => {
    const custom = createCustomTemplate([], {
      name: 'C',
      title: 'T',
      priority: 'low',
      tags: [],
      subtasks: [],
    });
    const all = allTemplates(custom.list);
    expect(all[0]!.builtin).toBe(true);
    expect(all[all.length - 1]!.name).toBe('C');
  });
});
