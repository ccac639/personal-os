import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { useKnowledgeStore } from '@/features/projects/knowledge-store';
import {
  filterKnowledge,
  knowledgeTags,
  buildKnowledgeMarkdown,
  normalizeKnowledgeEntry,
} from '@/features/projects/knowledge';
import type { KnowledgeEntry } from '@/features/projects/knowledge';

function mkEntry(over: Partial<KnowledgeEntry>): KnowledgeEntry {
  return {
    id: 'k-1',
    projectId: 'p-1',
    type: 'decision',
    title: '选型',
    body: '使用 X 方案',
    tags: ['架构'],
    taskIds: [],
    milestoneIds: [],
    decisionStatus: 'pending',
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

describe('知识纯函数', () => {
  const entries = [
    mkEntry({
      id: 'k1',
      type: 'decision',
      title: '数据库选型',
      body: 'Postgres',
      tags: ['架构'],
      decisionStatus: 'executed',
    }),
    mkEntry({
      id: 'k2',
      type: 'issue',
      title: '登录超时',
      body: '偶发 504',
      tags: ['bug'],
      issueStatus: 'open',
      taskIds: ['t-1'],
    }),
    mkEntry({ id: 'k3', type: 'reference', title: '官方文档', body: 'vite 文档', tags: ['文档'] }),
    mkEntry({
      id: 'k4',
      type: 'decision',
      title: '缓存策略',
      body: 'LRU',
      tags: ['架构'],
      decisionStatus: 'discarded',
    }),
  ];

  it('filterKnowledge：关键词 / 类型 / 标签 / 状态', () => {
    expect(filterKnowledge(entries, { q: '超时' }).map((e) => e.id)).toEqual(['k2']);
    expect(
      filterKnowledge(entries, { type: 'decision' })
        .map((e) => e.id)
        .sort(),
    ).toEqual(['k1', 'k4']);
    expect(
      filterKnowledge(entries, { tag: '架构' })
        .map((e) => e.id)
        .sort(),
    ).toEqual(['k1', 'k4']);
    expect(
      filterKnowledge(entries, { type: 'decision', status: 'executed' }).map((e) => e.id),
    ).toEqual(['k1']);
    expect(filterKnowledge(entries, { type: 'issue', status: 'resolved' })).toEqual([]);
    expect(filterKnowledge(entries, { q: '不存在的词' })).toEqual([]);
  });

  it('knowledgeTags：按频次降序去重', () => {
    expect(knowledgeTags(entries)).toEqual(['架构', 'bug', '文档']);
  });

  it('buildKnowledgeMarkdown：分组输出并含关联任务', () => {
    const tasks = [{ id: 't-1', title: '修复登录', status: 'done' }] as never;
    const md = buildKnowledgeMarkdown(
      entries,
      { id: 'p-1', name: 'P' } as never,
      tasks as never,
      [],
    );
    expect(md).toContain('# 项目知识 · P');
    expect(md).toContain('## 决策');
    expect(md).toContain('### 数据库选型（已执行）');
    expect(md).toContain('## 问题');
    expect(md).toContain('任务：修复登录');
    expect(md).toContain('## 参考');
  });

  it('normalizeKnowledgeEntry：非法返回 null，decision/issue 状态校验', () => {
    expect(normalizeKnowledgeEntry(null)).toBeNull();
    expect(normalizeKnowledgeEntry({ id: 'x', title: 'T' })).toBeNull();
    const badStatus = normalizeKnowledgeEntry(
      mkEntry({ type: 'decision', decisionStatus: 'bogus' as never }),
    );
    expect(badStatus?.decisionStatus).toBeUndefined();
    const good = normalizeKnowledgeEntry(mkEntry({ type: 'issue', issueStatus: 'resolved' }));
    expect(good?.issueStatus).toBe('resolved');
  });
});

describe('知识 store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('CRUD：创建（含上下文关联）→ 更新 → 删除；写入失败提示', () => {
    const ps = useProjectStore();
    const ts = useTaskStore();
    const p = ps.createProject({ name: 'P', status: 'active', tags: [], techStack: [] });
    const task = ts.createTask({
      projectId: p.id,
      title: '任务',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const ms = ps.createMilestone(p.id, { title: 'M', status: 'planned', taskIds: [] });

    const ks = useKnowledgeStore();
    const e = ks.createEntry({
      projectId: p.id,
      type: 'issue',
      title: '关于任务',
      body: '上下文',
      tags: ['bug'],
      taskIds: [task.id],
      milestoneIds: [ms.id],
    });
    expect(e.taskIds).toEqual([task.id]);
    expect(e.issueStatus).toBe('open');
    expect(ks.entriesOf(p.id)).toHaveLength(1);

    expect(ks.updateEntry(e.id, { issueStatus: 'resolved', title: '已解决' })).toBe(true);
    expect(ks.entryById(e.id)?.issueStatus).toBe('resolved');
    expect(ks.entryById(e.id)?.title).toBe('已解决');

    // 写入失败：内存继续
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    ks.createEntry({ projectId: p.id, type: 'reference', title: 'R', body: '', tags: [] });
    expect(ks.entriesOf(p.id)).toHaveLength(2);
    expect(ks.storageWarning).not.toBeNull();
    spy.mockRestore();

    ks.deleteEntry(e.id);
    expect(ks.entriesOf(p.id)).toHaveLength(1);
  });

  it('deleteByProject：删除项目时级联清理知识', () => {
    const ps = useProjectStore();
    const p = ps.createProject({ name: 'P', status: 'active', tags: [], techStack: [] });
    const ks = useKnowledgeStore();
    ks.createEntry({
      projectId: p.id,
      type: 'decision',
      title: 'D',
      body: '',
      tags: [],
      decisionStatus: 'pending',
    });
    ks.deleteByProject(p.id);
    expect(ks.entriesOf(p.id)).toHaveLength(0);
  });
});
