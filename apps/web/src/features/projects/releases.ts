/**
 * 发布与交付检查 —— 纯函数（可单测，不依赖 store）
 *
 * - 检查单草稿（ReleaseChecklist）：版本 / 标题 / 摘要 / 日期 / 状态 / 关联项目与任务；
 * - 内置最小检查项 + 个人模板；
 * - 从已完成任务或里程碑自动生成草稿（必须允许编辑，故生成后仍是 draft）；
 * - 检查单完成后生成本地发布记录（ReleaseRecord），关联项目活动流由调用方写入；
 * - 支持导出发布说明 Markdown；
 * - 版本号仅基础格式校验（v1.2.3 或自定义文本），不做包发布。
 */
import type { Milestone, ProjectDetail } from './types';
import type { TaskItem } from '@/features/tasks/types';

export type ReleaseStatus = 'draft' | 'done';

export interface ReleaseChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

/** 发布检查单（草稿阶段） */
export interface ReleaseChecklist {
  id: string;
  projectId: string;
  version: string;
  title: string;
  summary?: string;
  /** YYYY-MM-DD */
  releaseDate?: string;
  status: ReleaseStatus;
  taskIds: string[];
  items: ReleaseChecklistItem[];
  /** 风险 / 已知问题（自由文本） */
  risks?: string;
  createdAt: string;
  updatedAt: string;
}

/** 发布记录（检查单完成后生成，不可再编辑） */
export interface ReleaseRecord {
  id: string;
  projectId: string;
  version: string;
  title: string;
  summary?: string;
  /** YYYY-MM-DD */
  releaseDate: string;
  taskIds: string[];
  items: ReleaseChecklistItem[];
  risks?: string;
  /** 生成记录的检查单 id */
  fromChecklistId: string;
  createdAt: string;
}

/** 个人发布检查单模板 */
export interface ReleaseTemplate {
  id: string;
  name: string;
  items: string[];
  builtin: boolean;
}

/** 内置最小检查项 */
export const BUILTIN_RELEASE_ITEMS: string[] = [
  '测试通过',
  '构建通过',
  '变更记录更新',
  '文档同步',
  '发布说明准备',
];

export const BUILTIN_RELEASE_TEMPLATES: ReleaseTemplate[] = [
  { id: 'rel-min', name: '最小检查', items: [...BUILTIN_RELEASE_ITEMS], builtin: true },
  {
    id: 'rel-web',
    name: '前端发布',
    items: [...BUILTIN_RELEASE_ITEMS, '依赖审计无高危', '兼容性回归'],
    builtin: true,
  },
  {
    id: 'rel-ver',
    name: '版本发布',
    items: [...BUILTIN_RELEASE_ITEMS, '版本号格式校验', '标签已创建'],
    builtin: true,
  },
];

export function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 版本号基础校验：v1.2.3 / 1.2.3 或任意非空自定义文本（不含换行） */
export function isValidVersion(v: string): boolean {
  const s = v.trim();
  if (!s) return false;
  if (s.includes('\n')) return false;
  return true;
}

/** 从已完成任务 / 里程碑生成检查单草稿（纯函数；生成后必须允许编辑） */
export function buildChecklistDraft(input: {
  project: ProjectDetail;
  doneTasks: TaskItem[];
  milestones: Milestone[];
  templateItems?: string[];
  version?: string;
}): ReleaseChecklist {
  const now = new Date().toISOString();
  const doneTaskIds = input.doneTasks.filter((t) => t.status === 'done').map((t) => t.id);
  const doneMilestones = input.milestones.filter((m) => m.status === 'done');
  const items = (input.templateItems ?? BUILTIN_RELEASE_ITEMS).map((label, i) => ({
    id: `ri-${now}-${i}`,
    label,
    done: false,
  }));
  const summaryParts: string[] = [];
  if (doneTaskIds.length > 0) summaryParts.push(`完成 ${doneTaskIds.length} 个任务`);
  if (doneMilestones.length > 0) summaryParts.push(`达成 ${doneMilestones.length} 个里程碑`);
  return {
    id: uid('rel-'),
    projectId: input.project.id,
    version: input.version?.trim() || 'v1.0.0',
    title: `${input.project.name} 发布`,
    summary: summaryParts.join('；') || undefined,
    releaseDate: undefined,
    status: 'draft',
    taskIds: doneTaskIds,
    items,
    risks: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

/** 检查单完成 → 生成发布记录（纯函数） */
export function recordFromChecklist(
  checklist: ReleaseChecklist,
  releaseDate: string,
): ReleaseRecord {
  return {
    id: uid('rel-r-'),
    projectId: checklist.projectId,
    version: checklist.version.trim(),
    title: checklist.title,
    summary: checklist.summary,
    releaseDate,
    taskIds: checklist.taskIds,
    items: checklist.items.map((i) => ({ ...i })),
    risks: checklist.risks,
    fromChecklistId: checklist.id,
    createdAt: new Date().toISOString(),
  };
}

/** 发布说明 Markdown（版本 / 摘要 / 完成内容 / 风险 / 检查项状态） */
export function buildReleaseMarkdown(
  record: ReleaseRecord,
  project: ProjectDetail,
  tasks: TaskItem[],
): string {
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const lines: string[] = [
    `# ${record.title}`,
    '',
    `- 版本：${record.version}`,
    `- 项目：${project.name}`,
    `- 发布日期：${record.releaseDate}`,
    record.summary ? `- 摘要：${record.summary}` : '',
    '',
    '## 完成内容',
    '',
  ];
  if (record.taskIds.length === 0) {
    lines.push('（无关联任务）', '');
  } else {
    for (const id of record.taskIds) {
      const t = taskById.get(id);
      lines.push(
        `- ${t ? `[${t.status === 'done' ? 'x' : ' '}] ${t.title}` : `（任务已删除）${id}`}`,
      );
    }
    lines.push('');
  }
  lines.push('## 检查项', '');
  for (const item of record.items) {
    lines.push(`- [${item.done ? 'x' : ' '}] ${item.label}`);
  }
  lines.push('');
  lines.push('## 风险 / 已知问题', '');
  lines.push(record.risks?.trim() ? record.risks : '（无）');
  lines.push('');
  return lines.join('\n');
}

/** 自定义模板 CRUD（纯函数；重名自动追加序号） */
export function createReleaseTemplate(
  list: ReleaseTemplate[],
  input: { name: string; items: string[] },
): { list: ReleaseTemplate[]; template: ReleaseTemplate } {
  const base = input.name.trim();
  const names = new Set(list.map((t) => t.name));
  let name = base;
  let i = 2;
  while (names.has(name)) {
    name = `${base} ${i}`;
    i += 1;
  }
  const items = input.items.map((s) => s.trim()).filter(Boolean);
  const template: ReleaseTemplate = {
    id: uid('rtpl-'),
    name,
    items,
    builtin: false,
  };
  return { list: [...list, template], template };
}

export function deleteReleaseTemplate(
  list: ReleaseTemplate[],
  id: string,
): { list: ReleaseTemplate[]; removed: boolean } {
  const tpl = list.find((t) => t.id === id);
  if (!tpl || tpl.builtin) return { list, removed: false };
  return { list: list.filter((t) => t.id !== id), removed: true };
}

/** 结构校验（持久化 / 导入用；非法返回 null） */
export function normalizeChecklist(raw: unknown): ReleaseChecklist | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.projectId !== 'string' ||
    typeof r.version !== 'string' ||
    typeof r.title !== 'string' ||
    (r.status !== 'draft' && r.status !== 'done') ||
    !Array.isArray(r.taskIds) ||
    !r.taskIds.every((x) => typeof x === 'string') ||
    !Array.isArray(r.items)
  ) {
    return null;
  }
  const items: ReleaseChecklistItem[] = [];
  for (const it of r.items) {
    if (!it || typeof it !== 'object') return null;
    const i = it as Record<string, unknown>;
    if (typeof i.id !== 'string' || typeof i.label !== 'string' || typeof i.done !== 'boolean')
      return null;
    items.push({ id: i.id, label: i.label, done: i.done });
  }
  return {
    id: r.id,
    projectId: r.projectId,
    version: r.version,
    title: r.title,
    summary: typeof r.summary === 'string' ? r.summary : undefined,
    releaseDate: typeof r.releaseDate === 'string' ? r.releaseDate : undefined,
    status: r.status,
    taskIds: [...new Set(r.taskIds as string[])],
    items,
    risks: typeof r.risks === 'string' ? r.risks : undefined,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  };
}

export function normalizeRecord(raw: unknown): ReleaseRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    typeof r.id !== 'string' ||
    typeof r.projectId !== 'string' ||
    typeof r.version !== 'string' ||
    typeof r.title !== 'string' ||
    typeof r.releaseDate !== 'string' ||
    !Array.isArray(r.taskIds) ||
    !r.taskIds.every((x) => typeof x === 'string') ||
    !Array.isArray(r.items)
  ) {
    return null;
  }
  const items: ReleaseChecklistItem[] = [];
  for (const it of r.items) {
    if (!it || typeof it !== 'object') return null;
    const i = it as Record<string, unknown>;
    if (typeof i.id !== 'string' || typeof i.label !== 'string' || typeof i.done !== 'boolean')
      return null;
    items.push({ id: i.id, label: i.label, done: i.done });
  }
  return {
    id: r.id,
    projectId: r.projectId,
    version: r.version,
    title: r.title,
    summary: typeof r.summary === 'string' ? r.summary : undefined,
    releaseDate: r.releaseDate,
    taskIds: [...new Set(r.taskIds as string[])],
    items,
    risks: typeof r.risks === 'string' ? r.risks : undefined,
    fromChecklistId: typeof r.fromChecklistId === 'string' ? r.fromChecklistId : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
  };
}
