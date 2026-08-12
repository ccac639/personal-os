/**
 * 节点模板（纯函数 + localStorage 持久化）
 *
 * 模板 = 选中节点的子图（节点 + 内部边），独立存储于
 * `personal-os-workflow-templates`。保存时剥离运行时状态与敏感字段；
 * 插入时生成全新 ID 并重映射内部边（与复制粘贴同策略）。
 * 导入走严格校验：未知节点类型 / 孤立边 / 错误 schema 一律拒绝。
 */
import {
  NODE_KINDS,
  type WorkflowEdgeModel,
  type WorkflowNodeData,
  type WorkflowNodeModel,
} from './types';
import { sanitizeNodes } from './migrate';
import { validateDataShape } from './schema';

export const TEMPLATES_STORAGE_KEY = 'personal-os-workflow-templates';

/** 节点模板（子图快照，不含运行时状态） */
export interface NodeTemplate {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
}

export function nextTemplateId(): string {
  return `tpl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * 保存选中子图为模板：节点剥离 status/selected 与敏感字段，
 * 边只保留两端都在子图内的内部边。
 */
export function buildTemplate(
  name: string,
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  description = '',
): NodeTemplate {
  const clean = sanitizeNodes(nodes).map((n) => ({
    ...n,
    selected: false,
    data: { ...n.data, status: 'idle' as const },
  }));
  const ids = new Set(clean.map((n) => n.id));
  const innerEdges = edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ ...e, selected: false }));
  return {
    id: nextTemplateId(),
    name: name.trim() || '未命名模板',
    description,
    createdAt: Date.now(),
    nodes: clean,
    edges: innerEdges,
  };
}

/* ---------- 持久化 ---------- */

function sanitizeTemplate(raw: unknown): NodeTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (typeof t.id !== 'string' || !Array.isArray(t.nodes) || !Array.isArray(t.edges)) return null;
  const nodes = (t.nodes as unknown[]).filter((n): n is WorkflowNodeModel => {
    if (!n || typeof n !== 'object') return false;
    const node = n as Record<string, unknown>;
    if (typeof node.id !== 'string') return false;
    const data = node.data as Record<string, unknown> | undefined;
    if (!data || typeof data.kind !== 'string' || !NODE_KINDS.has(data.kind)) return false;
    return validateDataShape(data as unknown as WorkflowNodeData).length === 0;
  });
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (t.edges as unknown[]).filter((e): e is WorkflowEdgeModel => {
    if (!e || typeof e !== 'object') return false;
    const edge = e as Record<string, unknown>;
    return (
      typeof edge.source === 'string' &&
      typeof edge.target === 'string' &&
      ids.has(edge.source) &&
      ids.has(edge.target)
    );
  });
  return {
    id: t.id as string,
    name: typeof t.name === 'string' && t.name ? t.name : '未命名模板',
    description: typeof t.description === 'string' ? t.description : '',
    createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now(),
    nodes,
    edges,
  };
}

export function loadTemplates(): NodeTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(sanitizeTemplate).filter((t): t is NodeTemplate => t !== null);
  } catch {
    return [];
  }
}

export function saveTemplates(templates: NodeTemplate[]): boolean {
  try {
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    return true;
  } catch {
    return false;
  }
}

/* ---------- 模板导入（严格校验） ---------- */

export interface TemplateImportResult {
  ok: boolean;
  templates: NodeTemplate[];
  errors: string[];
}

/**
 * 解析模板 JSON：支持裸模板对象与 v1 信封（{ version: 1, templates: [...] }）。
 * 未知节点类型 / 孤立边 / 错误 schema / 非法 position → 明确错误，整体拒绝。
 */
export function parseTemplateJson(text: string): TemplateImportResult {
  const fail = (errors: string[]): TemplateImportResult => ({ ok: false, templates: [], errors });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail(['文件不是有效的 JSON']);
  }

  const errors: string[] = [];
  const templates: NodeTemplate[] = [];

  let bodies: unknown[];
  if (
    parsed &&
    typeof parsed === 'object' &&
    Array.isArray((parsed as { templates?: unknown[] }).templates)
  ) {
    const env = parsed as { version?: unknown; templates: unknown[] };
    if (env.version !== undefined && env.version !== 1) {
      return fail([`模板数据版本过新（v${String(env.version)}），仅支持 v1`]);
    }
    if (env.templates.length === 0) return fail(['信封中不包含任何模板']);
    bodies = env.templates;
  } else {
    bodies = [parsed];
  }

  for (let i = 0; i < bodies.length; i++) {
    const t = bodies[i] as Record<string, unknown> | null | undefined;
    if (!t || typeof t !== 'object') {
      errors.push(`模板 #${i + 1}：不是有效对象`);
      continue;
    }
    if (!Array.isArray(t.nodes) || !Array.isArray(t.edges)) {
      errors.push(`模板 #${i + 1}：缺少 nodes 或 edges 数组`);
      continue;
    }
    const nodes: WorkflowNodeModel[] = [];
    const rawNodes = t.nodes as unknown[];
    for (let j = 0; j < rawNodes.length; j++) {
      const n = rawNodes[j] as Record<string, unknown> | null | undefined;
      const tag = `模板 #${i + 1} 节点 #${j + 1}`;
      if (!n || typeof n !== 'object') {
        errors.push(`${tag}：不是有效对象`);
        continue;
      }
      if (typeof n.id !== 'string' || !n.id) {
        errors.push(`${tag}：缺少 id`);
        continue;
      }
      const data = n.data as Record<string, unknown> | undefined;
      if (!data || typeof data !== 'object') {
        errors.push(`模板 #${i + 1} 节点 ${String(n.id)}：缺少配置 data`);
        continue;
      }
      if (typeof data.kind !== 'string' || !NODE_KINDS.has(data.kind)) {
        errors.push(`模板 #${i + 1} 节点 ${String(n.id)}：未知节点类型「${String(data.kind)}」`);
        continue;
      }
      const shapeErrors = validateDataShape(data as unknown as WorkflowNodeData);
      if (shapeErrors.length > 0) {
        errors.push(`模板 #${i + 1} 节点 ${String(n.id)}：${shapeErrors.join('；')}`);
        continue;
      }
      const pos = n.position as { x?: unknown; y?: unknown } | undefined;
      if (
        !pos ||
        typeof pos.x !== 'number' ||
        typeof pos.y !== 'number' ||
        !Number.isFinite(pos.x) ||
        !Number.isFinite(pos.y)
      ) {
        errors.push(`模板 #${i + 1} 节点 ${String(n.id)}：position 缺失或无效`);
        continue;
      }
      nodes.push(n as unknown as WorkflowNodeModel);
    }

    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges: WorkflowEdgeModel[] = [];
    const rawEdges = t.edges as unknown[];
    for (let j = 0; j < rawEdges.length; j++) {
      const e = rawEdges[j] as Record<string, unknown> | null | undefined;
      if (!e || typeof e !== 'object') {
        errors.push(`模板 #${i + 1} 连线 #${j + 1}：不是有效对象`);
        continue;
      }
      if (typeof e.source !== 'string' || typeof e.target !== 'string') {
        errors.push(`模板 #${i + 1} 连线 #${j + 1}：缺少 source/target`);
        continue;
      }
      if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
        errors.push(`模板 #${i + 1} 连线 ${e.source} → ${e.target}：引用不存在的节点`);
        continue;
      }
      edges.push(e as unknown as WorkflowEdgeModel);
    }

    if (errors.length > 0) continue;
    templates.push(
      buildTemplate(
        typeof t.name === 'string' ? t.name : '',
        nodes,
        edges,
        typeof t.description === 'string' ? t.description : '',
      ),
    );
  }

  if (errors.length > 0) return fail(errors);
  if (templates.length === 0) return fail(['没有可导入的模板']);
  return { ok: true, templates, errors };
}
