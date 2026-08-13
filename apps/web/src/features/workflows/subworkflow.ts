/**
 * 子流程引用校验（纯函数，无 Vue 依赖）
 *
 * - 禁止自引用（选择自身）
 * - 禁止循环引用（A → B → A）
 * - 被调用流程不存在 / 已归档时明确报错
 * - 输入映射：本地变量路径存在；子流程输入端口存在且必填已映射
 * - 输出映射：子流程输出端口存在；本地输出名唯一
 */
import type { WorkflowNodeModel } from './types';
import { extractPath } from './io';

export interface SubflowRef {
  /** 子流程节点 id */
  nodeId: string;
  /** 被调用的工作流 id */
  refId: string;
}

export interface SubflowIssue {
  nodeId: string;
  level: 'error' | 'warning';
  message: string;
}

export interface WorkflowStub {
  id: string;
  name: string;
  archived?: boolean;
  /** 输入端口（名称 → 是否必填） */
  inputPorts: Record<string, boolean>;
  /** 输出端口（名称集合） */
  outputPorts: string[];
}

/** 收集所有 subworkflow 节点的引用。 */
export function collectSubflowRefs(nodes: WorkflowNodeModel[]): SubflowRef[] {
  const refs: SubflowRef[] = [];
  for (const n of nodes) {
    if (n.data.kind === 'subworkflow' && n.data.workflowRef) {
      refs.push({ nodeId: n.id, refId: n.data.workflowRef });
    }
  }
  return refs;
}

/**
 * 基于工作流级引用图检测循环（DFS 三色标记）。
 * allRefs：工作流 id → 该工作流内引用的工作流 id 列表（含全部工作流）。
 * 返回成环路径（若从 ownId 可达的引用图中存在环），否则 null。
 */
export function detectWorkflowCycle(
  ownId: string,
  allRefs: Map<string, string[]>,
): string[] | null {
  const visiting = new Set<string>();
  const done = new Set<string>();
  const chain: string[] = [];

  const visit = (id: string): string[] | null => {
    if (done.has(id)) return null;
    if (visiting.has(id)) {
      const start = chain.indexOf(id);
      return chain.slice(start >= 0 ? start : 0);
    }
    visiting.add(id);
    chain.push(id);
    for (const target of allRefs.get(id) ?? []) {
      const cycle = visit(target);
      if (cycle) return cycle;
    }
    visiting.delete(id);
    done.add(id);
    chain.pop();
    return null;
  };

  return visit(ownId);
}

/** 单工作流内子流程校验（不含跨工作流循环，循环由 store 用 detectWorkflowCycle 判定） */
export function validateSubflowRefs(
  nodes: WorkflowNodeModel[],
  workflows: WorkflowStub[],
  ownId: string,
): SubflowIssue[] {
  const issues: SubflowIssue[] = [];
  const byId = new Map(workflows.map((w) => [w.id, w]));
  for (const n of nodes) {
    if (n.data.kind !== 'subworkflow') continue;
    const refId = n.data.workflowRef;
    if (!refId) {
      issues.push({ nodeId: n.id, level: 'error', message: '子流程未选择被调用工作流' });
      continue;
    }
    if (refId === ownId) {
      issues.push({ nodeId: n.id, level: 'error', message: '禁止选择当前工作流自身作为子流程' });
      continue;
    }
    const target = byId.get(refId);
    if (!target) {
      issues.push({ nodeId: n.id, level: 'error', message: `被调用工作流不存在（id: ${refId}）` });
      continue;
    }
    if (target.archived) {
      issues.push({
        nodeId: n.id,
        level: 'error',
        message: `被调用工作流「${target.name}」已归档，无法调用`,
      });
      continue;
    }
    // 输入映射：子流程必填输入必须有映射；映射的本地变量路径须可达
    const inputMap = n.data.inputMap ?? {};
    for (const [port, required] of Object.entries(target.inputPorts)) {
      const mapped = Object.values(inputMap).includes(port);
      if (required && !mapped) {
        issues.push({
          nodeId: n.id,
          level: 'error',
          message: `子流程「${target.name}」必填输入「${port}」未映射`,
        });
      }
    }
    for (const [local, port] of Object.entries(inputMap)) {
      if (!Object.prototype.hasOwnProperty.call(target.inputPorts, port)) {
        issues.push({
          nodeId: n.id,
          level: 'error',
          message: `输入端口「${port}」不存在于子流程「${target.name}」`,
        });
      }
      const [head] = local.split('.');
      const isNodeRef = nodes.some((nn) => nn.id === head);
      if (!isNodeRef && head !== 'input' && head !== 'previous' && head !== 'context') {
        issues.push({
          nodeId: n.id,
          level: 'warning',
          message: `输入映射来源「${local}」可能不是有效变量路径`,
        });
      }
    }
    // 输出映射：端口存在
    const outputMap = n.data.outputMap ?? {};
    for (const [, port] of Object.entries(outputMap)) {
      if (!target.outputPorts.includes(port)) {
        issues.push({
          nodeId: n.id,
          level: 'error',
          message: `输出端口「${port}」不存在于子流程「${target.name}」`,
        });
      }
    }
  }
  return issues;
}

/** 子流程输出提取：按映射将端口值写入本地名 */
export function extractSubflowOutputs(
  outputMap: Record<string, string> | undefined,
  subflowOutputs: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!outputMap) return out;
  for (const [local, port] of Object.entries(outputMap)) {
    out[local] = extractPath(subflowOutputs, port);
  }
  return out;
}
