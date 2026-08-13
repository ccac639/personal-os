import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { useReleaseStore } from '@/features/projects/release-store';
import {
  BUILTIN_RELEASE_ITEMS,
  buildChecklistDraft,
  buildReleaseMarkdown,
  createReleaseTemplate,
  deleteReleaseTemplate,
  isValidVersion,
  normalizeChecklist,
  recordFromChecklist,
} from '@/features/projects/releases';
import type { ReleaseChecklist } from '@/features/projects/releases';

function mkProject(ps: ReturnType<typeof useProjectStore>, name = 'P') {
  return ps.createProject({ name, status: 'active', tags: [], techStack: [] });
}

describe('发布纯函数', () => {
  it('isValidVersion：基础格式校验', () => {
    expect(isValidVersion('v1.2.3')).toBe(true);
    expect(isValidVersion('1.2.3')).toBe(true);
    expect(isValidVersion('自定义版本')).toBe(true);
    expect(isValidVersion('')).toBe(false);
    expect(isValidVersion('  ')).toBe(false);
    expect(isValidVersion('a\nb')).toBe(false);
  });

  it('buildChecklistDraft：从已完成任务与里程碑生成草稿（draft 可编辑）', () => {
    const project = { id: 'p-1', name: 'P' } as never;
    const doneTasks = [
      { id: 't-a', title: 'A', status: 'done' },
      { id: 't-b', title: 'B', status: 'done' },
      { id: 't-c', title: 'C', status: 'todo' },
    ] as never;
    const milestones = [
      { id: 'm-1', title: 'M1', status: 'done' },
      { id: 'm-2', title: 'M2', status: 'planned' },
    ] as never;

    const draft = buildChecklistDraft({
      project,
      doneTasks: doneTasks as never,
      milestones: milestones as never,
    });
    expect(draft.status).toBe('draft');
    expect(draft.taskIds).toEqual(['t-a', 't-b']);
    expect(draft.items).toHaveLength(BUILTIN_RELEASE_ITEMS.length);
    expect(draft.summary).toContain('完成 2 个任务');
    expect(draft.summary).toContain('达成 1 个里程碑');
    // 可编辑：改版本与检查项
    draft.version = 'v2.0.0';
    draft.items[0]!.done = true;
    expect(draft.version).toBe('v2.0.0');
  });

  it('recordFromChecklist：完成 → 发布记录（不可再编辑语义：记录快照）', () => {
    const checklist: ReleaseChecklist = {
      id: 'rel-1',
      projectId: 'p-1',
      version: 'v1.0.0',
      title: '发布',
      summary: '摘要',
      releaseDate: undefined,
      status: 'draft',
      taskIds: ['t-1'],
      items: [{ id: 'i1', label: '测试', done: true }],
      risks: '无',
      createdAt: '2026-08-01T00:00:00+08:00',
      updatedAt: '2026-08-01T00:00:00+08:00',
    };
    const record = recordFromChecklist(checklist, '2026-08-13');
    expect(record.releaseDate).toBe('2026-08-13');
    expect(record.fromChecklistId).toBe('rel-1');
    expect(record.items[0]!.done).toBe(true);
    // 修改原检查单不影响记录
    checklist.items[0]!.done = false;
    expect(record.items[0]!.done).toBe(true);
  });

  it('buildReleaseMarkdown：版本 / 摘要 / 完成内容 / 风险 / 检查项', () => {
    const record = {
      id: 'r-1',
      projectId: 'p-1',
      version: 'v1.0.0',
      title: '发布 v1',
      summary: '里程碑交付',
      releaseDate: '2026-08-13',
      taskIds: ['t-1', 't-missing'],
      items: [
        { id: 'i1', label: '测试通过', done: true },
        { id: 'i2', label: '构建通过', done: false },
      ],
      risks: '已知问题：缓存未清',
      fromChecklistId: 'rel-1',
      createdAt: '2026-08-13T00:00:00+08:00',
    };
    const tasks = [{ id: 't-1', title: '任务一', status: 'done' }] as never;
    const md = buildReleaseMarkdown(
      record as never,
      { id: 'p-1', name: 'P' } as never,
      tasks as never,
    );
    expect(md).toContain('# 发布 v1');
    expect(md).toContain('v1.0.0');
    expect(md).toContain('里程碑交付');
    expect(md).toContain('[x] 任务一');
    expect(md).toContain('（任务已删除）t-missing');
    expect(md).toContain('- [x] 测试通过');
    expect(md).toContain('- [ ] 构建通过');
    expect(md).toContain('已知问题：缓存未清');
  });

  it('模板 CRUD：自定义模板可增删，内置不可删', () => {
    const r1 = createReleaseTemplate([], { name: '我的', items: ['A', 'B'] });
    expect(r1.template.builtin).toBe(false);
    const r2 = createReleaseTemplate(r1.list, { name: '我的', items: ['C'] });
    expect(r2.template.name).not.toBe('我的'); // 重名追加
    const del = deleteReleaseTemplate(r2.list, r2.template.id);
    expect(del.removed).toBe(true);
    const delBuiltin = deleteReleaseTemplate(r2.list, 'rel-min');
    expect(delBuiltin.removed).toBe(false);
  });

  it('normalizeChecklist：非法结构返回 null，合法可往返', () => {
    expect(normalizeChecklist(null)).toBeNull();
    expect(normalizeChecklist({ id: 'x' })).toBeNull();
    const good = normalizeChecklist({
      id: 'c1',
      projectId: 'p-1',
      version: 'v1',
      title: 'T',
      status: 'draft',
      taskIds: ['a', 'a'],
      items: [{ id: 'i', label: 'L', done: false }],
      createdAt: '2026-08-01T00:00:00+08:00',
      updatedAt: '2026-08-01T00:00:00+08:00',
    });
    expect(good?.taskIds).toEqual(['a']); // 去重
  });
});

describe('发布 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('检查单生命周期：保存 → 勾选 → 完成 → 记录 + 活动流；从里程碑生成草稿', () => {
    const ps = useProjectStore();
    const ts = useTaskStore();
    const p = mkProject(ps);
    ts.createTask({ projectId: p.id, title: '任务', priority: 'medium', status: 'done', tags: [] });
    ps.createMilestone(p.id, {
      title: 'M1',
      status: 'done',
      startDate: '2026-08-01',
      dueDate: '2026-08-10',
      taskIds: [],
    });

    const rs = useReleaseStore();
    const c = rs.saveChecklist({
      projectId: p.id,
      version: 'v1.0.0',
      title: '发布 v1',
      status: 'draft',
      taskIds: [],
      items: [
        { id: 'i1', label: '测试', done: false },
        { id: 'i2', label: '构建', done: false },
      ],
    });
    expect(rs.checklistsOf(p.id)).toHaveLength(1);
    expect(ps.projectActivities(p.id).some((a) => a.type === 'release')).toBe(true);

    rs.toggleItem(c.id, 'i1');
    rs.toggleItem(c.id, 'i2');
    const record = rs.completeChecklist(c.id, '2026-08-13');
    expect(record).not.toBeNull();
    expect(rs.checklistsOf(p.id)).toHaveLength(0);
    expect(rs.recordsOf(p.id)).toHaveLength(1);
    expect(
      ps.projectActivities(p.id).some((a) => a.type === 'release' && a.title.includes('完成发布')),
    ).toBe(true);
    // 再次完成不生效（已移除）
    expect(rs.completeChecklist(c.id, '2026-08-14')).toBeNull();
  });

  it('模板管理：保存为个人模板并删除', () => {
    const rs = useReleaseStore();
    const tpl = rs.addTemplate({ name: '回归', items: ['A', 'B', 'C'] });
    expect(rs.allTemplates.some((t) => t.id === tpl!.id)).toBe(true);
    expect(rs.removeTemplate(tpl!.id)).toBe(true);
    expect(rs.removeTemplate('rel-min')).toBe(false);
  });

  it('写入失败：内存继续工作并提示', () => {
    const rs = useReleaseStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    rs.saveChecklist({
      projectId: 'p-1',
      version: 'v1',
      title: 'T',
      status: 'draft',
      taskIds: [],
      items: [],
    });
    expect(rs.checklists.length).toBe(1);
    expect(rs.storageWarning).not.toBeNull();
    spy.mockRestore();
  });
});
