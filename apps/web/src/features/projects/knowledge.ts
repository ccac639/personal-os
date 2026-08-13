/**
 * 项目知识记录 —— 纯函数（可单测，不依赖 store）
 *
 * 三类条目：决策（decision）/ 问题（issue）/ 参考（reference）。
 * - 决策可标记：已执行 / 待验证 / 已废弃；问题可标记：待解决 / 已解决；
 * - 支持全文关键词、标签、类型、状态筛选；
 * - 支持导出项目知识 Markdown；
 * - 仅保存在项目模块本地数据内。
 */
import type { Milestone, ProjectDetail } from './types';
import type { TaskItem } from '@/features/tasks/types';

export type KnowledgeType = 'decision' | 'issue' | 'reference';
export type DecisionStatus = 'executed' | 'pending' | 'discarded';
export type IssueStatus = 'open' | 'resolved';

export interface KnowledgeEntry {
  id: string;
  projectId: string;
  type: KnowledgeType;
  title: string;
  body: string;
  tags: string[];
  /** 关联任务 id */
  taskIds: string[];
  /** 关联里程碑 id */
  milestoneIds: string[];
  /** decision 用 */
  decisionStatus?: DecisionStatus;
  /** issue 用 */
  issueStatus?: IssueStatus;
  createdAt: string;
  updatedAt: string;
}

export const KNOWLEDGE_TYPE_META: Record<KnowledgeType, { label: string }> = {
  decision: { label: '决策' },
  issue: { label: '问题' },
  reference: { label: '参考' },
};

export const DECISION_STATUS_META: Record<DecisionStatus, { label: string }> = {
  executed: { label: '已执行' },
  pending: { label: '待验证' },
  discarded: { label: '已废弃' },
};

export const ISSUE_STATUS_META: Record<IssueStatus, { label: string }> = {
  open: { label: '待解决' },
  resolved: { label: '已解决' },
};

export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export interface KnowledgeFilter {
  q?: string;
  type?: KnowledgeType | 'all';
  tag?: string;
  status?: string;
}

/** 全文关键词 / 类型 / 标签 / 状态筛选（纯函数；q 命中标题与正文） */
export function filterKnowledge(
  entries: KnowledgeEntry[],
  filter: KnowledgeFilter,
): KnowledgeEntry[] {
  const q = filter.q?.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter.type && filter.type !== 'all' && e.type !== filter.type) return false;
    if (filter.tag && !e.tags.includes(filter.tag)) return false;
    if (filter.status && filter.status !== 'all') {
      if (e.type === 'decision' && e.decisionStatus !== filter.status) return false;
      if (e.type === 'issue' && e.issueStatus !== filter.status) return false;
    }
    if (q) {
      const hay = `${e.title}\n${e.body}\n${e.tags.join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/** 某项目的全部标签（按使用频次降序，去重） */
export function knowledgeTags(entries: KnowledgeEntry[]): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) {
    for (const t of e.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

/** 导出项目知识 Markdown */
export function buildKnowledgeMarkdown(
  entries: KnowledgeEntry[],
  project: ProjectDetail,
  tasks: TaskItem[],
  milestones: Milestone[],
): string {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const msById = new Map(milestones.map((m) => [m.id, m]));
  const lines: string[] = [`# 项目知识 · ${project.name}`, ''];
  if (entries.length === 0) {
    lines.push('（暂无知识记录）', '');
    return lines.join('\n');
  }
  const order: KnowledgeType[] = ['decision', 'issue', 'reference'];
  for (const type of order) {
    const group = entries.filter((e) => e.type === type);
    if (group.length === 0) continue;
    lines.push(`## ${KNOWLEDGE_TYPE_META[type].label}`, '');
    for (const e of group) {
      const statusLabel =
        e.type === 'decision'
          ? e.decisionStatus
            ? DECISION_STATUS_META[e.decisionStatus].label
            : ''
          : e.issueStatus
            ? ISSUE_STATUS_META[e.issueStatus].label
            : '';
      lines.push(`### ${e.title}${statusLabel ? `（${statusLabel}）` : ''}`, '');
      if (e.body) {
        lines.push(...e.body.split('\n').map((l) => (l.trim() ? `> ${l}` : '>')), '');
      }
      const refs: string[] = [];
      for (const id of e.taskIds) {
        const t = taskById.get(id);
        refs.push(t ? `任务：${t.title}` : `任务（已删除）：${id}`);
      }
      for (const id of e.milestoneIds) {
        const m = msById.get(id);
        refs.push(m ? `里程碑：${m.title}` : `里程碑（已删除）：${id}`);
      }
      if (refs.length > 0) {
        lines.push(`- ${refs.join('；')}`, '');
      }
      if (e.tags.length > 0) {
        lines.push(`- 标签：${e.tags.map((t) => `#${t}`).join(' ')}`, '');
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

/** 结构校验（持久化 / 导入用；非法返回 null） */
export function normalizeKnowledgeEntry(raw: unknown): KnowledgeEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.projectId !== 'string' ||
    (r.type !== 'decision' && r.type !== 'issue' && r.type !== 'reference') ||
    typeof r.title !== 'string' ||
    typeof r.body !== 'string' ||
    !Array.isArray(r.tags) ||
    !r.tags.every((x) => typeof x === 'string') ||
    !Array.isArray(r.taskIds) ||
    !r.taskIds.every((x) => typeof x === 'string') ||
    !Array.isArray(r.milestoneIds) ||
    !r.milestoneIds.every((x) => typeof x === 'string')
  ) {
    return null;
  }
  const entry: KnowledgeEntry = {
    id: r.id,
    projectId: r.projectId,
    type: r.type,
    title: r.title,
    body: r.body,
    tags: [...new Set(r.tags as string[])],
    taskIds: [...new Set(r.taskIds as string[])],
    milestoneIds: [...new Set(r.milestoneIds as string[])],
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  };
  if (
    r.type === 'decision' &&
    (r.decisionStatus === 'executed' ||
      r.decisionStatus === 'pending' ||
      r.decisionStatus === 'discarded')
  ) {
    entry.decisionStatus = r.decisionStatus;
  }
  if (r.type === 'issue' && (r.issueStatus === 'open' || r.issueStatus === 'resolved')) {
    entry.issueStatus = r.issueStatus;
  }
  return entry;
}
