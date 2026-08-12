/**
 * AI 自动连线：端口定义与连接算法（纯函数，无 Vue 依赖）
 *
 * 每个节点类型声明输入/输出端口（名称、类型、说明），
 * autoConnect 基于端口类型兼容性做链式连接：
 * - 唯一合法目标 → 自动连接（可解释：src.out -> dst.in）
 * - 多候选目标 → 标记为待确认（pending），由用户勾选
 * - 无合法目标 → 仅警告，绝不强连
 * - 拒绝自连接 / 重复边 / 循环（只向拓扑顺序之后的节点连接）
 */

import type { WorkflowEdgeModel, WorkflowNodeKind, WorkflowNodeModel } from './types';
import { nodeData } from './types';

/** 端口类型：control=控制流 / data=数据流 / branch=条件分支 */
export type PortType = 'control' | 'data' | 'branch';

export interface PortDef {
  id: string;
  label: string;
  type: PortType;
  /** 该端口是否必需（用于提示待填写） */
  required?: boolean;
}

export interface NodePorts {
  inputs: PortDef[];
  outputs: PortDef[];
}

/** 各节点类型端口定义（与画布锚点设计一致：delay/notify/output 无出边） */
export const NODE_PORTS: Record<WorkflowNodeKind, NodePorts> = {
  trigger: {
    inputs: [],
    outputs: [{ id: 'start', label: '触发', type: 'control' }],
  },
  prompt: {
    inputs: [{ id: 'input', label: '输入文本', type: 'data' }],
    outputs: [{ id: 'text', label: '模板输出', type: 'data' }],
  },
  ai: {
    inputs: [{ id: 'input', label: '输入', type: 'data', required: true }],
    outputs: [{ id: 'result', label: '生成结果', type: 'data' }],
  },
  code: {
    inputs: [{ id: 'input', label: '输入数据', type: 'data' }],
    outputs: [{ id: 'result', label: '执行结果', type: 'data' }],
  },
  condition: {
    inputs: [{ id: 'input', label: '判断输入', type: 'data', required: true }],
    outputs: [
      { id: 'true', label: '通过', type: 'branch' },
      { id: 'false', label: '不通过', type: 'branch' },
    ],
  },
  delay: {
    inputs: [{ id: 'input', label: '触发', type: 'control' }],
    outputs: [],
  },
  notify: {
    inputs: [{ id: 'input', label: '消息内容', type: 'data' }],
    outputs: [],
  },
  output: {
    inputs: [{ id: 'input', label: '输出数据', type: 'data' }],
    outputs: [],
  },
};

export function getPorts(kind: WorkflowNodeKind): NodePorts {
  return NODE_PORTS[kind] ?? { inputs: [], outputs: [] };
}

/** 端口类型兼容性：src 类型能否连到 dst 类型 */
export function canConnect(srcType: PortType, dstType: PortType): boolean {
  if (srcType === 'control' || srcType === 'branch') return true; // 控制/分支可驱动任何输入
  if (srcType === 'data') return dstType === 'data'; // 数据流只接数据输入
  return false;
}

export interface PendingTarget {
  nodeId: string;
  handle: string;
  label: string;
}

export interface PendingConnection {
  /** 源节点 id */
  sourceId: string;
  /** 源端口 id */
  sourceHandle: string;
  sourceLabel: string;
  targets: PendingTarget[];
}

export interface AutoConnectResult {
  /** 自动生成的边 */
  edges: WorkflowEdgeModel[];
  /** 多候选端口，待用户确认 */
  pending: PendingConnection[];
  /** 警告（无合法端口 / 孤立节点） */
  warnings: string[];
  /** 可解释的连接说明，如「trigger.start -> ai.input」 */
  explanations: string[];
  /** 被拒绝的连接（自连接 / 重复 / 循环） */
  rejected: string[];
}

export function explainEdge(source: string, sourceHandle: string, target: string): string {
  return `${source}.${sourceHandle} -> ${target}.input`;
}

/**
 * 链式自动连线（可解释、无环、可测试）：
 * 1. 主链：nodes[i] 连 nodes[i+1]（未入边且端口可接），用第一个可接输出端口
 * 2. 分支补连：多输出端口节点（条件判断）未用的端口，连后续第一个未入边可接节点；
 *    多个候选时自动连第一个，其余标记 pending（待确认，不强连）
 * 3. 单输出节点若主链未连接（后续不可接），尝试连后续第一个可接节点
 * 4. 孤立节点（始终无入边且非首节点）给出警告
 * 5. pending 目标视为已占用，避免其他端口重复连接
 */
export function autoConnect(
  nodes: WorkflowNodeModel[],
  existingEdges: WorkflowEdgeModel[] = [],
): AutoConnectResult {
  const result: AutoConnectResult = {
    edges: [],
    pending: [],
    warnings: [],
    explanations: [],
    rejected: [],
  };
  if (nodes.length === 0) return result;

  const taken = new Set<string>(existingEdges.map((e) => e.target));
  const edgeKey = new Set<string>(
    existingEdges.map((e) => `${e.source}:${e.sourceHandle ?? ''}:${e.target}`),
  );
  const usedOut = new Set<string>(existingEdges.map((e) => `${e.source}:${e.sourceHandle ?? ''}`));

  const addEdge = (source: string, sourceHandle: string, target: string): boolean => {
    const key = `${source}:${sourceHandle}:${target}`;
    if (edgeKey.has(key)) {
      result.rejected.push(`重复边：${explainEdge(source, sourceHandle, target)}`);
      return false;
    }
    if (source === target) {
      result.rejected.push(`自连接被拒绝：${source}`);
      return false;
    }
    edgeKey.add(key);
    usedOut.add(`${source}:${sourceHandle}`);
    taken.add(target);
    result.edges.push({
      id: `e-${source}-${sourceHandle}-${target}`,
      source,
      sourceHandle,
      target,
      targetHandle: 'input',
      type: 'smoothstep',
    });
    result.explanations.push(explainEdge(source, sourceHandle, target));
    return true;
  };

  const canReceive = (m: WorkflowNodeModel, outType: PortType): boolean =>
    getPorts(nodeData(m).kind).inputs.some((inp) => canConnect(outType, inp.type));

  /** 后续未入边且可接 outType 的节点（含已入 pending 的排除） */
  const candidatesAfter = (i: number, outType: PortType): WorkflowNodeModel[] =>
    nodes
      .slice(i + 1)
      .filter((m) => m.id !== nodes[i]!.id && !taken.has(m.id) && canReceive(m, outType));

  /* 1. 主链 */
  for (let i = 0; i < nodes.length - 1; i++) {
    const n = nodes[i]!;
    const next = nodes[i + 1]!;
    if (taken.has(next.id)) {
      if (nodes.some((m) => m.id === next.id && m.id !== n.id)) {
        // 直接后继已被连接（可能来自已有边）→ 重复尝试记 rejected
        const usedPorts = getPorts(nodeData(n).kind).outputs;
        for (const out of usedPorts) {
          if (canReceive(next, out.type)) {
            result.rejected.push(`重复边：${explainEdge(n.id, out.id, next.id)}`);
          }
        }
      }
      continue;
    }
    const out = getPorts(nodeData(n).kind).outputs.find((o) => canReceive(next, o.type));
    if (out) addEdge(n.id, out.id, next.id);
  }

  /* 2+3. 剩余输出端口：分支补连 / 单端口补连 */
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i]!;
    const outs = getPorts(nodeData(n).kind).outputs;
    for (const out of outs) {
      const usedKey = `${n.id}:${out.id}`;
      if (usedOut.has(usedKey)) continue; // 主链已用
      const candidates = candidatesAfter(i, out.type);
      if (candidates.length === 0) continue;
      // 唯一或首个候选自动连；其余标记 pending
      addEdge(n.id, out.id, candidates[0]!.id);
      if (candidates.length > 1) {
        result.pending.push({
          sourceId: n.id,
          sourceHandle: out.id,
          sourceLabel: `${n.id}.${out.id}`,
          targets: candidates.slice(1).map((m) => ({
            nodeId: m.id,
            handle: 'input',
            label: m.id,
          })),
        });
        // pending 目标占用，避免被其他端口再次连接
        candidates.slice(1).forEach((m) => taken.add(m.id));
      }
    }
  }

  /* 4. 孤立节点警告 */
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    const hasIn =
      taken.has(n.id) || result.pending.some((p) => p.targets.some((t) => t.nodeId === n.id));
    if (!hasIn) {
      result.warnings.push(`节点 ${n.id} 没有输入连线（孤立节点）`);
    }
  }

  return result;
}

/** 生成边 id（复用 types.nextEdgeId 同规则） */
export function previewEdgeId(source: string, sourceHandle: string, target: string): string {
  return `pe-${source}-${sourceHandle}-${target}`;
}
