/**
 * 图结构校验与拓扑排序（纯函数，无 Vue 依赖）
 */
import { getNodeDef, nodeData, type WorkflowEdgeModel, type WorkflowNodeModel } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface TopoResult {
  order: string[];
  cycleIds: string[];
}

/** Kahn 拓扑排序：返回执行顺序与环内节点（有环时环外顺序仍有效） */
export function topoSort(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]): TopoResult {
  const incoming = new Map<string, number>();
  const out = new Map<string, string[]>();
  for (const n of nodes) {
    incoming.set(n.id, 0);
    out.set(n.id, []);
  }
  for (const e of edges) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) continue;
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    out.get(e.source)?.push(e.target);
  }
  const queue = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
  const order: string[] = [];
  const visited = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    for (const next of out.get(id) ?? []) {
      const v = (incoming.get(next) ?? 0) - 1;
      incoming.set(next, v);
      if (v <= 0 && !visited.has(next)) queue.push(next);
    }
  }
  const cycleIds = nodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  return { order, cycleIds };
}

/** BFS 拓扑顺序（含环内节点兜底，兼容历史行为） */
export function executionOrder(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]): string[] {
  const { order, cycleIds } = topoSort(nodes, edges);
  return [...order, ...cycleIds.filter((id) => !order.includes(id))];
}

/** 结构校验：空画布 / 缺触发器 / 存在环 / 孤立节点提示 */
export function validateGraph(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (nodes.length === 0) {
    errors.push('画布为空，请先添加节点');
    return { ok: false, errors, warnings };
  }
  const triggerCount = nodes.filter((n) => nodeData(n).kind === 'trigger').length;
  if (triggerCount === 0) {
    errors.push('工作流必须包含至少一个触发器节点');
  }
  const { cycleIds } = topoSort(nodes, edges);
  if (cycleIds.length > 0) {
    errors.push(`检测到循环依赖：${cycleIds.join(' → ')}`);
  }
  if (nodes.length > 1) {
    const targets = new Set(edges.map((e) => e.target));
    const sources = new Set(edges.map((e) => e.source));
    for (const n of nodes) {
      if (!targets.has(n.id) && !sources.has(n.id)) {
        warnings.push(
          `节点「${nodeData(n).label || getNodeDef(nodeData(n).kind).label}」未与任何节点连接`,
        );
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** 计算统计：节点数 / 连线数 / 触发器数 */
export function graphStats(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]) {
  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    triggerCount: nodes.filter((n) => nodeData(n).kind === 'trigger').length,
  };
}
