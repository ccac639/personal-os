/**
 * 模块化子图（纯函数，无 Vue 依赖）
 *
 * - 将选中节点 + 内部连线封装为可复用模块（输入/输出端口、名称、描述、版本）
 * - 模块实例：插入时生成全新节点 id，内部边重映射，端口对外连线
 * - 版本更新：同步实例（替换为最新定义）或仅创建新版本
 * - 端口推断：模块内节点中无内部入边的节点输入视为输入端口；
 *   无内部出边的节点输出视为输出端口
 */
import type { WorkflowEdgeModel, WorkflowModule, WorkflowNodeModel } from './types';
import { nodeData } from './types';

export interface ModuleBuildResult {
  module: WorkflowModule;
  /** 端口推断提示（输入端口无对应节点输入字段等） */
  warnings: string[];
}

/** 生成独立 id（时间戳 + 随机后缀） */
export function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** 推断端口：模块内无内部入边的节点 → 输入端口；无内部出边的节点 → 输出端口 */
export function inferPorts(nodes: WorkflowNodeModel[], edges: WorkflowEdgeModel[]) {
  const ids = new Set(nodes.map((n) => n.id));
  const internal = edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const hasIn = new Set(internal.map((e) => e.target));
  const hasOut = new Set(internal.map((e) => e.source));
  const inputs = nodes.filter((n) => !hasIn.has(n.id)).map((n) => n.id);
  const outputs = nodes.filter((n) => !hasOut.has(n.id)).map((n) => n.id);
  return { inputs, outputs };
}

/** 从选中节点构建模块（节点 data 深拷贝，去掉运行时状态） */
export function buildModule(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  name: string,
  description = '',
  version = 1,
): ModuleBuildResult {
  const warnings: string[] = [];
  if (nodes.length === 0) {
    warnings.push('未选择节点');
    return { module: emptyModule(name, description, version), warnings };
  }
  const { inputs, outputs } = inferPorts(nodes, edges);
  const module: WorkflowModule = {
    id: uid('mod'),
    name: name.trim() || '未命名模块',
    description,
    version,
    nodes: nodes.map((n) => ({
      ...n,
      id: n.id,
      data: { ...nodeData(n), status: 'idle' as const },
      selected: false,
    })),
    // 模块内部边：两端都必须属于模块节点（外部连线不算模块内容）
    edges: edges
      .filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target))
      .map((e) => ({ ...e, selected: false })),
    ports: [
      ...inputs.map((id) => ({ name: id, label: nodeLabel(nodes, id), kind: 'in' as const })),
      ...outputs.map((id) => ({ name: id, label: nodeLabel(nodes, id), kind: 'out' as const })),
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  if (inputs.length === 0) warnings.push('模块没有输入端口（所有节点都有内部入边）');
  if (outputs.length === 0) warnings.push('模块没有输出端口（所有节点都有内部出边）');
  return { module, warnings };
}

function emptyModule(name: string, description: string, version: number): WorkflowModule {
  return {
    id: uid('mod'),
    name: name.trim() || '未命名模块',
    description,
    version,
    nodes: [],
    edges: [],
    ports: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function nodeLabel(nodes: WorkflowNodeModel[], id: string): string {
  const n = nodes.find((nn) => nn.id === id);
  return n ? n.data.label || id : id;
}

/** 模块实例：插入到画布（新 id、内部边重映射、端口保留原 id 语义） */
export interface ModuleInstance {
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
  /** 旧节点 id → 新节点 id */
  idMap: Record<string, string>;
  /** 输入端口（对外连线的入口节点 id，已映射） */
  inputNodeIds: string[];
  /** 输出端口（对外连线的出口节点 id，已映射） */
  outputNodeIds: string[];
}

export function instantiateModule(
  module: WorkflowModule,
  idMap: Record<string, string> = {},
): ModuleInstance {
  const map: Record<string, string> = { ...idMap };
  const nodes = module.nodes.map((n) => {
    const newId = map[n.id] ?? uid('m');
    map[n.id] = newId;
    return { ...n, id: newId, data: { ...nodeData(n), status: 'idle' as const }, selected: false };
  });
  const edges = module.edges.map((e) => ({
    ...e,
    id: uid('e'),
    source: map[e.source] ?? e.source,
    target: map[e.target] ?? e.target,
    selected: false,
  }));
  const inputNodeIds = module.ports
    .filter((p) => p.kind === 'in')
    .map((p) => map[p.name] ?? p.name);
  const outputNodeIds = module.ports
    .filter((p) => p.kind === 'out')
    .map((p) => map[p.name] ?? p.name);
  return { nodes, edges, idMap: map, inputNodeIds, outputNodeIds };
}

/** 模块版本号递增（同步实例 = 替换画布内旧实例，仅更新模块定义 = 新版本） */
export function bumpVersion(module: WorkflowModule, syncExisting: boolean): WorkflowModule {
  return { ...module, version: module.version + 1, updatedAt: Date.now(), syncExisting };
}

/**
 * 替换画布中的旧实例为最新定义：
 * 需要知道每个实例的「实例根 id → 模块旧端口 id」映射。
 * 实现：查找画布中所有来自该模块的节点（通过实例 id 前缀无法可靠判断，
 * 因此由 store 记录实例清单），此处仅做纯替换逻辑。
 */
export function replaceInstances(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
  /** 实例记录：旧节点 id → 模块端口 id */
  instancePortMap: Map<string, string>,
  latest: WorkflowModule,
): { nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] } {
  // 收集旧实例节点 id（端口 id 是模块内节点 id，实例节点 id 是映射后的）
  const oldIds = [...instancePortMap.keys()];
  if (oldIds.length === 0) return { nodes, edges };
  const oldIdSet = new Set(oldIds);
  const keptNodes = nodes.filter((n) => !oldIdSet.has(n.id));
  const keptEdges = edges.filter((e) => !oldIdSet.has(e.source) && !oldIdSet.has(e.target));
  const idMapObj: Record<string, string> = {};
  for (const [k, v] of instancePortMap) idMapObj[k] = v;
  const inst = instantiateModule(latest, idMapObj);
  return {
    nodes: [...keptNodes, ...inst.nodes],
    edges: [...keptEdges, ...inst.edges],
  };
}
