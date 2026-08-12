/**
 * 项目导入 / 导出 —— 纯函数（可单测，不依赖 store）
 *
 * 导出：完整项目包（项目 + 任务 + 里程碑 + 活动 + 复盘笔记）；
 * 导入：严格校验（复用 persistence normalize）→ 全部重新生成 id
 * （作为新项目导入，绝不覆盖现有数据）→ 内部引用重映射 → 清理
 * 无效依赖 / 循环依赖 / 里程碑悬空引用。失败返回可读原因。
 */
import type { Milestone, ProjectActivity, ProjectDetail, Retrospective } from './types';
import {
  normalizeActivity,
  normalizeMilestone,
  normalizeProject,
  normalizeRetrospective,
} from './persistence';
import type { TaskItem } from '@/features/tasks/types';
import { normalizeTask } from '@/features/tasks/persistence';
import { removeTaskCycles } from '@/features/tasks/transfer';

export interface ProjectBundle {
  kind: 'personal-os-project';
  version: 1;
  exportedAt: string;
  data: {
    project: ProjectDetail;
    tasks: TaskItem[];
    milestones: Milestone[];
    activities: ProjectActivity[];
    retrospective: Retrospective | null;
  };
}

export interface ProjectImportReport {
  /** 导入的任务数 */
  importedTasks: number;
  /** 结构非法被丢弃的条目数 */
  skippedInvalid: number;
  /** 清理的无效依赖边数 */
  cleanedDeps: number;
  /** 移除的循环依赖边数 */
  removedCycles: number;
  /** 清理的里程碑悬空任务引用数 */
  cleanedMilestoneRefs: number;
}

export type ProjectImportResult =
  { ok: true; bundle: ProjectBundle; report: ProjectImportReport } | { ok: false; reason: string };

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 导出项目包（纯函数）：返回 JSON 文本 */
export function serializeProjectBundle(input: {
  project: ProjectDetail;
  tasks: TaskItem[];
  milestones: Milestone[];
  activities: ProjectActivity[];
  retrospective: Retrospective | null;
}): string {
  const bundle: ProjectBundle = {
    kind: 'personal-os-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      project: input.project,
      tasks: input.tasks,
      milestones: input.milestones,
      activities: input.activities,
      retrospective: input.retrospective,
    },
  };
  return JSON.stringify(bundle, null, 2);
}

/**
 * 解析项目包（纯函数）：校验 + 重新生成 id + 引用重映射 + 无效/循环引用清理。
 * 导入结果作为「新项目」使用（projectId 为新 id）。
 */
export function parseProjectBundle(text: string): ProjectImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON 解析失败，文件可能已损坏' };
  }
  const obj = parsed as { kind?: unknown; data?: unknown };
  if (!obj || typeof obj !== 'object' || obj.kind !== 'personal-os-project') {
    return { ok: false, reason: '不是 Personal OS 项目导出文件（缺少 kind 标记）' };
  }
  const data = obj.data as Record<string, unknown> | undefined;
  if (!data || typeof data !== 'object') return { ok: false, reason: '项目数据不完整' };

  const project = normalizeProject(data.project);
  if (!project) return { ok: false, reason: '项目元数据不合法，无法导入' };

  let skippedInvalid = 0;
  const rawTasks = Array.isArray(data.tasks) ? data.tasks : [];
  const validTasks: TaskItem[] = [];
  for (const raw of rawTasks) {
    const t = normalizeTask(raw);
    if (!t) {
      skippedInvalid += 1;
      continue;
    }
    validTasks.push(t);
  }

  const rawMs = Array.isArray(data.milestones) ? data.milestones : [];
  const validMs: Milestone[] = [];
  for (const raw of rawMs) {
    const m = normalizeMilestone(raw);
    if (!m) {
      skippedInvalid += 1;
      continue;
    }
    validMs.push(m);
  }

  const rawActs = Array.isArray(data.activities) ? data.activities : [];
  const validActs: ProjectActivity[] = [];
  for (const raw of rawActs) {
    const a = normalizeActivity(raw);
    if (!a) {
      skippedInvalid += 1;
      continue;
    }
    validActs.push(a);
  }

  const retroRaw = data.retrospective == null ? null : normalizeRetrospective(data.retrospective);
  if (data.retrospective != null && !retroRaw) {
    skippedInvalid += 1;
  }

  // 重新生成 id（内部引用通过旧→新映射保持）
  const newProjectId = uid('p-');
  const taskIdMap = new Map<string, string>();
  const remappedTasks: TaskItem[] = validTasks.map((t) => {
    const newId = uid('t-');
    taskIdMap.set(t.id, newId);
    return { ...t, id: newId, projectId: newProjectId };
  });
  const newTaskIds = new Set(remappedTasks.map((t) => t.id));

  // 任务依赖清洗（指向不存在任务）→ 循环依赖移除
  let cleanedDeps = 0;
  const withDeps: TaskItem[] = remappedTasks.map((t) => {
    const deps = t.dependsOn
      .map((d) => taskIdMap.get(d))
      .filter((d): d is string => d !== undefined && newTaskIds.has(d));
    if (deps.length !== t.dependsOn.length) cleanedDeps += t.dependsOn.length - deps.length;
    return { ...t, dependsOn: deps };
  });
  const { tasks: acyclicTasks, removedEdges } = removeTaskCycles(withDeps);

  // 里程碑重映射 + 悬空任务引用清理
  let cleanedMilestoneRefs = 0;
  const milestones: Milestone[] = validMs.map((m) => {
    const taskIds = m.taskIds
      .map((id) => taskIdMap.get(id))
      .filter((id): id is string => id !== undefined && newTaskIds.has(id));
    if (taskIds.length !== m.taskIds.length)
      cleanedMilestoneRefs += m.taskIds.length - taskIds.length;
    return { ...m, id: uid('ms-'), projectId: newProjectId, taskIds };
  });

  const activities: ProjectActivity[] = validActs.map((a) => ({
    ...a,
    id: uid('a-'),
    projectId: newProjectId,
  }));

  const retrospective: Retrospective | null = retroRaw
    ? { ...retroRaw, projectId: newProjectId }
    : null;

  const bundle: ProjectBundle = {
    kind: 'personal-os-project',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      project: { ...project, id: newProjectId, favorite: false },
      tasks: acyclicTasks,
      milestones,
      activities,
      retrospective,
    },
  };

  return {
    ok: true,
    bundle,
    report: {
      importedTasks: acyclicTasks.length,
      skippedInvalid,
      cleanedDeps,
      removedCycles: removedEdges,
      cleanedMilestoneRefs,
    },
  };
}
