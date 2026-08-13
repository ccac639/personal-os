/**
 * 数据可靠性：持久化 v3 信封、幂等迁移、导入解析、导出脱敏（纯函数）
 *
 * 存储层级：
 * - v3（当前）：`personal-os-workflows-v3` = { version: 3, workflows: [...] }
 * - v2（历史）：`personal-os-workflows-v1` = StoredWorkflow[]
 * - v1（旧版单工作流）：`personal-os-workflow-v1` = { name, seq, nodes, edges }
 *
 * 迁移幂等：优先读 v3；缺失时逐级降级读取旧格式并原样保留旧 key；
 * 损坏数据 / 未知版本安全跳过（不覆盖、不崩溃）。
 */
import {
  getNodeDef,
  NODE_KINDS,
  type WorkflowEdgeModel,
  type WorkflowInputDef,
  type WorkflowModule,
  type WorkflowNodeData,
  type WorkflowNodeModel,
  type WorkflowOutputDef,
  type WorkflowRunConfig,
  type WorkflowVersion,
} from './types';
import { validateDataShape } from './schema';

export const STORAGE_KEY_V3 = 'personal-os-workflows-v3';
export const STORAGE_KEY_V2 = 'personal-os-workflows-v1';
export const LEGACY_STORAGE_KEY = 'personal-os-workflow-v1';

/** 当前存储版本（v4） */
export const STORAGE_VERSION = 4 as const;

/** 版本快照上限（防无限增长） */
export const MAX_VERSIONS = 20;

export type WorkflowRunStatus = 'success' | 'failed';

export interface WorkflowLastRun {
  status: WorkflowRunStatus;
  at: number;
  durationMs: number;
  logs: string[];
}

/** 持久化结构：一个工作流的完整数据（v4） */
export interface StoredWorkflow {
  id: string;
  name: string;
  updatedAt: number;
  seq: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  lastRun?: WorkflowLastRun | null;
  /** 标签 */
  tags?: string[];
  /** 描述 */
  description?: string;
  /** 收藏 */
  favorite?: boolean;
  /** 模板标记 */
  isTemplate?: boolean;
  /** 版本快照（上限 MAX_VERSIONS） */
  versions?: WorkflowVersion[];
  /* ---------- v4 输入输出契约与运行配置 ---------- */
  inputs?: WorkflowInputDef[];
  outputs?: WorkflowOutputDef[];
  runConfig?: WorkflowRunConfig;
  /** 模块化子图（当前工作流内的可复用模块） */
  modules?: WorkflowModule[];
}

/** 列表视图使用的轻量元数据 */
export interface WorkflowMeta {
  id: string;
  name: string;
  updatedAt: number;
  nodeCount: number;
  edgeCount: number;
  lastRun?: WorkflowLastRun | null;
  tags: string[];
  description: string;
  favorite: boolean;
  isTemplate: boolean;
  versionCount: number;
}

export interface StorageEnvelopeV3 {
  version: 3 | 4;
  workflows: StoredWorkflow[];
}

/** v4 默认运行配置（旧数据自动补齐） */
export function defaultRunConfig(): WorkflowRunConfig {
  return { maxSteps: 100, timeoutMs: 60000, failStrategy: 'stop', allowManualRun: true };
}

/** 幂等补齐 v4 契约字段（旧工作流自动获得默认 inputs/outputs/runConfig/modules） */
export function ensureV4Defaults(rec: StoredWorkflow): StoredWorkflow {
  const next: StoredWorkflow = {
    ...rec,
    inputs: Array.isArray(rec.inputs) ? rec.inputs : [],
    outputs: Array.isArray(rec.outputs) ? rec.outputs : [],
    runConfig:
      rec.runConfig && typeof rec.runConfig === 'object' ? rec.runConfig : defaultRunConfig(),
    modules: Array.isArray(rec.modules) ? rec.modules : [],
  };
  // 修正 runConfig 字段类型（损坏时回退默认）
  const rc = next.runConfig ?? defaultRunConfig();
  if (typeof rc.maxSteps !== 'number' || rc.maxSteps <= 0) rc.maxSteps = 100;
  if (typeof rc.timeoutMs !== 'number' || rc.timeoutMs < 0) rc.timeoutMs = 60000;
  if (rc.failStrategy !== 'stop' && rc.failStrategy !== 'continue') rc.failStrategy = 'stop';
  if (typeof rc.allowManualRun !== 'boolean') rc.allowManualRun = true;
  next.runConfig = rc;
  return next;
}

export interface LoadResult {
  records: StoredWorkflow[];
  /** 迁移 / 数据修复过程中的警告（供 UI 非阻塞提示） */
  warnings: string[];
  source: 'v3' | 'v2' | 'legacy' | 'empty';
}

function nextWorkflowId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ---------- 单条工作流修复（幂等，安全处理无效节点与孤立边） ---------- */

function sanitizeWorkflowRecord(raw: unknown): {
  record: StoredWorkflow | null;
  warnings: string[];
} {
  if (!raw || typeof raw !== 'object') return { record: null, warnings: ['丢弃无效工作流条目'] };
  const w = raw as Record<string, unknown>;
  if (typeof w.id !== 'string' || !Array.isArray(w.nodes) || !Array.isArray(w.edges)) {
    return { record: null, warnings: ['丢弃结构无效的工作流条目'] };
  }
  const warnings: string[] = [];
  const nodes = (w.nodes as unknown[]).filter((n): n is WorkflowNodeModel => {
    if (!n || typeof n !== 'object') return false;
    const node = n as Record<string, unknown>;
    if (typeof node.id !== 'string') return false;
    const data = node.data as Record<string, unknown> | undefined;
    if (!data || typeof data.kind !== 'string') {
      warnings.push(`节点 ${node.id}：缺少配置，已丢弃`);
      return false;
    }
    if (!NODE_KINDS.has(data.kind)) {
      warnings.push(`节点 ${node.id}：未知类型「${String(data.kind)}」，已丢弃`);
      return false;
    }
    // 数据形状问题（错误 schema）：保留节点但给出警告，便于定位修复
    const shapeErrors = validateDataShape(data as unknown as WorkflowNodeData);
    if (shapeErrors.length > 0) {
      warnings.push(`节点 ${node.id}：${shapeErrors.join('；')}（已保留，运行前请检查）`);
    }
    return true;
  });
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = (w.edges as unknown[]).filter((e): e is WorkflowEdgeModel => {
    if (!e || typeof e !== 'object') return false;
    const edge = e as Record<string, unknown>;
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string') return false;
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      warnings.push(`连线 ${edge.id ?? edge.source + '→' + edge.target} 引用不存在的节点，已丢弃`);
      return false;
    }
    return true;
  });
  const versions = Array.isArray(w.versions)
    ? (w.versions as unknown[])
        .filter((v): v is WorkflowVersion => {
          return (
            !!v &&
            typeof v === 'object' &&
            typeof (v as WorkflowVersion).id === 'string' &&
            Array.isArray((v as WorkflowVersion).nodes) &&
            Array.isArray((v as WorkflowVersion).edges)
          );
        })
        .slice(0, MAX_VERSIONS)
    : [];
  const record: StoredWorkflow = ensureV4Defaults({
    id: w.id as string,
    name: typeof w.name === 'string' && w.name ? w.name : '未命名工作流',
    updatedAt: typeof w.updatedAt === 'number' ? w.updatedAt : Date.now(),
    seq: typeof w.seq === 'number' && w.seq > 0 ? w.seq : 1,
    nodes,
    edges,
    lastRun: w.lastRun as StoredWorkflow['lastRun'],
    tags: Array.isArray(w.tags)
      ? (w.tags as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    description: typeof w.description === 'string' ? w.description : '',
    favorite: w.favorite === true,
    isTemplate: w.isTemplate === true,
    versions,
  });
  return { record, warnings };
}

/* ---------- 加载与迁移 ---------- */

export function loadAllWorkflows(): LoadResult {
  const warnings: string[] = [];

  // 1. v3/v4 信封（v4 优先，v3 兼容降级）
  const v3Raw = localStorage.getItem(STORAGE_KEY_V3);
  if (v3Raw) {
    try {
      const parsed = JSON.parse(v3Raw) as unknown;
      if (
        parsed &&
        typeof parsed === 'object' &&
        ((parsed as StorageEnvelopeV3).version === 3 ||
          (parsed as StorageEnvelopeV3).version === 4) &&
        Array.isArray((parsed as StorageEnvelopeV3).workflows)
      ) {
        const records: StoredWorkflow[] = [];
        for (const item of (parsed as StorageEnvelopeV3).workflows) {
          const { record, warnings: w } = sanitizeWorkflowRecord(item);
          if (record) records.push(record);
          warnings.push(...w);
        }
        return { records, warnings, source: 'v3' };
      }
      warnings.push('v3 数据损坏或版本未知，已忽略并尝试旧格式');
    } catch {
      warnings.push('v3 数据解析失败，已忽略并尝试旧格式');
    }
  }

  // 2. v2 数组
  const v2Raw = localStorage.getItem(STORAGE_KEY_V2);
  if (v2Raw) {
    try {
      const parsed = JSON.parse(v2Raw) as unknown;
      if (Array.isArray(parsed)) {
        const records: StoredWorkflow[] = [];
        for (const item of parsed) {
          const { record, warnings: w } = sanitizeWorkflowRecord(item);
          if (record) records.push(record);
          warnings.push(...w);
        }
        return { records, warnings, source: 'v2' };
      }
      warnings.push('v2 数据格式无效，已忽略');
    } catch {
      warnings.push('v2 数据解析失败，已忽略');
    }
  }

  // 3. v1 单工作流
  const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as {
        name?: string;
        seq?: number;
        nodes?: WorkflowNodeModel[];
        edges?: WorkflowEdgeModel[];
      };
      if (Array.isArray(legacy.nodes) && Array.isArray(legacy.edges)) {
        const { record, warnings: w } = sanitizeWorkflowRecord({
          id: nextWorkflowId(),
          name: legacy.name || '未命名工作流',
          updatedAt: Date.now(),
          seq: legacy.seq && legacy.seq > 0 ? legacy.seq : 1,
          nodes: legacy.nodes,
          edges: legacy.edges,
        });
        if (record) {
          return {
            records: [record],
            warnings: [...w, '已从旧版单工作流数据迁移'],
            source: 'legacy',
          };
        }
      }
      warnings.push('旧版单工作流数据格式无效，已忽略');
    } catch {
      warnings.push('旧版单工作流数据解析失败，已忽略');
    }
  }

  return { records: [], warnings, source: 'empty' };
}

/** 写 v3/v4 信封（当前写 v4）；失败返回 false（调用方展示非阻塞警告） */
export function saveAllWorkflows(records: StoredWorkflow[]): boolean {
  try {
    const envelope: StorageEnvelopeV3 = {
      version: STORAGE_VERSION,
      workflows: records.map((r) => ensureV4Defaults(r)),
    };
    localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/* ---------- 导入解析（严格校验，未知类型明确报错） ---------- */

export interface ImportPreview {
  name: string;
  nodeCount: number;
  edgeCount: number;
  /** 信封版本（无信封时为 0） */
  version: number;
  /** 输入定义数量 */
  inputCount: number;
  /** 输出定义数量 */
  outputCount: number;
  /** 模块数量 */
  moduleCount: number;
  errors: string[];
  warnings: string[];
}

export interface ParsedWorkflow {
  name: string;
  seq: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  inputs: WorkflowInputDef[];
  outputs: WorkflowOutputDef[];
  runConfig: WorkflowRunConfig;
  modules: WorkflowModule[];
}

const KNOWN_VERSIONS = [1, 2, 3, 4];

/**
 * 解析导入 JSON：未知节点类型 → 明确错误；孤立边 → 警告；
 * 过新版本 / 损坏配置 → 错误。不写入任何存储。
 */
export function parseWorkflowJson(text: string): {
  ok: boolean;
  preview: ImportPreview;
  snapshot?: ParsedWorkflow;
} {
  const empty: ImportPreview = {
    name: '',
    nodeCount: 0,
    edgeCount: 0,
    version: 0,
    inputCount: 0,
    outputCount: 0,
    moduleCount: 0,
    errors: [],
    warnings: [],
  };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, preview: { ...empty, errors: ['文件不是有效的 JSON'] } };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // 支持 v3/v4 信封与裸工作流对象
  const envelope = parsed as { version?: number; workflows?: unknown[] };
  let body: unknown = parsed;
  let version = 0;
  if (envelope && typeof envelope === 'object' && Array.isArray(envelope.workflows)) {
    version = typeof envelope.version === 'number' ? envelope.version : 0;
    if (version > 4) {
      errors.push(`数据版本过新（v${version}），当前仅支持到 v4，请升级应用后再导入`);
      return { ok: false, preview: { ...empty, version, errors } };
    }
    if (!KNOWN_VERSIONS.includes(version)) {
      errors.push(`未知数据版本（v${version}）`);
      return { ok: false, preview: { ...empty, version, errors } };
    }
    if (envelope.workflows.length === 0) {
      errors.push('信封中不包含任何工作流');
      return { ok: false, preview: { ...empty, version, errors } };
    }
    if (envelope.workflows.length > 1) {
      warnings.push(`信封包含 ${envelope.workflows.length} 个工作流，仅导入第一个`);
    }
    body = envelope.workflows[0];
  }

  const obj = body as Record<string, unknown>;
  if (!obj || typeof obj !== 'object') {
    errors.push('工作流数据必须是对象');
    return { ok: false, preview: { ...empty, version, errors } };
  }
  if (!Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) {
    errors.push('缺少 nodes 或 edges 数组');
    return { ok: false, preview: { ...empty, version, errors } };
  }

  // 节点校验
  const nodes: WorkflowNodeModel[] = [];
  const rawNodes = obj.nodes as unknown[];
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
    if (!data || typeof data !== 'object') {
      errors.push(`节点 ${n.id}：缺少配置 data`);
      continue;
    }
    if (typeof data.kind !== 'string' || !NODE_KINDS.has(data.kind)) {
      errors.push(`节点 ${n.id}：未知节点类型「${String(data.kind)}」，请确认导出版本`);
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
      errors.push(`节点 ${n.id}：position 缺失或无效`);
      continue;
    }
    // 数据形状校验（枚举 / 字段类型），拦截错误 schema
    const shapeErrors = validateDataShape(data as unknown as WorkflowNodeData);
    if (shapeErrors.length > 0) {
      errors.push(`节点 ${n.id}：${shapeErrors.join('；')}`);
      continue;
    }
    nodes.push(n as unknown as WorkflowNodeModel);
  }

  // 边校验（导入严格模式：孤立边是错误，不允许静默丢失）
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: WorkflowEdgeModel[] = [];
  const rawEdges = obj.edges as unknown[];
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
      errors.push(`连线 ${e.source} → ${e.target}：引用不存在的节点`);
      continue;
    }
    edges.push(e as unknown as WorkflowEdgeModel);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      preview: {
        name: typeof obj.name === 'string' ? obj.name : '',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        version,
        inputCount: countInputs(obj),
        outputCount: countOutputs(obj),
        moduleCount: countModules(obj),
        errors,
        warnings,
      },
    };
  }

  // 子流程引用校验：引用的工作流 id 必须在同一导入包中或已存在本地
  const subflowNodes = nodes.filter((n) => n.data.kind === 'subworkflow' && n.data.workflowRef);
  const importedIds = new Set<string>();
  if (envelope && Array.isArray(envelope.workflows)) {
    for (const wf of envelope.workflows) {
      const w = wf as Record<string, unknown>;
      if (typeof w.id === 'string') importedIds.add(w.id);
    }
  }
  const importedRootId = typeof obj.id === 'string' ? obj.id : '';
  for (const sn of subflowNodes) {
    const ref = sn.data.workflowRef!;
    if (ref === importedRootId) {
      errors.push(`子流程节点 ${sn.id}：引用了自身（禁止自引用）`);
      continue;
    }
    if (!importedIds.has(ref)) {
      warnings.push(
        `子流程节点 ${sn.id}：被调用工作流（id: ${ref}）不在导入包中，运行前需在本地存在`,
      );
    }
  }

  // 输入输出定义解析与校验
  const inputs = parseInputDefs(obj, errors);
  const outputs = parseOutputDefs(obj, nodeIds, errors);
  const modules = parseModules(obj, nodeIds, edges, errors);

  // 输出名称唯一校验
  const outNames = new Set<string>();
  for (const o of outputs) {
    if (outNames.has(o.name)) {
      errors.push(`输出名称「${o.name}」重复`);
    }
    outNames.add(o.name);
  }

  if (errors.length > 0) {
    return {
      ok: false,
      preview: {
        name: typeof obj.name === 'string' ? obj.name : '',
        nodeCount: nodes.length,
        edgeCount: edges.length,
        version,
        inputCount: inputs.length,
        outputCount: outputs.length,
        moduleCount: modules.length,
        errors,
        warnings,
      },
    };
  }

  const seq = typeof obj.seq === 'number' && obj.seq > 0 ? obj.seq : 1;
  const name = typeof obj.name === 'string' && obj.name ? obj.name : '导入的工作流';
  return {
    ok: true,
    preview: {
      name,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      version,
      inputCount: inputs.length,
      outputCount: outputs.length,
      moduleCount: modules.length,
      errors,
      warnings,
    },
    snapshot: {
      name,
      seq,
      nodes,
      edges,
      inputs,
      outputs,
      runConfig: parseRunConfig(obj),
      modules,
    },
  };
}

function countInputs(obj: Record<string, unknown>): number {
  return Array.isArray(obj.inputs) ? obj.inputs.length : 0;
}
function countOutputs(obj: Record<string, unknown>): number {
  return Array.isArray(obj.outputs) ? obj.outputs.length : 0;
}
function countModules(obj: Record<string, unknown>): number {
  return Array.isArray(obj.modules) ? obj.modules.length : 0;
}

function parseInputDefs(obj: Record<string, unknown>, errors: string[]): WorkflowInputDef[] {
  if (!Array.isArray(obj.inputs)) return [];
  const defs: WorkflowInputDef[] = [];
  for (let i = 0; i < obj.inputs.length; i++) {
    const raw = obj.inputs[i] as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name) {
      errors.push(`输入定义 #${i + 1}：缺少 name`);
      continue;
    }
    const type = raw.type;
    if (
      typeof type !== 'string' ||
      !['text', 'number', 'boolean', 'json', 'select'].includes(type)
    ) {
      errors.push(`输入定义「${raw.name}」：类型无效（可选 text/number/boolean/json/select）`);
      continue;
    }
    defs.push({
      name: raw.name,
      label: typeof raw.label === 'string' ? raw.label : raw.name,
      type: type as WorkflowInputDef['type'],
      required: raw.required === true,
      defaultValue: raw.defaultValue,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      options: Array.isArray(raw.options)
        ? (raw.options as unknown[]).filter((o): o is string => typeof o === 'string')
        : undefined,
    });
  }
  return defs;
}

function parseOutputDefs(
  obj: Record<string, unknown>,
  nodeIds: Set<string>,
  errors: string[],
): WorkflowOutputDef[] {
  if (!Array.isArray(obj.outputs)) return [];
  const defs: WorkflowOutputDef[] = [];
  for (let i = 0; i < obj.outputs.length; i++) {
    const raw = obj.outputs[i] as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string' || !raw.name) {
      errors.push(`输出定义 #${i + 1}：缺少 name`);
      continue;
    }
    if (typeof raw.source !== 'string' || !raw.source) {
      errors.push(`输出定义「${raw.name}」：缺少来源 source`);
      continue;
    }
    const head = raw.source.split('.')[0] ?? '';
    if (!nodeIds.has(head)) {
      errors.push(`输出定义「${raw.name}」：来源节点「${head}」不存在`);
      continue;
    }
    defs.push({
      name: raw.name,
      type: typeof raw.type === 'string' ? raw.type : 'any',
      source: raw.source,
      description: typeof raw.description === 'string' ? raw.description : undefined,
    });
  }
  return defs;
}

function parseRunConfig(obj: Record<string, unknown>): WorkflowRunConfig {
  const rc = (obj.runConfig ?? {}) as Record<string, unknown>;
  const def = defaultRunConfig();
  return {
    maxSteps: typeof rc.maxSteps === 'number' && rc.maxSteps > 0 ? rc.maxSteps : def.maxSteps,
    timeoutMs: typeof rc.timeoutMs === 'number' && rc.timeoutMs >= 0 ? rc.timeoutMs : def.timeoutMs,
    failStrategy: rc.failStrategy === 'continue' ? 'continue' : 'stop',
    allowManualRun: typeof rc.allowManualRun === 'boolean' ? rc.allowManualRun : true,
  };
}

function parseModules(
  obj: Record<string, unknown>,
  nodeIds: Set<string>,
  edges: WorkflowEdgeModel[],
  errors: string[],
): WorkflowModule[] {
  if (!Array.isArray(obj.modules)) return [];
  const edgeIds = new Set(edges.map((e) => e.id));
  const modules: WorkflowModule[] = [];
  for (let i = 0; i < obj.modules.length; i++) {
    const raw = obj.modules[i] as Record<string, unknown> | null | undefined;
    if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') {
      errors.push(`模块 #${i + 1}：缺少 id`);
      continue;
    }
    if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges) || !Array.isArray(raw.ports)) {
      errors.push(`模块「${raw.id}」：缺少 nodes/edges/ports`);
      continue;
    }
    // 模块内部节点必须存在于工作流节点集合（引用校验）
    const modNodeIds = (raw.nodes as unknown[]).filter(
      (n): n is WorkflowNodeModel =>
        !!n && typeof n === 'object' && typeof (n as Record<string, unknown>).id === 'string',
    );
    for (const mn of modNodeIds) {
      if (!nodeIds.has(mn.id)) {
        errors.push(`模块「${raw.id}」：内部节点「${mn.id}」不在工作流节点中`);
        break;
      }
    }
    // 模块内部边必须存在于工作流边集合
    const modEdges = (raw.edges as unknown[]).filter(
      (e): e is WorkflowEdgeModel =>
        !!e && typeof e === 'object' && typeof (e as Record<string, unknown>).id === 'string',
    );
    for (const me of modEdges) {
      if (!edgeIds.has(me.id)) {
        errors.push(`模块「${raw.id}」：内部连线「${me.id}」不在工作流连线中`);
        break;
      }
    }
    modules.push({
      id: raw.id,
      name: typeof raw.name === 'string' && raw.name ? raw.name : '未命名模块',
      description: typeof raw.description === 'string' ? raw.description : undefined,
      version: typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1,
      nodes: modNodeIds,
      edges: modEdges,
      ports: (raw.ports as unknown[]).filter(
        (p): p is WorkflowModule['ports'][number] =>
          !!p && typeof p === 'object' && typeof (p as Record<string, unknown>).name === 'string',
      ),
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
    });
  }
  return modules;
}

/* ---------- 导出脱敏 ---------- */

const SENSITIVE_KEYS = new Set([
  'apikey',
  'api_key',
  'apikeys',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'secret_key',
  'client_secret',
  'password',
  'passwd',
  'authorization',
  'authorizationheader',
  'credential',
  'credentials',
  'accesskey',
  'access_key',
  'privatekey',
  'private_key',
  'session',
  'sessionid',
  'cookie',
  'cookies',
  'bearer',
  'x_api_key',
]);

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SENSITIVE_KEYS.has(k) || k.endsWith('secret') || k.endsWith('token');
}

/** 递归清洗节点配置：删除敏感字段（API Key / Token / 密码等） */
export function sanitizeNodeData(data: WorkflowNodeData): WorkflowNodeData {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isSensitiveKey(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = sanitizeNested(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) out[key] = cleaned;
      continue;
    }
    out[key] = value;
  }
  return out as unknown as WorkflowNodeData;
}

function sanitizeNested(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const cleaned = sanitizeNested(value as Record<string, unknown>);
      if (Object.keys(cleaned).length > 0) out[key] = cleaned;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** 清洗节点数组（导出 / 复制时确保不带敏感数据） */
export function sanitizeNodes(nodes: WorkflowNodeModel[]): WorkflowNodeModel[] {
  return nodes.map((n) => ({
    ...n,
    data: sanitizeNodeData(n.data),
  }));
}

/** 版本摘要生成（按结构签名去重） */
export function snapshotSignature(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]): string {
  const simple = sanitizeNodes(nodes).map((n) => ({
    id: n.id,
    kind: n.data.kind,
    label: n.data.label,
    position: n.position,
  }));
  const edgeIds = edges.map((e) => `${e.source}:${e.sourceHandle ?? ''}->${e.target}`).sort();
  return JSON.stringify({ simple, edgeIds });
}

/** 生成默认的版本摘要文案 */
export function describeSnapshot(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]): string {
  const kinds = new Set(nodes.map((n) => n.data.kind));
  const kindNames = [...kinds].map((k) => getNodeDef(k).label);
  return `${nodes.length} 节点 · ${edges.length} 连线（${kindNames.join('、')}）`;
}
