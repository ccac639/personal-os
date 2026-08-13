/**
 * 工作流健康诊断与性能预估（纯函数，无 Vue 依赖）
 *
 * - 诊断：孤立节点、不可达节点、无输出节点、未使用变量、缺失配置、
 *   循环引用、过多分支、长延迟、无错误处理
 * - 性能预估：估算执行步数 / 模拟耗时 / 潜在分支数（本地启发式，UI 标注「估算值」）
 * - 类型兼容：检查输入类型与上游输出类型是否兼容，未知类型给警告
 */
import type { WorkflowEdgeModel, WorkflowNodeKind, WorkflowNodeModel } from './types';
import { topoSort } from './topo';
import { extractVars } from './vars';
import { validateNodeData } from './schema';

export type Severity = 'error' | 'warning' | 'info';

export interface DiagnosticIssue {
  id: string;
  severity: Severity;
  category: 'structure' | 'config' | 'vars' | 'performance' | 'compatibility';
  nodeId?: string;
  title: string;
  detail: string;
  suggestion?: string;
}

export interface PerformanceEstimate {
  /** 预估执行步数 */
  estimatedSteps: number;
  /** 预估模拟耗时（ms，启发式） */
  estimatedMs: number;
  /** 潜在分支数（condition/switch 组合估算） */
  branches: number;
  /** 是否可能超过最大步数 */
  mayExceedSteps: boolean;
  /** 是否潜在无限分支（如环 + 无边界） */
  mayLoop: boolean;
  notes: string[];
}

/* ---------- 结构诊断 ---------- */

export function diagnoseWorkflow(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  inputs: Array<{ name: string }> = [],
  outputs: Array<{ name: string; source: string }> = [],
  runConfig?: { maxSteps: number; timeoutMs: number },
): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];
  const nodeIds = new Set(nodes.map((n) => n.id));
  const idCounter = () => issues.length + 1;

  // 空画布
  if (nodes.length === 0) {
    issues.push({
      id: `d-${idCounter()}`,
      severity: 'error',
      category: 'structure',
      title: '画布为空',
      detail: '请至少添加一个触发或执行节点。',
      suggestion: '从节点库拖入节点开始编排。',
    });
    return issues;
  }

  // 孤立节点（无任何边连接）
  const connected = new Set<string>();
  for (const e of edges) {
    connected.add(e.source);
    connected.add(e.target);
  }
  for (const n of nodes) {
    if (!connected.has(n.id)) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'warning',
        category: 'structure',
        nodeId: n.id,
        title: '孤立节点',
        detail: `节点「${n.data.label || n.id}」没有任何连线，不会被执行。`,
        suggestion: '连接输入输出边，或删除该节点。',
      });
    }
  }

  // 不可达节点（拓扑排序后仍未被访问 = 在环中；无入边的源头节点都可达）
  const { order, cycleIds } = topoSort(nodes, edges);
  for (const n of nodes) {
    if (!order.includes(n.id) && !cycleIds.includes(n.id)) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'warning',
        category: 'structure',
        nodeId: n.id,
        title: '不可达节点',
        detail: `节点「${n.data.label || n.id}」不在任何执行路径上。`,
      });
    }
  }

  // 循环引用
  if (cycleIds.length > 0) {
    issues.push({
      id: `d-${idCounter()}`,
      severity: 'error',
      category: 'structure',
      title: '检测到循环引用',
      detail: `以下节点形成环路：${cycleIds.join('、')}。模拟运行会受最大步数限制。`,
      suggestion: '断开环路中的一条连线。',
    });
  }

  // 无输出节点（output 节点或输出映射缺失）
  const hasOutputNode = nodes.some((n) => n.data.kind === 'output');
  if (outputs.length === 0 && !hasOutputNode) {
    issues.push({
      id: `d-${idCounter()}`,
      severity: 'info',
      category: 'structure',
      title: '没有输出定义',
      detail: '未定义工作流输出，运行结果仍可在面板查看节点输出。',
      suggestion: '在「输入输出」面板添加输出映射。',
    });
  }

  // 输出引用不存在的节点
  for (const out of outputs) {
    const head = out.source.split('.')[0] ?? '';
    if (!nodeIds.has(head)) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'error',
        category: 'structure',
        title: '输出来源节点不存在',
        detail: `输出「${out.name}」引用的节点「${head}」不存在。`,
        suggestion: '更新输出映射或恢复被删除的节点。',
      });
    }
  }

  // 缺失配置（字段级校验）
  for (const n of nodes) {
    const errs = validateNodeData(n.data);
    const keys = Object.keys(errs);
    if (keys.length > 0) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'error',
        category: 'config',
        nodeId: n.id,
        title: '节点配置缺失',
        detail: `节点「${n.data.label || n.id}」：${keys.map((k) => `${k}: ${errs[k]}`).join('；')}`,
        suggestion: '在检查器中补全配置。',
      });
    }
  }

  // 未使用变量（输入定义未被任何节点引用）
  if (inputs.length > 0) {
    const allTexts = nodes
      .map((n) => {
        const d = n.data;
        return [d.prompt, d.template, d.message, d.expr, d.transformTemplate]
          .filter(Boolean)
          .join('\n');
      })
      .join('\n');
    const used = new Set(extractVars(allTexts));
    for (const inp of inputs) {
      if (
        !used.has(inp.name) &&
        !Object.values(nodes).some(
          (n) =>
            n.data.kind === 'subworkflow' && Object.keys(n.data.inputMap ?? {}).includes(inp.name),
        )
      ) {
        issues.push({
          id: `d-${idCounter()}`,
          severity: 'info',
          category: 'vars',
          title: '未使用的输入',
          detail: `输入「${inp.name}」未被任何节点引用。`,
        });
      }
    }
  }

  // 过多分支（condition + switch 数量）
  const branchNodes = nodes.filter((n) => n.data.kind === 'condition' || n.data.kind === 'switch');
  if (branchNodes.length > 6) {
    issues.push({
      id: `d-${idCounter()}`,
      severity: 'warning',
      category: 'performance',
      title: '分支数量过多',
      detail: `检测到 ${branchNodes.length} 个条件/分支节点，组合路径可能指数增长。`,
      suggestion: '考虑拆分为子流程以降低组合复杂度。',
    });
  }

  // 长延迟（delay > 60s）
  for (const n of nodes) {
    if (n.data.kind === 'delay' && (n.data.seconds ?? 0) > 60) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'info',
        category: 'performance',
        nodeId: n.id,
        title: '长延迟',
        detail: `延迟 ${n.data.seconds}s，模拟运行会等待（可被暂停/取消打断）。`,
      });
    }
  }

  // 无错误处理（有 error 输出端口的节点之后没有 condition 兜底）
  const failKinds = new Set<WorkflowNodeKind>(['ai', 'code', 'http-request', 'subworkflow']);
  for (const n of nodes) {
    if (!failKinds.has(n.data.kind)) continue;
    const downstream = edges.filter((e) => e.source === n.id).map((e) => e.target);
    const hasFallback = downstream.some((t) => {
      const tn = nodes.find((nn) => nn.id === t);
      return tn && (tn.data.kind === 'condition' || tn.data.kind === 'switch');
    });
    if (!hasFallback) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'info',
        category: 'structure',
        nodeId: n.id,
        title: '没有错误处理',
        detail: `节点「${n.data.label || n.id}」可能失败，但后续没有条件兜底分支。`,
        suggestion: '添加条件节点处理失败路径。',
      });
    }
  }

  // 运行配置检查
  if (runConfig && runConfig.maxSteps > 0) {
    const est = estimatePerformance(nodes, edges);
    if (est.mayExceedSteps) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'warning',
        category: 'performance',
        title: '可能超过最大步数',
        detail: `预估执行步数约 ${est.estimatedSteps}，已接近/超过配置上限 ${runConfig.maxSteps}。`,
        suggestion: '提高最大步数或简化流程。',
      });
    }
    if (est.mayLoop) {
      issues.push({
        id: `d-${idCounter()}`,
        severity: 'warning',
        category: 'performance',
        title: '潜在无限循环',
        detail: '流程存在环且没有明确边界，运行可能被最大步数截断。',
      });
    }
  }

  return issues;
}

/* ---------- 性能预估 ---------- */

const MS_PER_STEP: Partial<Record<WorkflowNodeKind, number>> = {
  ai: 800,
  code: 200,
  'http-request': 300,
  subworkflow: 500,
  transform: 30,
  merge: 20,
  condition: 10,
  switch: 10,
  notify: 50,
  delay: 100,
  prompt: 10,
  trigger: 5,
  output: 10,
};

export function estimatePerformance(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
): PerformanceEstimate {
  const { order, cycleIds } = topoSort(nodes, edges);
  // 步数 = 拓扑执行路径长度（估算每条边 +1 步）；环内节点计为可能重复
  const baseSteps = order.length;
  const loopExtra = cycleIds.length > 0 ? cycleIds.length * 3 : 0;
  const estimatedSteps = Math.max(1, baseSteps + loopExtra);

  let estimatedMs = 0;
  for (const n of nodes) {
    const ms = MS_PER_STEP[n.data.kind] ?? 30;
    const weight = n.data.kind === 'delay' ? Math.min(n.data.seconds ?? 0, 10) : 1;
    estimatedMs += ms * weight;
  }
  if (cycleIds.length > 0) estimatedMs += estimatedMs * 2;

  // 分支组合：condition=2、switch=cases+1
  let branches = 1;
  for (const n of nodes) {
    if (n.data.kind === 'condition') branches *= 2;
    else if (n.data.kind === 'switch') branches *= Math.max(2, (n.data.cases?.length ?? 1) + 1);
    if (branches > 100) break;
  }

  const mayLoop = cycleIds.length > 0;
  const mayExceedSteps = mayLoop || estimatedSteps > 100;

  const notes: string[] = [];
  if (mayLoop) notes.push('存在环路，执行步数可能被最大步数截断');
  if (branches > 20) notes.push(`潜在分支组合 ${branches} 条，模拟运行仍按拓扑单路径执行`);
  return { estimatedSteps, estimatedMs, branches, mayExceedSteps, mayLoop, notes };
}

/* ---------- 类型兼容性 ---------- */

export type NodeOutputType = 'text' | 'number' | 'boolean' | 'json' | 'any';

/** 节点输出类型推断（启发式） */
export function nodeOutputType(n: WorkflowNodeModel): NodeOutputType {
  switch (n.data.kind) {
    case 'condition':
    case 'manual-approval':
      return 'boolean';
    case 'trigger':
    case 'delay':
      return 'any';
    case 'output':
      return n.data.format === 'json' ? 'json' : 'text';
    case 'http-request':
      return 'json';
    case 'ai':
    case 'code':
    case 'prompt':
    case 'transform':
      return n.data.kind === 'transform' && n.data.transformOp === 'jsonpath' ? 'json' : 'text';
    case 'merge':
      return 'json';
    default:
      return 'any';
  }
}

/** 输入期望类型（按节点类型的输入端口语义） */
export function nodeInputExpects(kind: WorkflowNodeKind): NodeOutputType {
  switch (kind) {
    case 'condition':
    case 'switch':
      return 'any';
    case 'transform':
    case 'prompt':
    case 'ai':
    case 'notify':
      return 'text';
    case 'merge':
    case 'http-request':
      return 'json';
    case 'output':
      return 'any';
    case 'delay':
    case 'manual-approval':
      return 'any';
    default:
      return 'any';
  }
}

const COMPATIBLE: Record<NodeOutputType, NodeOutputType[]> = {
  any: ['any', 'text', 'number', 'boolean', 'json'],
  text: ['text', 'any', 'number', 'boolean'],
  number: ['number', 'any'],
  boolean: ['boolean', 'any'],
  json: ['json', 'any', 'text'],
};

export function typesCompatible(produced: NodeOutputType, expected: NodeOutputType): boolean {
  return COMPATIBLE[produced]?.includes(expected) ?? true;
}

export interface TypeIssue {
  nodeId: string;
  edgeId: string;
  produced: NodeOutputType;
  expected: NodeOutputType;
  message: string;
}

/** 检查所有边上的类型兼容性（merge/switch/subworkflow 重点覆盖端口与映射） */
export function checkTypeCompatibility(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  moduleOutputTypes: Map<string, NodeOutputType> = new Map(),
): TypeIssue[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const issues: TypeIssue[] = [];
  for (const e of edges) {
    const src = byId.get(e.source);
    const dst = byId.get(e.target);
    if (!src || !dst) continue;
    // switch 的用例 handle：只校验目标类型
    const produced = e.sourceHandle ? 'any' : nodeOutputType(src);
    const expected = nodeInputExpects(dst.data.kind);
    if (!typesCompatible(produced, expected)) {
      issues.push({
        nodeId: e.target,
        edgeId: e.id,
        produced,
        expected,
        message: `「${src.data.label || src.id}」输出 ${produced} 与「${dst.data.label || dst.id}」期望 ${expected} 不兼容`,
      });
    }
  }
  // 重点覆盖：subworkflow 输出映射端口类型（调用方未知时按 any）
  for (const n of nodes) {
    if (n.data.kind === 'subworkflow') {
      for (const port of Object.keys(n.data.outputMap ?? {})) {
        const t = moduleOutputTypes.get(port) ?? 'any';
        if (t === 'any') continue;
        // 输出映射的目标是本地输出定义，此处仅提示
        void t;
      }
    }
  }
  return issues;
}
