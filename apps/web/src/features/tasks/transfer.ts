/**
 * 任务导入 / 导出 —— 纯函数（可单测，不依赖 store）
 *
 * 导出：任务 JSON（数组或 { tasks } 信封，含全部扩展字段）；
 * 导入：严格校验（normalizeTask）→ 归属当前项目 → 重新生成 id（避免与
 * 现有任务冲突，依赖内部一致性通过 id 重映射保持）→ 清理指向不存在任务的
 * 依赖 → 移除循环依赖边。任何一步失败返回可读原因，绝不静默写入。
 */
import { isValidDateStr } from '@/features/projects/plan';
import { normalizeTask } from './persistence';
import type { TaskItem } from './types';

export interface TasksImportReport {
  /** 成功导入的任务数 */
  imported: number;
  /** 结构非法被丢弃的条目数 */
  skippedInvalid: number;
  /** 清理的无效依赖边数 */
  cleanedDeps: number;
  /** 移除的循环依赖边数 */
  removedCycles: number;
}

export type TasksImportResult =
  { ok: true; tasks: TaskItem[]; report: TasksImportReport } | { ok: false; reason: string };

/** 导出任务（纯函数）：返回 JSON 文本 */
export function serializeTasks(tasks: TaskItem[]): string {
  return JSON.stringify({ tasks }, null, 2);
}

function uid(prefix = 't-'): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 检测任务是否存在循环依赖（纯函数；图拓扑排序，有环返回 true） */
export function hasTaskCycle(tasks: TaskItem[]): boolean {
  const ids = new Set(tasks.map((t) => t.id));
  const inDeg = new Map<string, number>();
  for (const t of tasks) inDeg.set(t.id, 0);
  for (const t of tasks) {
    for (const d of t.dependsOn) {
      if (ids.has(d)) inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1);
    }
  }
  const queue = tasks.filter((t) => (inDeg.get(t.id) ?? 0) === 0).map((t) => t.id);
  let visited = 0;
  while (queue.length) {
    const id = queue.shift()!;
    visited += 1;
    for (const t of tasks) {
      if (t.dependsOn.includes(id)) {
        const next = (inDeg.get(t.id) ?? 0) - 1;
        inDeg.set(t.id, next);
        if (next === 0) queue.push(t.id);
      }
    }
  }
  return visited < ids.size;
}

/**
 * 移除循环依赖（纯函数）：反复定位环上节点并删除其一条环内依赖边，
 * 直到无环。返回清洗后的任务与移除边数。
 */
export function removeTaskCycles(tasks: TaskItem[]): { tasks: TaskItem[]; removedEdges: number } {
  const out: TaskItem[] = tasks.map((t) => ({ ...t, dependsOn: [...t.dependsOn] }));
  let removedEdges = 0;
  for (let guard = 0; guard < 1000; guard += 1) {
    const ids = new Set(out.map((t) => t.id));
    const inDeg = new Map<string, number>();
    for (const t of out) inDeg.set(t.id, 0);
    for (const t of out) {
      for (const d of t.dependsOn) {
        if (ids.has(d)) inDeg.set(t.id, (inDeg.get(t.id) ?? 0) + 1);
      }
    }
    const queue = out.filter((t) => (inDeg.get(t.id) ?? 0) === 0).map((t) => t.id);
    const reached = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      reached.add(id);
      for (const t of out) {
        if (t.dependsOn.includes(id)) {
          const next = (inDeg.get(t.id) ?? 0) - 1;
          inDeg.set(t.id, next);
          if (next === 0) queue.push(t.id);
        }
      }
    }
    const cyclic = out.filter((t) => !reached.has(t.id));
    if (!cyclic.length) break;
    const victim = cyclic[0]!;
    const edge = victim.dependsOn.find((d) => cyclic.some((c) => c.id === d));
    if (!edge) break;
    victim.dependsOn = victim.dependsOn.filter((d) => d !== edge);
    removedEdges += 1;
  }
  return { tasks: out, removedEdges };
}

/**
 * 解析任务 JSON（纯函数）：数组 或 { tasks } 信封；
 * 强制归属 currentProjectId、重新生成 id、清理无效依赖与循环依赖。
 */
export function parseTasksJson(text: string, currentProjectId: string): TasksImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'JSON 解析失败，文件可能已损坏' };
  }
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { tasks?: unknown })?.tasks)
      ? (parsed as { tasks: unknown[] }).tasks
      : null;
  if (!rawList) return { ok: false, reason: '任务数据格式不合法（需要数组或 { tasks: [...] }）' };

  let skippedInvalid = 0;
  const valid: TaskItem[] = [];
  for (const raw of rawList) {
    const t = normalizeTask(raw);
    if (!t) {
      skippedInvalid += 1;
      continue;
    }
    valid.push(t);
  }
  if (!valid.length) return { ok: false, reason: '未找到合法任务数据' };

  // 重新生成 id（内部依赖通过旧→新映射保持）
  const idMap = new Map<string, string>();
  const remapped: TaskItem[] = valid.map((t) => {
    const newId = uid();
    idMap.set(t.id, newId);
    return { ...t, id: newId };
  });
  const newIds = new Set(remapped.map((t) => t.id));

  // 清洗无效依赖（指向不存在任务 / 未导出的任务）
  let cleanedDeps = 0;
  const withDeps: TaskItem[] = remapped.map((t) => {
    const deps = t.dependsOn
      .map((d) => idMap.get(d))
      .filter((d): d is string => d !== undefined && newIds.has(d));
    if (deps.length !== t.dependsOn.length) cleanedDeps += t.dependsOn.length - deps.length;
    return { ...t, dependsOn: deps };
  });

  // 移除循环依赖
  const { tasks: acyclic, removedEdges } = removeTaskCycles(withDeps);

  // 强制归属当前项目，重置列内排序与时间戳相关字段
  const imported: TaskItem[] = acyclic.map((t, i) => ({
    ...t,
    projectId: currentProjectId,
    order: i,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    dueDate: isValidDateStr(t.dueDate) ? t.dueDate : undefined,
  }));

  return {
    ok: true,
    tasks: imported,
    report: { imported: imported.length, skippedInvalid, cleanedDeps, removedCycles: removedEdges },
  };
}
