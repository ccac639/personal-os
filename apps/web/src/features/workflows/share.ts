/**
 * 只读分享快照（纯函数，无 Vue 依赖）
 *
 * - 生成只读 JSON 快照：不含运行时状态、敏感字段、运行历史、配置档案
 * - 复制内容 / 下载，不生成网络 URL，不涉及真实分享服务
 * - 导入为新工作流：独立工作流 id + 节点 id 重映射，避免与现有冲突
 * - 导入前快速结构检查：只做浅层形状校验，不做完整深校验
 *   （完整校验由导入确认阶段执行，避免大对象重复序列化）
 */
import {
  NODE_KINDS,
  type WorkflowEdgeModel,
  type WorkflowInputDef,
  type WorkflowNodeModel,
  type WorkflowOutputDef,
  type WorkflowRunConfig,
} from './types';
import { sanitizeNodes } from './migrate';
import { defaultRunConfig } from './migrate';
import type { OutputAssertion } from './assertions';

export const SHARE_KIND = 'workflow-share';
export const SHARE_VERSION = 1;

export interface ShareWorkflowBody {
  name: string;
  description?: string;
  tags?: string[];
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs: WorkflowInputDef[];
  outputs: WorkflowOutputDef[];
  runConfig: WorkflowRunConfig;
  assertions: OutputAssertion[];
}

export interface ShareSnapshot {
  kind: typeof SHARE_KIND;
  version: typeof SHARE_VERSION;
  createdAt: number;
  workflow: ShareWorkflowBody;
}

interface ShareSource {
  name: string;
  description?: string;
  tags?: string[];
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs?: WorkflowInputDef[];
  outputs?: WorkflowOutputDef[];
  runConfig?: WorkflowRunConfig;
  assertions?: OutputAssertion[];
}

/** 生成只读快照（剥离运行时状态 + 敏感字段；不含版本/历史/档案/模块） */
export function buildShareSnapshot(src: ShareSource): ShareSnapshot {
  const cleanNodes = sanitizeNodes(src.nodes).map((n) => ({
    ...n,
    selected: false,
    data: { ...n.data, status: 'idle' as const },
  }));
  const ids = new Set(cleanNodes.map((n) => n.id));
  const cleanEdges = src.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, selected: false }));
  return {
    kind: SHARE_KIND,
    version: SHARE_VERSION,
    createdAt: Date.now(),
    workflow: {
      name: src.name,
      description: src.description,
      tags: src.tags,
      nodes: cleanNodes,
      edges: cleanEdges,
      inputs: src.inputs ?? [],
      outputs: src.outputs ?? [],
      runConfig: src.runConfig ?? defaultRunConfig(),
      assertions: src.assertions ?? [],
    },
  };
}

export function shareSnapshotJson(src: ShareSource): string {
  return JSON.stringify(buildShareSnapshot(src), null, 2);
}

/** 快速结构检查：JSON 可解析 + 信封形状合法（不做逐节点深校验） */
export function quickCheckShareJson(text: string): { ok: boolean; error?: string } {
  if (text.length > 8_000_000) return { ok: false, error: '快照过大（>8MB），请精简后导入' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: '文件不是有效的 JSON' };
  }
  if (!parsed || typeof parsed !== 'object') return { ok: false, error: '快照必须是对象' };
  const s = parsed as Record<string, unknown>;
  if (s.kind !== SHARE_KIND) return { ok: false, error: '不是工作流分享快照（缺少 kind 标记）' };
  if (s.version !== SHARE_VERSION)
    return { ok: false, error: `不支持的快照版本：${String(s.version)}` };
  const w = s.workflow as Record<string, unknown> | undefined;
  if (!w || typeof w !== 'object') return { ok: false, error: '快照缺少 workflow 内容' };
  if (!Array.isArray(w.nodes) || !Array.isArray(w.edges)) {
    return { ok: false, error: '快照缺少 nodes 或 edges 数组' };
  }
  return { ok: true };
}

export interface ParseShareResult {
  ok: boolean;
  snapshot?: ShareSnapshot;
  errors: string[];
  warnings: string[];
}

/** 完整解析与校验分享快照（导入确认阶段使用） */
export function parseShareSnapshot(text: string): ParseShareResult {
  const quick = quickCheckShareJson(text);
  if (!quick.ok) return { ok: false, errors: [quick.error ?? '快照无效'], warnings: [] };

  const parsed: unknown = JSON.parse(text);
  const s = parsed as ShareSnapshot;
  const errors: string[] = [];
  const warnings: string[] = [];
  const w = s.workflow;

  const nodes: WorkflowNodeModel[] = [];
  const rawNodes = w.nodes as unknown[];
  for (let i = 0; i < rawNodes.length; i++) {
    const n = rawNodes[i] as Record<string, unknown> | null | undefined;
    if (!n || typeof n !== 'object') {
      errors.push(`节点 #${i + 1}：不是有效对象`);
      continue;
    }
    if (typeof n.id !== 'string' || !n.id) {
      errors.push(`节点 #${i + 1}：缺少 id`);
      continue;
    }
    const data = n.data as Record<string, unknown> | undefined;
    if (!data || typeof data !== 'object' || typeof data.kind !== 'string') {
      errors.push(`节点 ${n.id}：缺少配置或类型`);
      continue;
    }
    if (!NODE_KINDS.has(data.kind)) {
      errors.push(`节点 ${n.id}：未知节点类型「${String(data.kind)}」`);
      continue;
    }
    const pos = n.position as { x?: unknown; y?: unknown } | undefined;
    if (!pos || typeof pos.x !== 'number' || typeof pos.y !== 'number') {
      errors.push(`节点 ${n.id}：position 缺失或无效`);
      continue;
    }
    nodes.push(n as unknown as WorkflowNodeModel);
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: WorkflowEdgeModel[] = [];
  const rawEdges = w.edges as unknown[];
  for (let i = 0; i < rawEdges.length; i++) {
    const e = rawEdges[i] as Record<string, unknown> | null | undefined;
    if (!e || typeof e !== 'object') {
      errors.push(`连线 #${i + 1}：不是有效对象`);
      continue;
    }
    if (typeof e.source !== 'string' || typeof e.target !== 'string') {
      errors.push(`连线 #${i + 1}：缺少 source/target`);
      continue;
    }
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      warnings.push(`连线 ${e.source} → ${e.target}：引用不存在的节点，已忽略`);
      continue;
    }
    edges.push(e as unknown as WorkflowEdgeModel);
  }

  if (errors.length > 0) {
    return { ok: false, errors, warnings };
  }
  return {
    ok: true,
    snapshot: {
      kind: SHARE_KIND,
      version: SHARE_VERSION,
      createdAt: typeof s.createdAt === 'number' ? s.createdAt : Date.now(),
      workflow: {
        name: typeof w.name === 'string' && w.name ? w.name : '导入的快照工作流',
        description: typeof w.description === 'string' ? w.description : undefined,
        tags: Array.isArray(w.tags)
          ? (w.tags as unknown[]).filter((t): t is string => typeof t === 'string')
          : undefined,
        nodes,
        edges,
        inputs: Array.isArray(w.inputs) ? (w.inputs as WorkflowInputDef[]) : [],
        outputs: Array.isArray(w.outputs) ? (w.outputs as WorkflowOutputDef[]) : [],
        runConfig: (w.runConfig as WorkflowRunConfig | undefined) ?? defaultRunConfig(),
        assertions: Array.isArray(w.assertions) ? (w.assertions as OutputAssertion[]) : [],
      },
    },
    errors: [],
    warnings,
  };
}

/** 快照导入为新工作流：节点 id 重映射为 n-1..n-N，边同步重映射 */
export function remapShareNodes(snapshot: ShareSnapshot): {
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
} {
  const map = new Map<string, string>();
  const nodes = snapshot.workflow.nodes.map((n, i) => {
    const id = `n-${i + 1}`;
    map.set(n.id, id);
    return { ...n, id };
  });
  const edges = snapshot.workflow.edges.map((e) => ({
    ...e,
    id: `e-${map.get(e.source) ?? e.source}-${map.get(e.target) ?? e.target}`,
    source: map.get(e.source) ?? e.source,
    target: map.get(e.target) ?? e.target,
  }));
  return { nodes, edges };
}

/** 快照占用字节估算（供展示） */
export function estimateSnapshotBytes(text: string): number {
  try {
    return new Blob([text]).size;
  } catch {
    return text.length;
  }
}
