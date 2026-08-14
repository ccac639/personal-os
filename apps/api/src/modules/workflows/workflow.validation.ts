/**
 * 工作流结构校验（导入 / 更新共用）
 *
 * 严格校验项（error，导入时任一命中即拒绝）：
 *  - 节点类型不在白名单、节点 id 非法 / 重复
 *  - 边引用不存在的节点（孤立边）、自环、边 id 重复
 *  - 图存在环（annotation 节点不参与拓扑）
 *  - 输入定义：名称非法 / 重复、select 缺选项、默认值类型不符
 *  - 输出定义：名称重复、来源节点不存在
 *  - 子流程映射：inputMap/outputMap 键值非法、引用自身
 *  - runConfig：步数 / 超时 / 失败策略越界
 *
 * 警告项（warn，允许通过）：孤立节点提示、子流程引用不存在的工作流。
 */
import type {
  WorkflowDiagnostic,
  WorkflowEdgeModel,
  WorkflowInputDef,
  WorkflowNodeData,
  WorkflowNodeModel,
  WorkflowOutputDef,
  WorkflowRunConfig,
} from './workflow.types.js';
import { DEFAULT_RUN_CONFIG, NODE_KINDS, RUN_LIMITS, isAnnotationKind } from './workflow.types.js';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

export interface TopoResult {
  order: string[];
  cycleIds: string[];
}

/* ---------- 拓扑排序（Kahn，对齐 web topo.ts 语义） ---------- */

export function topoSort(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]): TopoResult {
  const incoming = new Map<string, number>();
  const out = new Map<string, string[]>();
  const execNodes = nodes.filter((n) => !isAnnotationNode(n));
  for (const n of execNodes) {
    incoming.set(n.id, 0);
    out.set(n.id, []);
  }
  for (const e of edges) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) continue;
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    out.get(e.source)?.push(e.target);
  }
  const queue = execNodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
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
  const cycleIds = execNodes.filter((n) => !visited.has(n.id)).map((n) => n.id);
  return { order, cycleIds };
}

export function isAnnotationNode(n: WorkflowNodeModel): boolean {
  return isAnnotationKind(n.data?.kind);
}

/** 图统计（诊断摘要用） */
export function graphStats(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]) {
  const execCount = nodes.filter((n) => !isAnnotationNode(n)).length;
  return {
    nodeCount: execCount,
    rawNodeCount: nodes.length,
    annotationCount: nodes.length - execCount,
    edgeCount: edges.length,
    triggerCount: nodes.filter((n) => n.data?.kind === 'trigger').length,
  };
}

/* ---------- 输入 / 输出定义校验（对齐 web io.ts） ---------- */

export function validateInputValue(def: WorkflowInputDef, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return def.required ? '该输入为必填项' : null;
  }
  switch (def.type) {
    case 'text':
      return typeof value === 'string' ? null : '需要文本类型';
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return null;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return null;
      }
      return '需要数字类型';
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : '需要布尔类型（true / false）';
    case 'json':
      return null;
    case 'select': {
      const options = def.options ?? [];
      const str = String(value ?? '');
      return options.includes(str)
        ? null
        : `需要选择项之一：${options.join(' / ') || '（未配置选项）'}`;
    }
    default:
      return null;
  }
}

/** 输入定义校验 */
export function validateInputDefs(defs: WorkflowInputDef[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  defs.forEach((def, i) => {
    const path = `inputs[${i}]`;
    if (!def || typeof def !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    if (!def.name || !def.name.trim()) {
      errors.push(`${path} 输入名称不能为空`);
      return;
    }
    if (seen.has(def.name)) {
      errors.push(`输入名称「${def.name}」重复`);
    }
    seen.add(def.name);
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(def.name)) {
      errors.push(`输入名称「${def.name}」包含非法字符（仅字母/数字/下划线/点）`);
    }
    if (!['text', 'number', 'boolean', 'json', 'select'].includes(def.type)) {
      errors.push(`输入「${def.name}」类型非法：${String(def.type)}`);
    }
    if (def.defaultValue !== undefined && def.defaultValue !== null) {
      const err = validateInputValue(def, def.defaultValue);
      if (err) errors.push(`输入「${def.name}」默认值：${err}`);
    }
    if (def.type === 'select' && (!def.options || def.options.length === 0)) {
      errors.push(`输入「${def.name}」选择型必须配置选项`);
    }
  });
  return { ok: errors.length === 0, errors, warnings };
}

/** 输出定义校验（source 必须引用存在的节点） */
export function validateOutputDefs(
  defs: WorkflowOutputDef[],
  nodeIds: Set<string>,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  defs.forEach((def, i) => {
    const path = `outputs[${i}]`;
    if (!def || typeof def !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    if (!def.name || !def.name.trim()) {
      errors.push(`${path} 输出名称不能为空`);
      return;
    }
    if (seen.has(def.name)) {
      errors.push(`输出名称「${def.name}」重复`);
    }
    seen.add(def.name);
    if (!def.source) {
      errors.push(`输出「${def.name}」来源不能为空`);
      return;
    }
    const nodeId = def.source.split('.')[0] ?? '';
    if (!nodeIds.has(nodeId)) {
      errors.push(`输出「${def.name}」引用的节点「${nodeId}」不存在`);
    }
  });
  return { ok: errors.length === 0, errors, warnings };
}

/* ---------- 子流程映射校验 ---------- */

export interface SubflowMapIssue {
  nodeId: string;
  message: string;
}

/** 校验 subworkflow 节点的 inputMap/outputMap（键值必须是非空字符串） */
export function validateSubflowMaps(nodes: WorkflowNodeModel[]): SubflowMapIssue[] {
  const issues: SubflowMapIssue[] = [];
  for (const node of nodes) {
    const data = node.data;
    if (!data || data.kind !== 'subworkflow') continue;
    const maps: Array<[string, Record<string, string> | undefined]> = [
      ['inputMap', data.inputMap],
      ['outputMap', data.outputMap],
    ];
    for (const [mapName, map] of maps) {
      if (!map || typeof map !== 'object') continue;
      for (const [key, value] of Object.entries(map)) {
        if (!key || typeof key !== 'string') {
          issues.push({ nodeId: node.id, message: `${mapName} 含非法键` });
        }
        if (typeof value !== 'string' || !value.trim()) {
          issues.push({
            nodeId: node.id,
            message: `${mapName} 的「${key}」映射目标必须是非空字符串`,
          });
        }
      }
    }
    if (data.workflowRef === node.id) {
      issues.push({ nodeId: node.id, message: '子流程不能引用自身' });
    }
  }
  return issues;
}

/* ---------- runConfig 校验 ---------- */

export function validateRunConfig(cfg: Partial<WorkflowRunConfig> | undefined): {
  config: WorkflowRunConfig;
  errors: string[];
} {
  const errors: string[] = [];
  const config: WorkflowRunConfig = { ...DEFAULT_RUN_CONFIG, ...(cfg ?? {}) };
  if (
    !Number.isInteger(config.maxSteps) ||
    config.maxSteps < 1 ||
    config.maxSteps > RUN_LIMITS.MAX_STEPS
  ) {
    errors.push(`runConfig.maxSteps 必须在 1..${RUN_LIMITS.MAX_STEPS} 之间`);
  }
  if (
    !Number.isInteger(config.timeoutMs) ||
    config.timeoutMs < RUN_LIMITS.MIN_TIMEOUT_MS ||
    config.timeoutMs > RUN_LIMITS.MAX_TIMEOUT_MS
  ) {
    errors.push(
      `runConfig.timeoutMs 必须在 ${RUN_LIMITS.MIN_TIMEOUT_MS}..${RUN_LIMITS.MAX_TIMEOUT_MS} 之间`,
    );
  }
  if (config.failStrategy !== 'stop' && config.failStrategy !== 'continue') {
    errors.push('runConfig.failStrategy 必须是 stop 或 continue');
  }
  if (typeof config.allowManualRun !== 'boolean') {
    errors.push('runConfig.allowManualRun 必须是布尔值');
  }
  return { config, errors };
}

/* ---------- 主校验入口 ---------- */

export interface WorkflowPayload {
  name?: string;
  description?: string;
  tags?: string[];
  nodes?: unknown;
  edges?: unknown;
  inputs?: unknown;
  outputs?: unknown;
  runConfig?: unknown;
  [key: string]: unknown;
}

/**
 * 严格校验导入 / 更新的工作流结构。
 * 返回校验结果与诊断摘要；errors 非空时调用方应拒绝。
 */
export function validateWorkflowPayload(payload: WorkflowPayload): {
  result: ValidationResult;
  diagnostic: WorkflowDiagnostic;
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 顶层字段
  if (typeof payload.name !== 'string' || payload.name.trim() === '') {
    errors.push('工作流名称不能为空');
  } else if (payload.name.length > RUN_LIMITS.MAX_NAME_LENGTH) {
    errors.push(`工作流名称最长 ${RUN_LIMITS.MAX_NAME_LENGTH} 字符`);
  }
  if (payload.description !== undefined && typeof payload.description !== 'string') {
    errors.push('description 必须是字符串');
  }
  if (payload.tags !== undefined) {
    if (!Array.isArray(payload.tags) || payload.tags.some((t) => typeof t !== 'string')) {
      errors.push('tags 必须是字符串数组');
    } else if (payload.tags.length > RUN_LIMITS.MAX_TAGS) {
      errors.push(`tags 最多 ${RUN_LIMITS.MAX_TAGS} 个`);
    }
  }

  // 节点
  const nodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  if (!Array.isArray(payload.nodes)) errors.push('nodes 必须是数组');
  const nodeModels: WorkflowNodeModel[] = [];
  const nodeIds = new Set<string>();
  const nodeIdSet = new Set<string>();
  nodes.forEach((raw, i) => {
    const path = `nodes[${i}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    const node = raw as WorkflowNodeModel;
    if (typeof node.id !== 'string' || !node.id.trim()) {
      errors.push(`${path} 缺少节点 id`);
      return;
    }
    if (nodeIdSet.has(node.id)) {
      errors.push(`节点 id「${node.id}」重复`);
      return;
    }
    nodeIdSet.add(node.id);
    const data = node.data as WorkflowNodeData | undefined;
    if (!data || typeof data !== 'object' || typeof data.kind !== 'string') {
      errors.push(`节点「${node.id}」缺少 data.kind`);
      return;
    }
    if (!NODE_KINDS.has(data.kind)) {
      errors.push(`节点「${node.id}」类型非法：${data.kind}`);
      return;
    }
    if (typeof data.label !== 'string' || !data.label.trim()) {
      errors.push(`节点「${node.id}」缺少 label`);
      return;
    }
    // 子流程引用格式
    if (data.kind === 'subworkflow') {
      if (data.workflowRef !== undefined && typeof data.workflowRef !== 'string') {
        errors.push(`节点「${node.id}」workflowRef 必须是字符串`);
      }
    }
    nodeModels.push(node);
    nodeIds.add(node.id);
  });

  // 节点数上限
  if (nodeModels.length > RUN_LIMITS.MAX_NODES) {
    errors.push(`节点数超过上限 ${RUN_LIMITS.MAX_NODES}`);
  }

  // 边
  const edges = Array.isArray(payload.edges) ? payload.edges : [];
  if (!Array.isArray(payload.edges)) errors.push('edges 必须是数组');
  const edgeModels: WorkflowEdgeModel[] = [];
  const edgeIds = new Set<string>();
  edges.forEach((raw, i) => {
    const path = `edges[${i}]`;
    if (!raw || typeof raw !== 'object') {
      errors.push(`${path} 必须是对象`);
      return;
    }
    const edge = raw as WorkflowEdgeModel;
    if (typeof edge.id !== 'string' || !edge.id.trim()) {
      errors.push(`${path} 缺少边 id`);
      return;
    }
    if (edgeIds.has(edge.id)) {
      errors.push(`边 id「${edge.id}」重复`);
      return;
    }
    edgeIds.add(edge.id);
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') {
      errors.push(`边「${edge.id}」source/target 必须是字符串`);
      return;
    }
    if (edge.source === edge.target) {
      errors.push(`边「${edge.id}」不能自环（source === target）`);
      return;
    }
    if (!nodeIdSet.has(edge.source)) {
      errors.push(`边「${edge.id}」引用了不存在的源节点「${edge.source}」（孤立边）`);
    }
    if (!nodeIdSet.has(edge.target)) {
      errors.push(`边「${edge.id}」引用了不存在的目标节点「${edge.target}」（孤立边）`);
    }
    edgeModels.push(edge);
  });

  // 环检测（排除 annotation）
  const { cycleIds } = topoSort(nodeModels, edgeModels);
  if (cycleIds.length > 0) {
    errors.push(`检测到循环依赖：${cycleIds.join(' → ')}`);
  }

  // 孤立节点提示（仅警告）
  if (nodeModels.length > 1) {
    const targets = new Set(edgeModels.map((e) => e.target));
    const sources = new Set(edgeModels.map((e) => e.source));
    for (const n of nodeModels) {
      if (isAnnotationNode(n)) continue;
      if (!targets.has(n.id) && !sources.has(n.id)) {
        warnings.push(`节点「${n.data.label}」未与任何节点连接`);
      }
    }
  }

  // 输入 / 输出定义
  const rawInputs = Array.isArray(payload.inputs) ? payload.inputs : [];
  if (payload.inputs !== undefined && !Array.isArray(payload.inputs)) {
    errors.push('inputs 必须是数组');
  }
  const inputDefs = rawInputs as WorkflowInputDef[];
  const inputRes = validateInputDefs(inputDefs);
  errors.push(...inputRes.errors);

  const rawOutputs = Array.isArray(payload.outputs) ? payload.outputs : [];
  if (payload.outputs !== undefined && !Array.isArray(payload.outputs)) {
    errors.push('outputs 必须是数组');
  }
  const outputRes = validateOutputDefs(rawOutputs as WorkflowOutputDef[], nodeIdSet);
  errors.push(...outputRes.errors);

  // 子流程映射
  for (const issue of validateSubflowMaps(nodeModels)) {
    errors.push(`节点「${issue.nodeId}」：${issue.message}`);
  }

  // runConfig
  const { errors: cfgErrors } = validateRunConfig(
    (payload.runConfig ?? undefined) as Partial<WorkflowRunConfig> | undefined,
  );
  errors.push(...cfgErrors);

  const stats = graphStats(nodeModels, edgeModels);
  const diagnostic: WorkflowDiagnostic = {
    ok: errors.length === 0,
    ...stats,
    inputCount: inputDefs.length,
    outputCount: rawOutputs.length,
    hasCycle: cycleIds.length > 0,
    errors,
    warnings,
    updatedAt: Date.now(),
  };

  return { result: { ok: errors.length === 0, errors, warnings }, diagnostic };
}
