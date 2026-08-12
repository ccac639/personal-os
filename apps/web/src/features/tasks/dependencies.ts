/**
 * 任务依赖（前置依赖）纯函数（可单测，不依赖 store）
 *
 * 规则：
 * - 禁止自依赖（dependsOn 含自身）；
 * - 禁止重复依赖（同一前置出现多次）；
 * - 禁止循环依赖（A → B → A）；
 * - 禁止引用不存在的任务；
 * - 前置任务未完成（status !== 'done'）时，本任务视为「受阻」，
 *   但允许用户显式继续执行（受阻仅作视觉提示，不做强制拦截）。
 */
import type { TaskItem } from './types';

export type DependencyIssueType = 'self' | 'duplicate' | 'cycle' | 'missing';

export interface DependencyIssue {
  type: DependencyIssueType;
  taskId: string;
  /** 涉及的另一个任务 id（self/duplicate/missing 为直接引用；cycle 为首个环内节点） */
  refId: string;
  message: string;
}

export type DependencyResult = { ok: true; issues: [] } | { ok: false; issues: DependencyIssue[] };

/** 全量依赖校验（纯函数）：检测自依赖、重复、循环、引用不存在 */
export function validateDependencies(tasks: TaskItem[]): DependencyResult {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const issues: DependencyIssue[] = [];

  for (const t of tasks) {
    const seen = new Set<string>();
    for (const depId of t.dependsOn) {
      if (depId === t.id) {
        issues.push({
          type: 'self',
          taskId: t.id,
          refId: depId,
          message: `任务「${t.title}」不能依赖自身`,
        });
        continue;
      }
      if (seen.has(depId)) {
        issues.push({
          type: 'duplicate',
          taskId: t.id,
          refId: depId,
          message: `任务「${t.title}」重复依赖「${byId.get(depId)?.title ?? depId}」`,
        });
        continue;
      }
      seen.add(depId);
      const dep = byId.get(depId);
      if (!dep) {
        issues.push({
          type: 'missing',
          taskId: t.id,
          refId: depId,
          message: `任务「${t.title}」引用了不存在的任务`,
        });
        continue;
      }
      if (hasCycleFrom(depId, t.id, byId)) {
        issues.push({
          type: 'cycle',
          taskId: t.id,
          refId: depId,
          message: `任务「${t.title}」与前置任务存在循环依赖`,
        });
      }
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, issues: [] };
}

/** 从 start 出发沿依赖链是否能到达 target（存在 start → … → target 路径即构成环） */
function hasCycleFrom(start: string, target: string, byId: Map<string, TaskItem>): boolean {
  const visited = new Set<string>();
  const stack = [start];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === target) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const task = byId.get(cur);
    if (!task) continue;
    for (const depId of task.dependsOn) {
      if (!visited.has(depId)) stack.push(depId);
    }
  }
  return false;
}

/** 单条依赖能否添加（纯函数）：不新增任何违规即允许 */
export function canAddDependency(
  task: TaskItem,
  depId: string,
  byId: Map<string, TaskItem>,
): { ok: true } | { ok: false; reason: string } {
  if (depId === task.id) return { ok: false, reason: '任务不能依赖自身' };
  if (task.dependsOn.includes(depId)) return { ok: false, reason: '该依赖已存在' };
  const dep = byId.get(depId);
  if (!dep) return { ok: false, reason: '前置任务不存在' };
  // 反向检测：dep 的依赖链中若已能到达 task，则添加后成环
  if (hasCycleFrom(depId, task.id, byId)) {
    return { ok: false, reason: '添加该依赖会形成循环依赖' };
  }
  return { ok: true };
}

/** 某任务是否受阻（纯函数）：存在未完成或缺失的前置任务 */
export function isBlocked(task: TaskItem, byId: Map<string, TaskItem>): boolean {
  if (task.status === 'done') return false;
  return task.dependsOn.some((depId) => {
    const dep = byId.get(depId);
    return !dep || dep.status !== 'done';
  });
}

/** 未完成的前置任务列表（抽屉展示阻塞原因用） */
export function blockingDependencies(task: TaskItem, byId: Map<string, TaskItem>): TaskItem[] {
  const out: TaskItem[] = [];
  for (const depId of task.dependsOn) {
    const dep = byId.get(depId);
    if (dep && dep.status !== 'done') out.push(dep);
  }
  return out;
}
