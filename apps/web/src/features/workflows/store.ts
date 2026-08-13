/**
 * 工作流编排 Store（Pinia）— features/workflows 自包含实现
 *
 * 职责：
 * - 多工作流管理：创建 / 重命名 / 复制 / 删除 / 切换，localStorage v3 持久化
 * - 画布状态：节点 / 连线 / 多选 / 编辑，与 Vue Flow 解耦（轻量模型）
 * - 撤销 / 重做（覆盖节点、边、属性、工作流操作，内存栈上限 50）
 * - 复制 / 粘贴节点（新 ID、内部边、防重叠）
 * - 图校验 / 拓扑排序（topo.ts 纯函数）
 * - 本地模拟执行（runner.ts 纯函数：暂停 / 继续 / 取消 / 单节点 / 从选中继续）
 * - 版本快照 / 模板 / 标签 / 描述 / 收藏
 * - 导入预览与严格校验、导出脱敏（migrate.ts）
 *
 * 类型说明：内部使用与 Vue Flow 解耦的 WorkflowNodeModel / WorkflowEdgeModel
 * （见 types.ts），画布组件在边界做 as unknown as 转换，规避
 * motion/motion-v 双重类型增强导致的 vue-tsc 深层实例化问题。
 */
import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { Connection } from '@vue-flow/core';
import {
  getNodeDef,
  nextEdgeId,
  nextNodeId,
  NODE_KINDS,
  nodeData,
  type NodeStatus,
  type ReplayState,
  type RunHistoryEntry,
  type RunHistoryStatus,
  type RunLogEntry,
  type RunMode,
  type RunNodeResult,
  type RunParams,
  type WorkflowEdgeModel,
  type WorkflowInputDef,
  type WorkflowModule,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowNodeModel,
  type WorkflowOutputDef,
  type WorkflowRunConfig,
  type WorkflowVersion,
  type XYPosition,
} from './types';
import { graphStats, topoSort, validateGraph, type TopoResult } from './topo';
import { createRunControl, runWorkflow, type RunnerHooks, type RunSnapshot } from './runner';
import { normalizeDelay, resetToDefaults, validateDataShape } from './schema';
import { autoConnect, type AutoConnectResult } from './ai-workflow-schema';
import {
  alignPositions,
  autoLayoutPositions,
  distributePositions,
  type AlignAxis,
  type DistributeAxis,
} from './layout';
import {
  buildTemplate,
  loadTemplates,
  parseTemplateJson,
  saveTemplates,
  type NodeTemplate,
} from './templates';
import { extractVars } from './vars';
import {
  buildRunInput,
  summarizeOutputs,
  summarizeValue,
  validateInputDefs,
  validateOutputDefs,
} from './io';
import {
  appendRunRecord,
  clearRunHistory,
  compareRuns,
  createRunRecord,
  exportRunRecord,
  filterRunHistory,
  loadRunHistory as loadHistoryStorage,
  removeRunRecord,
  saveRunHistory,
  type RunHistoryFilter,
} from './history';
import { buildModule, instantiateModule } from './modules';
import {
  checkTypeCompatibility,
  diagnoseWorkflow,
  estimatePerformance,
  type DiagnosticIssue,
} from './diagnostics';
import {
  detectWorkflowCycle,
  validateSubflowRefs,
  type SubflowIssue,
  type WorkflowStub,
} from './subworkflow';
import {
  mockAiGenerateService,
  parseAiResponse,
  type AiGenerateService,
  type AiGenMode,
  type WorkflowAiResponse,
} from './ai-workflow';
import {
  defaultRunConfig,
  loadAllWorkflows,
  saveAllWorkflows,
  parseWorkflowJson,
  sanitizeNodes,
  snapshotSignature,
  describeSnapshot,
  MAX_VERSIONS,
  type ImportPreview,
  type LoadResult,
  type StoredWorkflow,
  type WorkflowLastRun,
  type WorkflowMeta,
} from './migrate';

export type { WorkflowLastRun, WorkflowMeta, StoredWorkflow, ImportPreview };

/** 运行结果摘要（历史写入用，与 runner.RunResult 兼容子集） */
interface RunResultLike {
  status: 'success' | 'failed' | 'cancelled';
  ok: boolean;
  outputs: Record<string, unknown>;
  logs: Array<{ level: string; text: string; nodeId?: string; ts?: number }>;
  failedNodeId?: string;
  error?: string;
  suggestion?: string;
  durationMs: number;
}

/** 撤销栈深度上限 */
const UNDO_LIMIT = 50;

/** 默认画布起点（避免节点堆叠在原点） */
const START: XYPosition = { x: 60, y: 60 };

function nextWorkflowId(): string {
  return `wf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export interface UndoState {
  records: StoredWorkflow[];
  activeId: string | null;
  selectedId: string | null;
  /** 多选状态（还原时与 selectedId 同步恢复） */
  selectedIds: string[];
}

/** AI 生成预览阶段（动画展示用，只作用于 preview，不修改正式画布） */
export type AiPhase =
  'idle' | 'analyzing' | 'scanning' | 'nodes' | 'edges' | 'validating' | 'ready' | 'error';

/** AI 草稿节点的稳定映射计划 */
export interface AiNodePlan {
  draftId: string;
  stableId: string;
  kind: WorkflowNodeKind;
  label: string;
  data: WorkflowNodeData;
  position: XYPosition;
  /** 相对当前画布：新增 or 已存在（extend 模式下为修改） */
  isNew: boolean;
}

/** AI 预览状态（不持久化；确认前不触碰正式数据） */
export interface AiPreviewState {
  response: WorkflowAiResponse;
  scope: AiGenMode;
  nodes: AiNodePlan[];
  /** 草稿边（映射到 stableId） */
  draftEdges: WorkflowEdgeModel[];
  /** 自动连线结果（引用 stableId） */
  auto: AutoConnectResult;
  /** 待确认端口：index -> 是否勾选 */
  pendingChoices: Record<number, boolean>;
  warnings: string[];
  createdAt: number;
}

export const useWorkflowStore = defineStore('workflow', () => {
  /* ---------- 持久化数据 ---------- */

  const records = ref<StoredWorkflow[]>([]);
  const activeId = ref<string | null>(null);
  const selectedId = ref<string | null>(null);
  const selectedIds = ref<string[]>([]);
  const running = ref(false);
  /** 当前正在执行的节点 id（运行进度展示） */
  const runningNodeId = ref<string | null>(null);
  /** 运行暂停状态（断点 / 单步 / 手动暂停统一在此维护） */
  const paused = ref(false);
  /** 断点节点 id 集合（运行前暂停，画布红色角标） */
  const breakpoints = ref<Set<string>>(new Set());
  /** 最近一次运行的节点输出（id → 模拟输出，供变量浏览器 / 输出预览） */
  const runOutputs = ref<Record<string, unknown>>({});
  /** 节点模板库（localStorage 独立持久化） */
  const nodeTemplates = ref<NodeTemplate[]>([]);
  /** 运行历史（独立持久化边界） */
  const runHistory = ref<RunHistoryEntry[]>([]);
  /** 运行历史读取警告（非阻塞展示） */
  const runHistoryWarnings = ref<string[]>([]);
  /** 人工确认等待状态（manual-approval 节点） */
  const approvalPending = ref(false);
  /** 回放态：节点 id → 历史状态（非空 = 只读回放） */
  const replayState = ref<ReplayState | null>(null);
  /** 回放对应的运行记录 id */
  const replayRunId = ref<string | null>(null);
  /** 健康诊断结果（按需计算） */
  const diagnostics = ref<DiagnosticIssue[]>([]);
  const dirty = ref(false);
  /** 每次加载/示例/导入/清空/切换自增，画布据此重新 fitView */
  const layoutBump = ref(0);
  /** 最近一次模拟运行的日志（跨工作流共享展示，兼容旧 string[] 用法） */
  const runLogs = ref<string[]>([]);
  /** 结构化运行日志（级别 + 节点关联，供筛选与定位） */
  const runEntries = ref<RunLogEntry[]>([]);
  /** 运行模式与参数（工具栏可调） */
  const runMode = ref<RunMode>('full');
  const runParams = ref<RunParams>({ initialText: '', variables: {}, context: {} });
  /** 保存失败提示（非阻塞） */
  const persistError = ref<string | null>(null);
  /** 启动迁移警告（非阻塞，列表展示一次） */
  const migrationWarnings = ref<string[]>([]);
  /** 运行控制句柄（暂停/继续/取消） */
  const control = createRunControl();

  /** 撤销 / 重做栈（状态为 UndoState JSON 快照；past 最新在末尾） */
  const undoPast = ref<string[]>([]);
  const undoFuture = ref<string[]>([]);
  const canUndo = ref(false);
  const canRedo = ref(false);
  function syncUndoFlags() {
    canUndo.value = undoPast.value.length > 0;
    canRedo.value = undoFuture.value.length > 0;
  }

  /** 当前画布剪切板（节点 + 内部边，脱敏） */
  const clipboard = ref<{ nodes: WorkflowNodeModel[]; edges: WorkflowEdgeModel[] } | null>(null);

  const active = computed(() => records.value.find((r) => r.id === activeId.value) ?? null);

  /** 当前工作流可写视图（无激活工作流时自动兜底为新建） */
  const name = computed({
    get: () => active.value?.name ?? '未命名工作流',
    set: (v) => {
      if (active.value) active.value.name = v;
    },
  });
  const seq = computed({
    get: () => active.value?.seq ?? 1,
    set: (v) => {
      if (active.value) active.value.seq = v;
    },
  });
  const nodes = computed<WorkflowNodeModel[]>({
    get: () => active.value?.nodes ?? [],
    set: (v) => {
      if (active.value) active.value.nodes = v;
    },
  });
  const edges = computed<WorkflowEdgeModel[]>({
    get: () => active.value?.edges ?? [],
    set: (v) => {
      if (active.value) active.value.edges = v;
    },
  });

  const selectedNode = computed<WorkflowNodeModel | null>(
    () => nodes.value.find((n) => n.id === selectedId.value) ?? null,
  );

  /** 当前工作流最近一次运行记录（工具栏/列表展示用） */
  const activeLastRun = computed(() => active.value?.lastRun ?? null);

  const stats = computed(() => graphStats(nodes.value, edges.value));

  /** 列表视图元数据（按更新时间倒序） */
  const workflows = computed<WorkflowMeta[]>(() =>
    [...records.value]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((r) => ({
        id: r.id,
        name: r.name,
        updatedAt: r.updatedAt,
        nodeCount: r.nodes.length,
        edgeCount: r.edges.length,
        lastRun: r.lastRun ?? null,
        tags: r.tags ?? [],
        description: r.description ?? '',
        favorite: r.favorite === true,
        isTemplate: r.isTemplate === true,
        versionCount: r.versions?.length ?? 0,
      })),
  );

  /** 收藏的工作流（列表置顶用） */
  const favoriteWorkflows = computed(() => workflows.value.filter((w) => w.favorite));

  /* ---------- 撤销 / 重做 ---------- */

  function captureUndoState(): string {
    return JSON.stringify({
      records: records.value,
      activeId: activeId.value,
      selectedId: selectedId.value,
      selectedIds: [...selectedIds.value],
    } satisfies UndoState);
  }

  /** 变更前调用：记录当前状态到撤销栈（与最近一次相同则去重） */
  function pushUndo() {
    const state = captureUndoState();
    const past = undoPast.value;
    if (past.length > 0 && past[past.length - 1] === state) return;
    past.push(state);
    if (past.length > UNDO_LIMIT) past.splice(0, past.length - UNDO_LIMIT);
    undoFuture.value = [];
    syncUndoFlags();
  }

  function restoreUndoState(state: string) {
    try {
      const s = JSON.parse(state) as UndoState;
      records.value = s.records;
      activeId.value = s.activeId;
      // 多选状态一并还原（避免撤销后丢失框选/多选）
      if (Array.isArray(s.selectedIds) && s.selectedIds.length > 0) {
        selectMany(s.selectedIds);
        if (s.selectedId && s.selectedIds.includes(s.selectedId)) selectedId.value = s.selectedId;
      } else {
        selectNode(s.selectedId);
      }
      layoutBump.value++;
    } catch {
      /* 快照损坏则忽略 */
    }
  }

  function undo() {
    if (running.value) return;
    const past = undoPast.value;
    if (past.length === 0) return;
    const target = past[past.length - 1]!;
    past.length -= 1;
    undoFuture.value.push(captureUndoState());
    restoreUndoState(target);
    syncUndoFlags();
  }

  function redo() {
    if (running.value) return;
    const future = undoFuture.value;
    if (future.length === 0) return;
    const target = future[future.length - 1]!;
    future.length -= 1;
    undoPast.value.push(captureUndoState());
    restoreUndoState(target);
    syncUndoFlags();
  }

  /* ---------- 工作流 CRUD ---------- */

  function ensureActive(): StoredWorkflow {
    let rec = active.value;
    if (!rec) {
      rec = {
        id: nextWorkflowId(),
        name: '未命名工作流',
        updatedAt: Date.now(),
        seq: 1,
        nodes: [],
        edges: [],
      };
      records.value.push(rec);
      activeId.value = rec.id;
    }
    return rec;
  }

  /** 新建工作流并切换为当前 */
  function createWorkflow(workflowName = '未命名工作流'): string {
    if (dirty.value) save();
    pushUndo();
    const rec: StoredWorkflow = {
      id: nextWorkflowId(),
      name: workflowName.trim() || '未命名工作流',
      updatedAt: Date.now(),
      seq: 1,
      nodes: [],
      edges: [],
    };
    records.value.push(rec);
    activeId.value = rec.id;
    selectNode(null);
    layoutBump.value++;
    return rec.id;
  }

  function renameWorkflow(id: string, workflowName: string) {
    const rec = records.value.find((r) => r.id === id);
    if (!rec) return;
    const trimmed = workflowName.trim();
    if (!trimmed) return;
    if (rec.name === trimmed) return;
    pushUndo();
    rec.name = trimmed;
    rec.updatedAt = Date.now();
  }

  /** 重命名当前工作流（工具栏输入框提交，单次撤销） */
  function renameActive(workflowName: string) {
    const rec = active.value;
    if (!rec) return;
    const trimmed = workflowName.trim();
    if (!trimmed || rec.name === trimmed) return;
    pushUndo();
    rec.name = trimmed;
    rec.updatedAt = Date.now();
  }

  /** 复制工作流（含节点/连线/序号，新副本并切换过去） */
  function duplicateWorkflow(id: string): string {
    const src = records.value.find((r) => r.id === id);
    if (!src) return '';
    if (dirty.value) save();
    pushUndo();
    const copy: StoredWorkflow = {
      id: nextWorkflowId(),
      name: `${src.name}（副本）`,
      updatedAt: Date.now(),
      seq: src.seq,
      nodes: src.nodes.map((n) => ({
        ...n,
        id: `${n.id}-c`,
        data: { ...nodeData(n), status: 'idle' as const },
        selected: false,
      })),
      edges: src.edges.map((e) => ({ ...e, id: `${e.id}-c`, selected: false })),
      lastRun: null,
      tags: [...(src.tags ?? [])],
      description: src.description ?? '',
      favorite: false,
      isTemplate: false,
    };
    // 复制后修正连线指向（节点 id 加了 -c 后缀）
    copy.edges = copy.edges
      .map((e) => ({
        ...e,
        source: `${e.source}-c`,
        target: `${e.target}-c`,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      }))
      .filter(
        (e) =>
          copy.nodes.some((n) => n.id === e.source) && copy.nodes.some((n) => n.id === e.target),
      );
    records.value.push(copy);
    activeId.value = copy.id;
    selectNode(null);
    layoutBump.value++;
    save();
    return copy.id;
  }

  function deleteWorkflow(id: string) {
    const idx = records.value.findIndex((r) => r.id === id);
    if (idx < 0) return;
    pushUndo();
    records.value.splice(idx, 1);
    if (activeId.value === id) {
      activeId.value = records.value[Math.min(idx, records.value.length - 1)]?.id ?? null;
      selectNode(null);
      layoutBump.value++;
    }
    save();
  }

  /** 切换当前编辑的工作流 */
  function openWorkflow(id: string) {
    if (id === activeId.value) return;
    if (dirty.value) save();
    const rec = records.value.find((r) => r.id === id);
    if (!rec) return;
    activeId.value = id;
    selectNode(null);
    layoutBump.value++;
    // 切换工作流后清理 undo 上下文，避免跨工作流误撤销
    undoPast.value = [];
    undoFuture.value = [];
    syncUndoFlags();
  }

  /* ---------- 工作流元数据（标签 / 描述 / 收藏 / 模板） ---------- */

  function updateMeta(
    id: string,
    patch: { tags?: string[]; description?: string; favorite?: boolean; isTemplate?: boolean },
  ) {
    const rec = records.value.find((r) => r.id === id);
    if (!rec) return;
    pushUndo();
    if (patch.tags !== undefined) rec.tags = patch.tags;
    if (patch.description !== undefined) rec.description = patch.description;
    if (patch.favorite !== undefined) rec.favorite = patch.favorite;
    if (patch.isTemplate !== undefined) rec.isTemplate = patch.isTemplate;
    rec.updatedAt = Date.now();
  }

  function toggleFavorite(id: string) {
    const rec = records.value.find((r) => r.id === id);
    if (rec) updateMeta(id, { favorite: !(rec.favorite === true) });
  }

  function toggleTemplate(id: string) {
    const rec = records.value.find((r) => r.id === id);
    if (rec) updateMeta(id, { isTemplate: !(rec.isTemplate === true) });
  }

  /** 模板 → 新工作流（独立 ID，互不污染） */
  function createFromTemplate(id: string): string {
    return duplicateWorkflow(id);
  }

  /* ---------- 版本快照 ---------- */

  function createVersion(summary?: string): string | null {
    const rec = active.value;
    if (!rec) return null;
    const version: WorkflowVersion = {
      id: `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      summary: summary || describeSnapshot(rec.nodes, rec.edges),
      createdAt: Date.now(),
      nodes: rec.nodes.map((n) => ({
        ...n,
        data: { ...nodeData(n), status: 'idle' as const },
        selected: false,
      })),
      edges: rec.edges.map((e) => ({ ...e, selected: false })),
      seq: rec.seq,
    };
    rec.versions = [version, ...(rec.versions ?? [])].slice(0, MAX_VERSIONS);
    return version.id;
  }

  /** 当前内容相对最近版本的签名是否变化（自动版本用） */
  function structureChanged(): boolean {
    const rec = active.value;
    if (!rec) return false;
    const latest = rec.versions?.[0];
    if (!latest) return true;
    return (
      snapshotSignature(rec.nodes, rec.edges) !== snapshotSignature(latest.nodes, latest.edges)
    );
  }

  function listVersions(): WorkflowVersion[] {
    return active.value?.versions ?? [];
  }

  /** 恢复版本：独立深拷贝到当前工作流（不污染版本本身） */
  function restoreVersion(id: string): boolean {
    const rec = active.value;
    const version = rec?.versions?.find((v) => v.id === id);
    if (!rec || !version) return false;
    pushUndo();
    // 防御性校验：恢复时丢弃未知节点 / 错误 schema / 孤立边
    const validNodes = version.nodes.filter(
      (n) => n && n.data && NODE_KINDS.has(n.data.kind) && validateDataShape(n.data).length === 0,
    );
    const vIds = new Set(validNodes.map((n) => n.id));
    const validEdges = version.edges.filter((e) => vIds.has(e.source) && vIds.has(e.target));
    rec.nodes = validNodes.map((n) => ({
      ...n,
      data: { ...nodeData(n), status: 'idle' as const },
      selected: false,
    }));
    rec.edges = validEdges.map((e) => ({ ...e, selected: false }));
    rec.seq = version.seq > 0 ? version.seq : rec.seq;
    rec.updatedAt = Date.now();
    selectNode(null);
    layoutBump.value++;
    return true;
  }

  /* ---------- 节点 ---------- */

  function computePosition(): XYPosition {
    if (nodes.value.length === 0) return { ...START };
    const maxX = Math.max(...nodes.value.map((n) => n.position.x)) + 280;
    const row = (nodes.value.length - 1) % 5;
    return { x: maxX, y: 60 + row * 130 };
  }

  function addNode(kind: WorkflowNodeKind, position?: XYPosition): string {
    if (replayState.value) return '';
    const rec = ensureActive();
    pushUndo();
    const def = getNodeDef(kind);
    const id = nextNodeId(rec.seq++);
    rec.nodes.push({
      id,
      type: 'custom',
      position: position ?? computePosition(),
      data: { kind, label: def.label, status: 'idle', ...def.defaults },
    });
    selectNode(id);
    return id;
  }

  function updateNodeData(id: string, patch: Partial<WorkflowNodeData>) {
    if (replayState.value) return;
    const node = nodes.value.find((n) => n.id === id);
    if (!node) return;
    pushUndo();
    let next = { ...nodeData(node), ...patch };
    if (next.kind === 'delay') next = normalizeDelay(next);
    node.data = next;
  }

  function removeNode(id: string) {
    if (replayState.value) return;
    if (!active.value) return;
    pushUndo();
    active.value.nodes = active.value.nodes.filter((n) => n.id !== id);
    active.value.edges = active.value.edges.filter((e) => e.source !== id && e.target !== id);
    if (selectedId.value === id) selectNode(null);
  }

  /** 批量删除（多选） */
  function removeNodes(ids: string[]) {
    if (!active.value || ids.length === 0) return;
    pushUndo();
    const set = new Set(ids);
    active.value.nodes = active.value.nodes.filter((n) => !set.has(n.id));
    active.value.edges = active.value.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
    if (selectedId.value && set.has(selectedId.value)) selectNode(null);
  }

  function selectNode(id: string | null) {
    selectedId.value = id;
    selectedIds.value = id ? [id] : [];
    // 与画布高亮保持一致：显式同步 selected 标记
    nodes.value = nodes.value.map((n) => ({ ...n, selected: n.id === id }));
  }

  /** 多选：additive 时追加/移除，否则单选 */
  function toggleNodeSelected(id: string, additive: boolean) {
    if (additive) {
      const idx = selectedIds.value.indexOf(id);
      if (idx >= 0) {
        selectedIds.value = selectedIds.value.filter((x) => x !== id);
        selectedId.value = selectedIds.value[0] ?? null;
      } else {
        selectedIds.value = [...selectedIds.value, id];
        selectedId.value = id;
      }
    } else {
      selectedIds.value = [id];
      selectedId.value = id;
    }
    const set = new Set(selectedIds.value);
    nodes.value = nodes.value.map((n) => ({ ...n, selected: set.has(n.id) }));
  }

  /** 框选结果同步 */
  function selectMany(ids: string[]) {
    selectedIds.value = [...ids];
    selectedId.value = ids[0] ?? null;
    const set = new Set(selectedIds.value);
    nodes.value = nodes.value.map((n) => ({ ...n, selected: set.has(n.id) }));
  }

  function clearSelection() {
    selectNode(null);
  }

  /** 画布操作前的撤销点（拖动开始 / 删除前等） */
  function recordUndoPoint() {
    pushUndo();
  }

  /** 节点被删除后的边清理（撤销点已由调用方记录） */
  function afterNodesRemoved(ids: string[]) {
    if (!active.value || ids.length === 0) return;
    const set = new Set(ids);
    active.value.edges = active.value.edges.filter((e) => !set.has(e.source) && !set.has(e.target));
  }

  /** 聚焦请求自增：画布据此 fitView 到选中节点 */
  const focusRequest = ref(0);
  function focusSelected() {
    focusRequest.value++;
  }

  /** 批量移动节点（来自画布拖动，position 已更新） */
  function moveNodes(positions: Array<{ id: string; position: XYPosition }>) {
    if (!active.value || positions.length === 0) return;
    const map = new Map(positions.map((p) => [p.id, p.position]));
    active.value.nodes = active.value.nodes.map((n) =>
      map.has(n.id) ? { ...n, position: map.get(n.id)! } : n,
    );
  }

  /* ---------- 对齐 / 分布 / 自动布局 ---------- */

  /** 对齐选中节点（≥2 个），单次撤销 */
  function alignSelected(axis: AlignAxis): boolean {
    const selNodes = nodes.value.filter((n) => selectedIds.value.includes(n.id));
    if (selNodes.length < 2) return false;
    pushUndo();
    moveNodes(alignPositions(selNodes, axis));
    return true;
  }

  /** 分布选中节点（≥3 个），单次撤销 */
  function distributeSelected(axis: DistributeAxis): boolean {
    const selNodes = nodes.value.filter((n) => selectedIds.value.includes(n.id));
    if (selNodes.length < 3) return false;
    pushUndo();
    moveNodes(distributePositions(selNodes, axis));
    return true;
  }

  /** 自动布局整个画布（分层），单次撤销 */
  function autoLayoutCanvas(): boolean {
    if (nodes.value.length < 2) return false;
    pushUndo();
    moveNodes(autoLayoutPositions(nodes.value, edges.value));
    return true;
  }

  /* ---------- 节点模板 ---------- */

  let templatesLoaded = false;
  function ensureTemplates(): NodeTemplate[] {
    if (!templatesLoaded) {
      nodeTemplates.value = loadTemplates();
      templatesLoaded = true;
    }
    return nodeTemplates.value;
  }

  function persistTemplates(): boolean {
    return saveTemplates(nodeTemplates.value);
  }

  /** 保存选中子图为模板（剥离运行时状态与敏感字段） */
  function saveSelectionAsTemplate(name: string, description = ''): NodeTemplate | null {
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return null;
    const selNodes = nodes.value.filter((n) => sel.has(n.id));
    const tpl = buildTemplate(name, selNodes, edges.value, description);
    nodeTemplates.value = [tpl, ...nodeTemplates.value];
    persistTemplates();
    return tpl;
  }

  /** 插入模板到画布：全新 ID、内部边重映射、防重叠（与粘贴同策略） */
  function insertTemplate(id: string, position?: XYPosition): boolean {
    ensureTemplates();
    const tpl = nodeTemplates.value.find((t) => t.id === id);
    const rec = active.value;
    if (!tpl || !rec || tpl.nodes.length === 0) return false;
    pushUndo();

    const idMap = new Map<string, string>();
    const newNodes: WorkflowNodeModel[] = [];
    const base = position ?? { x: 80, y: 80 };
    let offsetX = 0;
    let offsetY = 0;
    const occupied = new Set(
      nodes.value.map((n) => `${Math.round(n.position.x / 40)},${Math.round(n.position.y / 40)}`),
    );
    const first = tpl.nodes[0]!;
    let guard = 0;
    while (guard < 20) {
      const key = `${Math.round((base.x + offsetX + first.position.x) / 40)},${Math.round((base.y + offsetY + first.position.y) / 40)}`;
      if (!occupied.has(key)) break;
      offsetX += 40;
      offsetY += 40;
      guard++;
    }

    for (const n of tpl.nodes) {
      const newId = nextNodeId(rec.seq++);
      idMap.set(n.id, newId);
      newNodes.push({
        ...n,
        id: newId,
        position: { x: n.position.x + base.x + offsetX, y: n.position.y + base.y + offsetY },
        data: { ...n.data, status: 'idle' as const },
        selected: false,
      });
    }
    const newEdges = tpl.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: nextEdgeId(idMap.get(e.source)!, e.sourceHandle, idMap.get(e.target)!),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        selected: false,
      }));

    rec.nodes.push(...newNodes);
    rec.edges.push(...newEdges);
    selectMany(newNodes.map((n) => n.id));
    return true;
  }

  function deleteTemplate(id: string): boolean {
    ensureTemplates();
    const before = nodeTemplates.value.length;
    nodeTemplates.value = nodeTemplates.value.filter((t) => t.id !== id);
    if (nodeTemplates.value.length === before) return false;
    persistTemplates();
    return true;
  }

  /** 导出全部模板 JSON */
  function exportTemplatesJson(): string {
    ensureTemplates();
    return JSON.stringify({ version: 1, templates: nodeTemplates.value }, null, 2);
  }

  /** 导入模板 JSON（严格校验，失败不写入） */
  function importTemplatesJson(text: string): { ok: boolean; errors: string[]; added: number } {
    ensureTemplates();
    const result = parseTemplateJson(text);
    if (!result.ok) return { ok: false, errors: result.errors, added: 0 };
    // 导入的模板已由 parse 生成全新 ID（buildTemplate），不覆盖现有模板
    nodeTemplates.value = [...result.templates, ...nodeTemplates.value];
    persistTemplates();
    return { ok: true, errors: [], added: result.templates.length };
  }

  /* ---------- 变量浏览器 / 数据映射 ---------- */

  /** 当前可用的变量清单（运行参数 + 最近运行节点输出），供浏览器 / 诊断 */
  const availableVars = computed<Array<{ name: string; source: string; value: unknown }>>(() => {
    const vars: Array<{ name: string; source: string; value: unknown }> = [];
    const p = runParams.value;
    if (p.initialText !== undefined && p.initialText !== '') {
      vars.push({ name: 'input', source: '运行参数', value: p.initialText });
    }
    for (const [k, v] of Object.entries(p.variables ?? {})) {
      vars.push({ name: k, source: '变量', value: v });
    }
    for (const [k, v] of Object.entries(p.context ?? {})) {
      vars.push({ name: k, source: '上下文', value: v });
    }
    for (const n of nodes.value) {
      const out = runOutputs.value[n.id];
      if (out !== undefined) {
        vars.push({ name: n.id, source: `${n.data.label || n.id} 输出`, value: out });
      }
    }
    if (runOutputs.value.previous !== undefined) {
      vars.push({ name: 'previous', source: '上游输出', value: runOutputs.value.previous });
    }
    return vars;
  });

  const availableVarNames = computed(() => new Set(availableVars.value.map((v) => v.name)));

  /** 节点各文本字段引用的变量（输入预览 / 插入用） */
  function nodeInputVars(id: string): Array<{ field: string; vars: string[] }> {
    const n = nodes.value.find((x) => x.id === id);
    if (!n) return [];
    const d = n.data;
    const fields: Array<[string, string | undefined]> = [
      ['template', d.template],
      ['prompt', d.prompt],
      ['title', d.title],
      ['message', d.message],
      ['expr', d.expr],
    ];
    return fields
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([field, v]) => ({ field, vars: extractVars(v!) }));
  }

  /** 缺失变量诊断：节点引用了但当前不可用的变量名 */
  function missingVarsFor(id: string): string[] {
    const missing = new Set<string>();
    for (const { vars } of nodeInputVars(id)) {
      for (const v of vars) if (!availableVarNames.value.has(v)) missing.add(v);
    }
    return [...missing];
  }

  /** 节点最近一次运行输出预览（JSON 摘要） */
  function nodeOutputPreview(id: string): string {
    const out = runOutputs.value[id];
    if (out === undefined) return '';
    const text = typeof out === 'object' ? JSON.stringify(out) : String(out);
    return text.length > 200 ? `${text.slice(0, 200)}…` : text;
  }

  /* ---------- 断点 / 单步 ---------- */

  function toggleBreakpoint(id: string) {
    const next = new Set(breakpoints.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    breakpoints.value = next;
  }

  function hasBreakpoint(id: string): boolean {
    return breakpoints.value.has(id);
  }

  /** 单步：执行完下一个节点后自动暂停（仅运行中有效） */
  function stepRun() {
    if (!running.value) return;
    control.stepOnce = true;
    control.paused = false;
    paused.value = false;
  }

  /* ---------- 复制 / 粘贴 ---------- */

  /** 复制当前选中节点（含内部边）到剪贴板（脱敏、剥离运行时状态） */
  function copySelection(): boolean {
    const sel = new Set(selectedIds.value);
    if (sel.size === 0) return false;
    const copiedNodes = sanitizeNodes(
      nodes.value.filter((n) => sel.has(n.id)).map((n) => ({ ...n, selected: false })),
    );
    const copiedIds = new Set(copiedNodes.map((n) => n.id));
    const copiedEdges = edges.value
      .filter((e) => copiedIds.has(e.source) && copiedIds.has(e.target))
      .map((e) => ({ ...e, selected: false }));
    clipboard.value = { nodes: copiedNodes, edges: copiedEdges };
    return true;
  }

  /** 粘贴：生成新 ID、内部边重映射、偏移避免重叠 */
  function pasteNodes(position?: XYPosition): boolean {
    const src = clipboard.value;
    const rec = active.value;
    if (!src || !rec || src.nodes.length === 0) return false;
    pushUndo();

    const idMap = new Map<string, string>();
    const newNodes: WorkflowNodeModel[] = [];
    const base = position ?? { x: 80, y: 80 };
    let offsetX = 0;
    let offsetY = 0;

    // 碰撞检测：粘贴区域与现有节点重叠时级联偏移
    const occupied = new Set(
      nodes.value.map((n) => `${Math.round(n.position.x / 40)},${Math.round(n.position.y / 40)}`),
    );
    const first = src.nodes[0]!;
    let guard = 0;
    while (guard < 20) {
      const key = `${Math.round((base.x + offsetX + first.position.x) / 40)},${Math.round((base.y + offsetY + first.position.y) / 40)}`;
      if (!occupied.has(key)) break;
      offsetX += 40;
      offsetY += 40;
      guard++;
    }

    for (const n of src.nodes) {
      const newId = nextNodeId(rec.seq++);
      idMap.set(n.id, newId);
      newNodes.push({
        ...n,
        id: newId,
        position: {
          x: n.position.x + base.x + offsetX,
          y: n.position.y + base.y + offsetY,
        },
        data: { ...nodeData(n), status: 'idle' as const },
        selected: false,
      });
    }
    const newEdges = src.edges
      .filter((e) => idMap.has(e.source) && idMap.has(e.target))
      .map((e) => ({
        ...e,
        id: nextEdgeId(idMap.get(e.source)!, e.sourceHandle, idMap.get(e.target)!),
        source: idMap.get(e.source)!,
        target: idMap.get(e.target)!,
        selected: false,
      }));

    rec.nodes.push(...newNodes);
    rec.edges.push(...newEdges);
    selectMany(newNodes.map((n) => n.id));
    return true;
  }

  /** 删除选中节点（多选） */
  function deleteSelection() {
    if (selectedIds.value.length > 0) removeNodes([...selectedIds.value]);
  }

  /* ---------- 连线 ---------- */

  function addEdge(conn: Connection) {
    if (replayState.value) return;
    if (!conn.source || !conn.target) return;
    const dup = edges.value.some(
      (e) =>
        e.source === conn.source &&
        e.target === conn.target &&
        e.sourceHandle === conn.sourceHandle,
    );
    if (dup) return;
    pushUndo();
    edges.value.push({
      id: nextEdgeId(conn.source, conn.sourceHandle, conn.target),
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle,
      targetHandle: conn.targetHandle,
      type: 'smoothstep',
    });
  }

  function removeEdge(id: string) {
    if (!edges.value.some((e) => e.id === id)) return;
    pushUndo();
    edges.value = edges.value.filter((e) => e.id !== id);
  }

  function removeEdges(ids: string[]) {
    if (ids.length === 0) return;
    const set = new Set(ids);
    const before = edges.value.length;
    edges.value = edges.value.filter((e) => !set.has(e.id));
    if (edges.value.length === before) return;
    pushUndo();
  }

  /* ---------- 图结构校验 / 拓扑排序 ---------- */

  function topo(): TopoResult {
    return topoSort(nodes.value, edges.value);
  }

  /** Kahn 拓扑排序（兼容旧 API） */
  function topoSortFn(): TopoResult {
    return topo();
  }

  /** BFS 拓扑顺序（含环内节点兜底，兼容历史行为） */
  function executionOrder(): string[] {
    const { order, cycleIds } = topo();
    return [...order, ...cycleIds.filter((id) => !order.includes(id))];
  }

  /** 结构校验：空画布 / 缺触发器 / 存在环 / 孤立节点提示 */
  function validate() {
    return validateGraph(nodes.value, edges.value);
  }

  /* ---------- 持久化 ---------- */

  /** 序列化时剥离运行时状态（status / selected） */
  function serialize(rec: StoredWorkflow): StoredWorkflow {
    return {
      id: rec.id,
      name: rec.name,
      updatedAt: rec.updatedAt,
      seq: rec.seq,
      nodes: sanitizeNodes(rec.nodes).map((n) => {
        const copy = { ...n } as Partial<WorkflowNodeModel>;
        delete copy.selected;
        return { ...copy, data: { ...nodeData(n), status: 'idle' } as WorkflowNodeData };
      }) as WorkflowNodeModel[],
      edges: rec.edges.map((e) => {
        const copy = { ...e } as Partial<WorkflowEdgeModel>;
        delete copy.selected;
        return copy as WorkflowEdgeModel;
      }) as WorkflowEdgeModel[],
      lastRun: rec.lastRun ?? null,
      tags: rec.tags ?? [],
      description: rec.description ?? '',
      favorite: rec.favorite === true,
      isTemplate: rec.isTemplate === true,
      versions: rec.versions ?? [],
    };
  }

  function persist() {
    const ok = saveAllWorkflows(records.value.map(serialize));
    persistError.value = ok ? null : '保存失败：浏览器存储不可用，当前修改仅在内存中';
    return ok;
  }

  /** 立即保存当前工作流（updatedAt 刷新 + 落盘 + 手动版本） */
  function save(createSnapshot = true) {
    const rec = active.value;
    if (!rec) return false;
    // 手动保存生成版本摘要（结构变化时才生成，避免无限历史）
    if (createSnapshot && structureChanged()) {
      createVersion();
    }
    rec.updatedAt = Date.now();
    const ok = persist();
    dirty.value = false;
    return ok;
  }

  /** 恢复快照到当前工作流（合并默认字段，兼容旧数据） */
  function restore(snapshot: {
    name?: string;
    seq?: number;
    nodes?: WorkflowNodeModel[];
    edges?: WorkflowEdgeModel[];
  }) {
    const rec = ensureActive();
    pushUndo();
    rec.name = snapshot.name || '未命名工作流';
    rec.seq = snapshot.seq && snapshot.seq > 0 ? snapshot.seq : 1;
    rec.nodes = (snapshot.nodes ?? []).map((n) => {
      const def = getNodeDef(n.data?.kind ?? 'ai');
      return {
        ...n,
        type: 'custom',
        position: n.position ?? { ...START },
        data: { ...def.defaults, ...(n.data ?? {}), status: 'idle' as const },
      };
    });
    rec.edges = (snapshot.edges ?? []).filter(
      (e) =>
        e.source &&
        e.target &&
        rec.nodes.some((n) => n.id === e.source) &&
        rec.nodes.some((n) => n.id === e.target),
    );
    selectNode(null);
    layoutBump.value++;
  }

  /** 启动加载：v3 → v2 → legacy 幂等迁移 */
  function load(): LoadResult {
    const result = loadAllWorkflows();
    records.value = result.records;
    migrationWarnings.value = result.warnings;
    ensureTemplates();
    loadRunHistoryLocal();
    if (records.value.length > 0) {
      activeId.value = records.value[0]!.id;
      selectNode(null);
      layoutBump.value++;
    }
    // 迁移后立即落盘为 v3 格式
    if (result.records.length > 0) persist();
    return result;
  }

  function clear() {
    const rec = active.value;
    if (!rec) return;
    pushUndo();
    rec.nodes = [];
    rec.edges = [];
    rec.seq = 1;
    selectNode(null);
    layoutBump.value++;
  }

  /* ---------- 示例工作流 ---------- */

  function loadDemo() {
    const mk = (
      id: string,
      kind: WorkflowNodeKind,
      x: number,
      y: number,
      overrides: Partial<WorkflowNodeData> = {},
    ): WorkflowNodeModel => {
      const def = getNodeDef(kind);
      return {
        id,
        type: 'custom',
        position: { x, y },
        data: { kind, label: def.label, status: 'idle', ...def.defaults, ...overrides },
      };
    };

    restore({
      name: '每日代码审查流水线',
      seq: 10,
      nodes: [
        mk('n-1', 'trigger', 0, 140, { cron: '0 9 * * *', label: '工作日 09:00' }),
        mk('n-2', 'prompt', 300, 140, {
          template: '你是资深代码审查员。请审查今日新增 commit 的 diff，输出风险清单。',
          label: '审查提示词',
        }),
        mk('n-3', 'ai', 620, 140, {
          model: 'deepseek-v3',
          prompt: '{{ template }}',
          label: 'AI 代码审查',
        }),
        mk('n-4', 'condition', 940, 140, { expr: 'risks > 0', label: '存在高危风险？' }),
        mk('n-5', 'notify', 1270, 40, {
          channel: '钉钉',
          title: '代码审查告警',
          level: 'warn',
          message: '发现 {{ risks }} 个高危风险，请立即处理',
          label: '告警通知',
        }),
        mk('n-6', 'delay', 1270, 260, { seconds: 30, label: '等待 30s' }),
        mk('n-7', 'output', 1600, 260, {
          format: 'markdown',
          outputName: '审查报告',
          label: '审查报告输出',
        }),
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
        { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
        { id: 'e-3', source: 'n-3', target: 'n-4', type: 'smoothstep' },
        { id: 'e-4', source: 'n-4', sourceHandle: 'true', target: 'n-5', type: 'smoothstep' },
        { id: 'e-5', source: 'n-4', sourceHandle: 'false', target: 'n-6', type: 'smoothstep' },
        { id: 'e-6', source: 'n-6', target: 'n-7', type: 'smoothstep' },
      ],
    });
  }

  /* ---------- 导入 / 导出 ---------- */

  /** 校验导入快照结构是否合法（兼容旧 API，仅布尔） */
  function validateSnapshot(snapshot: unknown): boolean {
    const result = parseWorkflowJson(JSON.stringify(snapshot));
    return result.ok;
  }

  /** 解析导入 JSON：返回预览（不写入），供导入确认弹窗使用 */
  function inspectJson(text: string): ImportPreview | null {
    const result = parseWorkflowJson(text);
    return result.preview;
  }

  /** 导出当前工作流 JSON（剥离运行时状态 + 脱敏） */
  function exportJson(): string {
    const rec = ensureActive();
    return JSON.stringify(serialize(rec), null, 2);
  }

  /** 导入 JSON：严格校验后创建新工作流并切换（返回错误消息数组，空 = 成功） */
  function importJson(text: string): boolean {
    const result = parseWorkflowJson(text);
    if (!result.ok || !result.snapshot) return false;
    const { snapshot } = result;
    pushUndo();
    const id = createWorkflow(snapshot.name);
    const rec = records.value.find((r) => r.id === id);
    if (!rec) return false;
    rec.seq = snapshot.seq;
    rec.nodes = snapshot.nodes.map((n) => {
      const def = getNodeDef(n.data.kind);
      return {
        ...n,
        type: 'custom',
        data: { ...def.defaults, ...n.data, status: 'idle' as const },
      };
    });
    rec.edges = snapshot.edges;
    selectNode(null);
    layoutBump.value++;
    save(false);
    return true;
  }

  /* ---------- 模拟运行（runner 驱动） ---------- */

  function resetStatus() {
    if (!active.value) return;
    active.value.nodes = active.value.nodes.map((n) => ({
      ...n,
      data: { ...nodeData(n), status: 'idle' as const },
    }));
    for (const e of active.value.edges) delete e.class;
  }

  function log(line: string) {
    runLogs.value.push(line);
  }

  /** 结束一次运行：写回 lastRun 并立即持久化 */
  function finishRun(status: WorkflowLastRun['status'], durationMs: number) {
    const rec = active.value;
    if (!rec) return;
    rec.lastRun = {
      status,
      at: Date.now(),
      durationMs,
      logs: [...runLogs.value],
    };
    rec.updatedAt = Date.now();
    persist();
    dirty.value = false;
  }

  const runnerHooks: RunnerHooks = {
    onLog: (entry) => {
      runEntries.value.push(entry);
      log(
        `${entry.level === 'run' ? 'RUN' : entry.level === 'success' ? 'OK' : entry.level === 'error' ? 'ERROR' : entry.level === 'warn' ? 'WARN' : 'INFO'} ${entry.text}`,
      );
    },
    onProgress: ({ nodeId, status }) => {
      if (!active.value) return;
      runningNodeId.value = status === 'running' ? nodeId : runningNodeId.value;
      active.value.nodes = active.value.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...nodeData(n), status } } : n,
      );
    },
    onEdgeActive: (sourceId, activeFlag) => {
      if (!active.value) return;
      for (const e of active.value.edges) {
        if (e.source === sourceId) {
          if (activeFlag) e.class = 'wf-edge-active';
          else delete e.class;
        }
      }
    },
    onBreakpoint: (nodeId) => {
      paused.value = true;
      runningNodeId.value = nodeId;
    },
    onPause: () => {
      paused.value = true;
    },
    onApprovalWait: () => {
      paused.value = true;
      approvalPending.value = true;
    },
  };

  async function runWorkflowFn(mode: RunMode = runMode.value, targetId?: string) {
    const rec = active.value;
    if (running.value || !rec || rec.nodes.length === 0) return;
    if (mode !== 'full') {
      const target = targetId ?? selectedId.value;
      if (!target) {
        runLogs.value = ['ERROR 请先选中一个节点'];
        runEntries.value = [{ id: 0, level: 'error', text: '请先选中一个节点', nodeId: undefined }];
        return;
      }
    }

    runLogs.value = [];
    runEntries.value = [];
    const started = Date.now();

    // 结构校验：失败则不运行，只输出错误日志
    const v = validate();
    if (!v.ok && mode === 'full') {
      for (const err of v.errors)
        runEntries.value.push({ id: runEntries.value.length, level: 'error', text: err });
      for (const warn of v.warnings)
        runEntries.value.push({ id: runEntries.value.length, level: 'warn', text: warn });
      runLogs.value = runEntries.value.map(
        (e) => `${e.level === 'error' ? 'ERROR' : 'WARN'} ${e.text}`,
      );
      finishRun('failed', 0);
      return;
    }
    if (mode === 'full') {
      for (const warn of v.warnings)
        runEntries.value.push({ id: runEntries.value.length, level: 'warn', text: warn });
    }

    running.value = true;
    paused.value = false;
    dirty.value = false;
    runningNodeId.value = null;
    approvalPending.value = false;
    resetStatus();
    // 重置控制句柄（保留同一实例，避免 UI 引用失效）
    control.cancelled = false;
    control.paused = false;
    control.stepOnce = false;
    control.approval = null;
    control.breakpoints = new Set(breakpoints.value);

    const snapshot: RunSnapshot = {
      nodes: nodes.value.map((n) => ({ ...n, data: { ...nodeData(n) } })),
      edges: edges.value.map((e) => ({ ...e })),
    };
    const recSnapshot = rec;

    const result = await runWorkflow({
      snapshot,
      mode,
      targetId: mode === 'full' ? undefined : (targetId ?? selectedId.value ?? undefined),
      params: runParams.value,
      control,
      hooks: runnerHooks,
      runConfig: rec.runConfig,
      inputDefs: rec.inputs,
      outputDefs: rec.outputs,
      subflowExecutor: async (node, inputValues) => {
        // 递归执行被调用工作流（本地 mock，禁止真实后端）
        return executeSubflow(node, inputValues);
      },
    });

    running.value = false;
    runningNodeId.value = null;
    paused.value = false;
    approvalPending.value = false;
    // 保留本次输出供变量浏览器 / 节点输出预览（previous 取最后执行节点）
    runOutputs.value = { ...result.outputs };
    const outKeys = Object.keys(result.outputs);
    if (outKeys.length > 0) {
      runOutputs.value.previous = result.outputs[outKeys[outKeys.length - 1]!];
    }
    // 工作流输出契约汇总
    runOutputs.value.__workflowOutputs = summarizeWorkflowOutputs(result.outputs);
    finishRun(result.status === 'success' ? 'success' : 'failed', Date.now() - started);
    // 写入运行历史（不阻塞主流程）
    appendHistory(recSnapshot, result, mode, started);
  }

  /** 兼容旧 API：完整运行 */
  function simulateRun() {
    return runWorkflowFn('full');
  }

  function runSelected() {
    return runWorkflowFn('single');
  }

  function runFromSelected() {
    return runWorkflowFn('from');
  }

  function pauseRun() {
    control.paused = true;
    paused.value = true;
  }

  function resumeRun() {
    control.resume();
    paused.value = false;
  }

  /** 人工确认：通过（继续执行） */
  function approveRun() {
    control.approval = 'approved';
    approvalPending.value = false;
    resumeRun();
  }

  /** 人工确认：拒绝（继续执行，节点输出 approved=false） */
  function rejectRun() {
    control.approval = 'rejected';
    approvalPending.value = false;
    resumeRun();
  }

  function cancelRun() {
    control.cancel();
    paused.value = false;
    approvalPending.value = false;
  }

  /** 从最近失败节点重新运行（失败节点重试） */
  function retryFailed(): boolean {
    const failed = nodes.value.find((n) => n.data.status === 'error');
    if (!failed || !active.value) return false;
    selectNode(failed.id);
    void runWorkflowFn('from', failed.id);
    return true;
  }

  /* ================= v4 输入输出契约与运行配置 ================= */

  /** 输入定义（computed 读写） */
  const inputDefs = computed<WorkflowInputDef[]>(() => active.value?.inputs ?? []);
  const outputDefs = computed<WorkflowOutputDef[]>(() => active.value?.outputs ?? []);
  const runConfig = computed<WorkflowRunConfig | null>(() => active.value?.runConfig ?? null);

  function setInputDefs(defs: WorkflowInputDef[]) {
    const rec = active.value;
    if (!rec) return;
    const issues = validateInputDefs(defs);
    if (issues.length > 0) return;
    pushUndo();
    rec.inputs = defs.map((d) => ({ ...d }));
    rec.updatedAt = Date.now();
  }

  function setOutputDefs(defs: WorkflowOutputDef[]) {
    const rec = active.value;
    if (!rec) return;
    const issues = validateOutputDefs(
      defs,
      rec.nodes.map((n) => n.id),
    );
    if (issues.length > 0) return;
    pushUndo();
    rec.outputs = defs.map((d) => ({ ...d }));
    rec.updatedAt = Date.now();
  }

  function updateRunConfig(patch: Partial<WorkflowRunConfig>) {
    const rec = active.value;
    if (!rec) return;
    pushUndo();
    rec.runConfig = { ...(rec.runConfig ?? defaultRunConfig()), ...patch };
    rec.updatedAt = Date.now();
  }

  /** 运行输入校验（字段级错误，供输入编辑器展示） */
  function validateRunInputs(userInput: Record<string, unknown>): Record<string, string> {
    return buildRunInput(inputDefs.value, userInput).errors;
  }

  /** 运行输入标准化（默认值合并 + 校验） */
  function buildInputs(userInput: Record<string, unknown>): Record<string, unknown> {
    return buildRunInput(inputDefs.value, userInput).variables;
  }

  /** 上次运行输入（供「从上次运行复用输入」） */
  const lastRunInput = computed<Record<string, unknown>>(() => {
    const latest = runHistory.value.find((r) => r.workflowId === activeId.value);
    return latest?.inputSummary ?? {};
  });

  /** 恢复默认输入（各定义的 defaultValue） */
  function defaultInputs(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const def of inputDefs.value) {
      if (def.defaultValue !== undefined) out[def.name] = def.defaultValue;
    }
    return out;
  }

  /** 工作流输出汇总（按输出契约提取，脱敏） */
  function summarizeWorkflowOutputs(nodeOutputs: Record<string, unknown>): Record<string, unknown> {
    const defs = active.value?.outputs ?? [];
    const { outputs } = summarizeOutputs(defs, nodeOutputs);
    const cleaned: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(outputs)) {
      cleaned[k] = summarizeValue(v);
    }
    return cleaned;
  }

  /* ================= 子流程执行（本地递归 mock） ================= */

  async function executeSubflow(
    node: WorkflowNodeModel,
    inputValues: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    outputs: Record<string, unknown>;
    error?: string;
    suggestion?: string;
  }> {
    const refId = node.data.workflowRef;
    const target = records.value.find((r) => r.id === refId);
    if (!refId || !target) {
      return {
        ok: false,
        outputs: {},
        error: `被调用工作流不存在（id: ${refId ?? '未选择'}）`,
        suggestion: '在检查器中重新选择被调用工作流',
      };
    }
    // 禁止循环引用（防御）
    const allRefs = new Map<string, string[]>();
    for (const r of records.value) {
      const refs = r.nodes
        .filter((n) => n.data.kind === 'subworkflow' && n.data.workflowRef)
        .map((n) => n.data.workflowRef!);
      allRefs.set(r.id, refs);
    }
    const cycle = detectWorkflowCycle(activeId.value ?? '', allRefs);
    if (cycle) {
      return {
        ok: false,
        outputs: {},
        error: `检测到子流程循环引用：${cycle.join(' → ')}`,
        suggestion: '断开循环引用后再运行',
      };
    }
    // 递归执行目标工作流（输入：映射后的端口值；输出：端口名 → 值）
    const subControl = createRunControl();
    const subResult = await runWorkflow({
      snapshot: {
        nodes: target.nodes.map((n) => ({ ...n, data: { ...nodeData(n) } })),
        edges: target.edges.map((e) => ({ ...e })),
      },
      mode: 'full',
      params: { variables: inputValues, context: {} },
      control: subControl,
      hooks: { sleep: () => Promise.resolve() },
      runConfig: { ...(target.runConfig ?? defaultRunConfig()), failStrategy: 'stop' },
      inputDefs: target.inputs,
      outputDefs: target.outputs,
    });
    if (subResult.status !== 'success') {
      return {
        ok: false,
        outputs: {},
        error: subResult.error ?? '子流程执行失败',
        suggestion: subResult.suggestion,
      };
    }
    // 按子流程输出契约汇总
    const { outputs } = summarizeOutputs(target.outputs ?? [], subResult.outputs);
    return { ok: true, outputs };
  }

  /* ================= 运行历史 ================= */

  function loadRunHistoryLocal() {
    const { records: recs, warnings } = loadHistoryStorage();
    runHistory.value = recs;
    runHistoryWarnings.value = warnings;
  }

  function persistRunHistory(): boolean {
    const ok = saveRunHistory(runHistory.value);
    if (!ok) {
      runHistoryWarnings.value = ['运行历史写入失败（存储空间不足？），本次记录仅保留在内存'];
    }
    return ok;
  }

  function appendHistory(
    rec: StoredWorkflow,
    result: RunResultLike,
    mode: RunMode,
    startedAt: number,
  ) {
    const nodeResults: RunNodeResult[] = rec.nodes.map((n) => {
      const out = result.outputs[n.id];
      const status =
        n.id === result.failedNodeId ? 'error' : out !== undefined ? 'success' : 'idle';
      return {
        nodeId: n.id,
        label: n.data.label || n.id,
        kind: n.data.kind,
        status,
        output: out !== undefined ? summarizeValue(out) : undefined,
        error: n.id === result.failedNodeId ? result.error : undefined,
      };
    });
    const entry = createRunRecord({
      workflowId: rec.id,
      workflowName: rec.name,
      workflowVersion: snapshotSignature(rec.nodes, rec.edges).slice(0, 12),
      mode,
      status: (result.status === 'cancelled' ? 'cancelled' : result.status) as RunHistoryStatus,
      startedAt,
      finishedAt: Date.now(),
      durationMs: result.durationMs,
      inputSummary: summarizeValue(runParams.value.variables ?? {}) as Record<string, unknown>,
      outputSummary: summarizeWorkflowOutputs(result.outputs),
      nodeResults,
      logs: result.logs.map((l, i) => ({
        id: (l as RunLogEntry).id ?? i,
        level: l.level as RunLogEntry['level'],
        text: l.text,
        nodeId: l.nodeId,
        ts: l.ts,
      })),
      failedNodeId: result.failedNodeId,
      error: result.error,
    });
    runHistory.value = appendRunRecord(runHistory.value, entry);
    persistRunHistory();
  }

  function deleteRunEntry(id: string) {
    runHistory.value = removeRunRecord(runHistory.value, id);
    persistRunHistory();
  }

  function pinRunEntry(id: string, pinned: boolean) {
    runHistory.value = runHistory.value.map((r) => (r.id === id ? { ...r, pinned } : r));
    persistRunHistory();
  }

  function clearAllRuns(keepPinned: boolean) {
    runHistory.value = clearRunHistory(runHistory.value, keepPinned);
    persistRunHistory();
  }

  function exportRunEntryJson(id: string): string {
    const entry = runHistory.value.find((r) => r.id === id);
    return entry ? exportRunRecord(entry) : '{}';
  }

  function filterRuns(filter: RunHistoryFilter): RunHistoryEntry[] {
    return filterRunHistory(runHistory.value, filter);
  }

  function compareRunEntries(aId: string, bId: string) {
    const a = runHistory.value.find((r) => r.id === aId);
    const b = runHistory.value.find((r) => r.id === bId);
    if (!a || !b) return null;
    return compareRuns(a, b);
  }

  /* ================= 回放 ================= */

  /** 进入只读回放态：按历史节点状态着色，禁止编辑 */
  function startReplay(runId: string) {
    const entry = runHistory.value.find((r) => r.id === runId);
    if (!entry || !active.value) return false;
    const map = new Map<string, NodeStatus>();
    for (const nr of entry.nodeResults) {
      map.set(nr.nodeId, nr.status);
    }
    replayState.value = map;
    replayRunId.value = runId;
    // 画布节点着色（不改动工作流数据）
    active.value.nodes = active.value.nodes.map((n) => ({
      ...n,
      data: { ...nodeData(n), status: map.get(n.id) ?? 'idle' },
    }));
    layoutBump.value++;
    return true;
  }

  /** 退出回放：恢复当前编辑状态 */
  function exitReplay() {
    if (!replayState.value) return;
    replayState.value = null;
    replayRunId.value = null;
    if (active.value) {
      active.value.nodes = active.value.nodes.map((n) => ({
        ...n,
        data: { ...nodeData(n), status: 'idle' as const },
      }));
    }
    layoutBump.value++;
  }

  /** 从历史输入重新运行（新运行，不覆盖历史） */
  async function rerunFromHistory(runId: string) {
    const entry = runHistory.value.find((r) => r.id === runId);
    if (!entry || entry.workflowId !== activeId.value) return false;
    runParams.value = {
      initialText: runParams.value.initialText,
      variables: { ...entry.inputSummary },
      context: {},
    };
    exitReplay();
    await runWorkflowFn('full');
    return true;
  }

  const isReplaying = computed(() => replayState.value !== null);

  /* ================= 模块化子图 ================= */

  const modules = computed<WorkflowModule[]>(() => active.value?.modules ?? []);

  function persistModules() {
    persist();
  }

  /** 保存选中节点为模块 */
  function saveSelectionAsModule(name: string, description = ''): WorkflowModule | null {
    const rec = active.value;
    const sel = nodes.value.filter((n) => n.selected);
    if (!rec || sel.length === 0) return null;
    const { module, warnings } = buildModule(sel, rec.edges, name, description);
    if (warnings.length > 0) void warnings;
    pushUndo();
    rec.modules = [...(rec.modules ?? []), module];
    rec.updatedAt = Date.now();
    persistModules();
    return module;
  }

  /** 插入模块实例（生成全新 ID，内部边重映射） */
  function insertModule(moduleId: string, position?: XYPosition): boolean {
    const rec = active.value;
    const module = rec?.modules?.find((m) => m.id === moduleId);
    if (!rec || !module || module.nodes.length === 0) return false;
    pushUndo();
    const instance = instantiateModule(module);
    const offset = position ?? { x: 60, y: 60 };
    // 以模块第一个节点为锚点平移到插入位置
    const anchor = instance.nodes[0]?.position ?? { x: 0, y: 0 };
    const dx = offset.x - anchor.x;
    const dy = offset.y - anchor.y;
    const placed = instance.nodes.map((n) => ({
      ...n,
      position: { x: n.position.x + dx, y: n.position.y + dy },
    }));
    const maxSeq = Math.max(rec.seq, ...placed.map((n) => Number(n.id.replace(/\D/g, '')) || 0));
    rec.seq = maxSeq + 1;
    rec.nodes = [...rec.nodes, ...placed];
    rec.edges = [...rec.edges, ...instance.edges];
    rec.updatedAt = Date.now();
    selectMany(placed.map((n) => n.id));
    layoutBump.value++;
    return true;
  }

  /** 更新模块定义：同步画布实例或仅创建新版本 */
  function updateModuleDefinition(
    moduleId: string,
    name: string,
    description: string,
    syncExisting: boolean,
  ): boolean {
    const rec = active.value;
    const module = rec?.modules?.find((m) => m.id === moduleId);
    if (!rec || !module) return false;
    pushUndo();
    const updated = {
      ...module,
      name,
      description,
      version: module.version + 1,
      updatedAt: Date.now(),
    };
    rec.modules = (rec.modules ?? []).map((m) => (m.id === moduleId ? updated : m));
    if (syncExisting) {
      // 同步实例：按实例节点 id 前缀查找（模块实例节点 id 以 m- 开头无法区分，
      // 通过保存时的实例根映射实现——这里退化为重建全部实例代价高，
      // 因此仅在模块可被唯一识别时替换：记录实例锚点由 UI 层负责，
      // store 层提供 replaceModuleInstances 供精确同步。
      void replaceModuleInstances;
    }
    rec.updatedAt = Date.now();
    persistModules();
    return true;
  }

  /** 删除模块定义（画布中的实例保留，仅移除定义） */
  function removeModule(moduleId: string) {
    const rec = active.value;
    if (!rec) return;
    pushUndo();
    rec.modules = (rec.modules ?? []).filter((m) => m.id !== moduleId);
    rec.updatedAt = Date.now();
    persistModules();
  }

  // 模块实例同步占位（由 UI 传入旧实例节点 id 列表时替换）
  function replaceModuleInstances(
    moduleId: string,
    instanceNodeIds: string[],
    latest: WorkflowModule,
  ): boolean {
    const rec = active.value;
    if (!rec || instanceNodeIds.length === 0) return false;
    pushUndo();
    const idSet = new Set(instanceNodeIds);
    const keptNodes = rec.nodes.filter((n) => !idSet.has(n.id));
    const keptEdges = rec.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target));
    const inst = instantiateModule(latest);
    rec.nodes = [...keptNodes, ...inst.nodes];
    rec.edges = [...keptEdges, ...inst.edges];
    rec.seq = Math.max(rec.seq, ...inst.nodes.map((n) => Number(n.id.replace(/\D/g, '')) || 0)) + 1;
    rec.updatedAt = Date.now();
    selectMany(inst.nodes.map((n) => n.id));
    layoutBump.value++;
    return true;
  }

  /* ================= 健康诊断与性能预估 ================= */

  function runDiagnostics(): DiagnosticIssue[] {
    const rec = active.value;
    if (!rec) return [];
    diagnostics.value = diagnoseWorkflow(
      rec.nodes,
      rec.edges,
      rec.inputs ?? [],
      rec.outputs ?? [],
      rec.runConfig ?? undefined,
    );
    // 追加子流程引用问题
    const subIssues = checkSubflowIssues();
    for (const s of subIssues) {
      diagnostics.value.push({
        id: `d-sub-${diagnostics.value.length + 1}`,
        severity: s.level,
        category: 'structure',
        nodeId: s.nodeId,
        title: s.level === 'error' ? '子流程引用错误' : '子流程引用警告',
        detail: s.message,
      });
    }
    return diagnostics.value;
  }

  const diagnosticsCount = computed(() => ({
    error: diagnostics.value.filter((d) => d.severity === 'error').length,
    warning: diagnostics.value.filter((d) => d.severity === 'warning').length,
    info: diagnostics.value.filter((d) => d.severity === 'info').length,
  }));

  function estimateRunPerformance() {
    const rec = active.value;
    if (!rec) return null;
    return estimatePerformance(rec.nodes, rec.edges);
  }

  /** 类型兼容性检查（含 merge/switch/subworkflow 重点覆盖） */
  function runTypeCheck() {
    const rec = active.value;
    if (!rec) return [];
    return checkTypeCompatibility(rec.nodes, rec.edges);
  }

  /* ================= 子流程引用诊断 ================= */

  const workflowStubs = computed<WorkflowStub[]>(() =>
    records.value.map((r) => ({
      id: r.id,
      name: r.name,
      archived: r.isTemplate === true,
      inputPorts: Object.fromEntries((r.inputs ?? []).map((i) => [i.name, i.required])),
      outputPorts: (r.outputs ?? []).map((o) => o.name),
    })),
  );

  /** 当前工作流内子流程引用校验（自引用 / 缺失 / 映射） */
  function checkSubflowIssues(): SubflowIssue[] {
    const rec = active.value;
    if (!rec) return [];
    return validateSubflowRefs(rec.nodes, workflowStubs.value, rec.id);
  }

  /** 全工作流级循环引用检测 */
  function checkWorkflowCycles(): string[] | null {
    const rec = active.value;
    if (!rec) return null;
    const allRefs = new Map<string, string[]>();
    for (const r of records.value) {
      allRefs.set(
        r.id,
        r.nodes
          .filter((n) => n.data.kind === 'subworkflow' && n.data.workflowRef)
          .map((n) => n.data.workflowRef!),
      );
    }
    return detectWorkflowCycle(rec.id, allRefs);
  }

  /** 校验子流程引用 + 循环（编辑期调用，供 UI 展示） */
  function validateSubflows(): { issues: SubflowIssue[]; cycle: string[] | null } {
    return { issues: checkSubflowIssues(), cycle: checkWorkflowCycles() };
  }

  /* ================= 输入/输出映射 UI 辅助 ================= */

  /** 更新选中节点的子流程映射（inputMap/outputMap） */
  function updateSubflowMap(
    nodeId: string,
    field: 'inputMap' | 'outputMap',
    map: Record<string, string>,
  ) {
    updateNodeData(nodeId, { [field]: { ...map } } as Partial<WorkflowNodeData>);
  }

  /* ---------- 运行结果导出 ---------- */

  /** 运行结果 JSON（仅输出摘要与日志，不含敏感数据） */
  function exportRunResult(): string {
    const entries = runEntries.value;
    const outputs: Record<string, unknown> = {};
    for (const n of nodes.value) {
      const out = (entries.find((e) => e.nodeId === n.id && e.level === 'success')?.text ??
        '') as string;
      if (out) outputs[n.id] = out;
    }
    return JSON.stringify(
      {
        workflow: name.value,
        status: activeLastRun.value?.status ?? 'unknown',
        durationMs: activeLastRun.value?.durationMs ?? 0,
        outputs,
        logs: entries.map((e) => ({
          level: e.level,
          text: e.text,
          nodeId: e.nodeId,
          ts: e.ts ?? null,
        })),
      },
      null,
      2,
    );
  }

  /** 复制运行结果到剪贴板 */
  async function copyRunResult(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(exportRunResult());
      return true;
    } catch {
      return false;
    }
  }

  /* ---------- AI 生成预览（草稿不直接写正式 store，应用需用户确认） ---------- */

  const aiPhase = ref<AiPhase>('idle');
  const aiBusy = ref(false);
  const aiError = ref<string | null>(null);
  const aiPreview = ref<AiPreviewState | null>(null);
  /** service 注入边界：默认 mock，未来替换为真实 LLM 实现 */
  const aiService = ref<AiGenerateService>(mockAiGenerateService);
  /** 上次生成的需求文本（重新生成 / 预览层复用） */
  const lastAiPrompt = ref('');
  /** 竞态令牌：最后一次生成优先，取消/重新生成使旧任务失效 */
  let generationToken = 0;

  function setAiService(service: AiGenerateService) {
    aiService.value = service;
  }

  function clearAiPreview() {
    generationToken++;
    aiPreview.value = null;
    aiPhase.value = 'idle';
    aiBusy.value = false;
    aiError.value = null;
  }

  function aiStep(ms: number, token: number): Promise<boolean> {
    return new Promise((resolve) => {
      setTimeout(() => resolve(token === generationToken), ms);
    });
  }

  /** 构建预览：稳定 id 映射 + 自动连线 + 待确认端口 */
  function buildAiPreview(response: WorkflowAiResponse, scope: AiGenMode): AiPreviewState {
    const existingIds = new Set(nodes.value.map((n) => n.id));
    const existingPos = new Map(nodes.value.map((n) => [n.id, n.position]));
    const baseX =
      nodes.value.length === 0 ? START.x : Math.max(...nodes.value.map((n) => n.position.x)) + 280;

    // 稳定 id：draftId 与现有节点不冲突则沿用，否则分配 n-<seq> 递增
    let seqCursor = seq.value;
    const nodeMap: AiNodePlan[] = [];
    let row = 0;
    for (const d of response.nodes) {
      const draftId = d.id!;
      const isNew = !existingIds.has(draftId);
      const stableId = isNew ? nextNodeId(seqCursor++) : draftId;
      const position = existingPos.get(stableId) ?? {
        x: baseX,
        y: 60 + (row++ % 5) * 130,
      };
      nodeMap.push({
        draftId,
        stableId,
        kind: d.kind,
        label: d.label ?? d.kind,
        data: (d.data ?? {
          kind: d.kind,
          label: d.label ?? d.kind,
          status: 'idle',
        }) as WorkflowNodeData,
        position,
        isNew,
      });
    }

    // 草稿边映射到 stableId
    const draftEdges: WorkflowEdgeModel[] = [];
    response.edges.forEach((e, i) => {
      const s = nodeMap.find((n) => n.draftId === e.source);
      const t = nodeMap.find((n) => n.draftId === e.target);
      if (!s || !t) return;
      draftEdges.push({
        id: `ae-${i}`,
        source: s.stableId,
        sourceHandle: e.sourceHandle ?? undefined,
        target: t.stableId,
        targetHandle: e.targetHandle ?? undefined,
        type: 'smoothstep',
      });
    });

    // 自动连线：仅对新增节点做链式连接（已有节点保留用户原有边）
    const autoInput = nodeMap.map((n) => ({
      id: n.stableId,
      position: n.position,
      data: { ...n.data, kind: n.kind, label: n.label, status: 'idle' as const },
    }));
    const existingEdgeModels: WorkflowEdgeModel[] = edges.value.map((e) => ({ ...e }));
    const auto = autoConnect(autoInput, [...existingEdgeModels, ...draftEdges]);

    const pendingChoices: Record<number, boolean> = {};
    auto.pending.forEach((_, i) => {
      pendingChoices[i] = false;
    });

    // 合并警告：AI 自身警告 + 自动连线警告 + 待确认/未连接端口提示
    const warnings = [...response.warnings, ...auto.warnings];
    if (auto.pending.length > 0) {
      warnings.push(`有 ${auto.pending.length} 处端口需要确认（多候选目标）`);
    }
    const noPorts = nodeMap
      .filter((n) => n.isNew && n.kind === 'ai')
      .filter(
        (n) =>
          !auto.explanations.some((ex) => ex.startsWith(n.stableId)) &&
          !draftEdges.some((e) => e.target === n.stableId || e.source === n.stableId),
      );
    if (noPorts.length > 0) {
      warnings.push(`节点 ${noPorts.map((n) => n.stableId).join('、')} 需要补充输入参数或连线`);
    }

    return {
      response,
      scope,
      nodes: nodeMap,
      draftEdges,
      auto,
      pendingChoices,
      warnings,
      createdAt: Date.now(),
    };
  }

  /** 生成 AI 草稿：解析 -> 校验 -> 预览（不写正式数据）。竞态：最后一次生成优先 */
  async function generateAiWorkflow(prompt: string, scope: AiGenMode = 'new') {
    if (running.value) {
      aiError.value = '模拟运行期间不能生成工作流';
      return;
    }
    if (!prompt.trim()) {
      aiError.value = '请输入工作流需求描述';
      return;
    }
    const token = ++generationToken;
    aiBusy.value = true;
    aiError.value = null;
    aiPhase.value = 'analyzing';
    lastAiPrompt.value = prompt;

    const phases: AiPhase[] = ['scanning', 'nodes', 'edges', 'validating'];
    for (const p of phases) {
      const ok = await aiStep(360, token);
      if (!ok) return;
      aiPhase.value = p;
    }

    try {
      const raw = await aiService.value.generate(prompt, scope);
      if (token !== generationToken) return;
      // 统一走 parse 校验路径（即使 mock 也过白名单/参数/变量/敏感字段检查）
      const parsed = parseAiResponse(JSON.stringify(raw));
      if (!parsed.ok || !parsed.response) {
        aiError.value = `AI 结果校验失败：${parsed.errors.slice(0, 3).join('；')}`;
        aiPhase.value = 'error';
        return;
      }
      aiPreview.value = buildAiPreview(parsed.response, scope);
      aiPhase.value = 'ready';
    } catch (e) {
      if (token !== generationToken) return;
      aiError.value = `AI 生成失败：${e instanceof Error ? e.message : '未知错误'}`;
      aiPhase.value = 'error';
    } finally {
      if (token === generationToken) aiBusy.value = false;
    }
  }

  /** 待确认端口勾选切换 */
  function togglePendingChoice(index: number) {
    if (!aiPreview.value) return;
    const next = { ...aiPreview.value.pendingChoices };
    next[index] = !next[index];
    aiPreview.value = { ...aiPreview.value, pendingChoices: next };
  }

  /** 预览中所有边（草稿边 + 自动边 + 勾选的待确认边） */
  function previewEdges(): WorkflowEdgeModel[] {
    const p = aiPreview.value;
    if (!p) return [];
    const chosen: WorkflowEdgeModel[] = [];
    p.auto.pending.forEach((pc, i) => {
      if (!p.pendingChoices[i]) return;
      for (const t of pc.targets) {
        chosen.push({
          id: `pe-${pc.sourceId}-${pc.sourceHandle}-${t.nodeId}`,
          source: pc.sourceId,
          sourceHandle: pc.sourceHandle,
          target: t.nodeId,
          targetHandle: t.handle,
          type: 'smoothstep',
        });
      }
    });
    return [...p.draftEdges, ...p.auto.edges, ...chosen];
  }

  /**
   * 一次性应用 AI 草稿（事务）：
   * - 单次撤销记录（pushUndo 一次）
   * - 应用前创建「AI 生成」版本快照
   * - 失败整体回滚；成功只触发一次持久化
   */
  function applyAiDraft(applyScope: 'all' | 'nodes' | 'edges'): boolean {
    const p = aiPreview.value;
    const rec = active.value;
    if (!p || !rec || running.value || aiBusy.value) return false;

    // 事务备份（含 versions 等全部字段）
    const backup = JSON.parse(JSON.stringify(records.value)) as StoredWorkflow[];

    try {
      // 先记录撤销点（应用前状态），再创建版本快照（记录 AI 生成产物）
      pushUndo();
      const addedCount = p.nodes.filter((n) => n.isNew).length;
      const edgeCount = previewEdges().length;
      createVersion(
        `AI 生成「${p.response.title ?? '未命名'}」：新增 ${addedCount} 节点 / ${edgeCount} 连线 / ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}`,
      );

      // 节点：nodes/all 模式添加（added 追加；extend 同 id 覆盖）
      if (applyScope !== 'edges') {
        for (const plan of p.nodes) {
          const existing = rec.nodes.find((n) => n.id === plan.stableId);
          if (existing) {
            existing.data = { ...plan.data, status: 'idle' as const };
          } else {
            rec.nodes.push({
              id: plan.stableId,
              type: 'custom',
              position: plan.position,
              data: { ...plan.data, status: 'idle' as const },
            });
          }
        }
        rec.seq =
          Math.max(rec.seq, ...p.nodes.map((n) => Number(n.stableId.replace(/\D/g, '')) || 0)) + 1;
      }

      // 边：edges/all 模式添加（端点必须已存在，防孤立边）
      if (applyScope !== 'nodes') {
        const existingEdgeKeys = new Set(
          rec.edges.map((e) => `${e.source}:${e.sourceHandle ?? ''}:${e.target}`),
        );
        const nodeIds = new Set(rec.nodes.map((n) => n.id));
        let addedEdges = 0;
        for (const e of previewEdges()) {
          if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) continue;
          const key = `${e.source}:${e.sourceHandle ?? ''}:${e.target}`;
          if (existingEdgeKeys.has(key)) continue;
          existingEdgeKeys.add(key);
          rec.edges.push(e);
          addedEdges++;
        }
        if (addedEdges === 0 && previewEdges().length > 0) {
          throw new Error('没有可添加的连线（端点节点可能尚未应用，请选择「应用全部」）');
        }
      }

      rec.updatedAt = Date.now();
      layoutBump.value++;
      selectNode(null);
      persist(); // 事务成功只持久化一次（save 会再建版本，这里直接 persist）
      clearAiPreview();
      return true;
    } catch (e) {
      // 失败整体回滚
      records.value = backup;
      selectNode(null);
      layoutBump.value++;
      aiError.value = `应用失败已回滚：${e instanceof Error ? e.message : '未知错误'}`;
      return false;
    }
  }

  /* ---------- 自动保存（防抖，运行期间跳过） ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    [name, nodes, edges, seq],
    () => {
      if (running.value) return;
      dirty.value = true;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save(true), 600);
    },
    { deep: true },
  );

  return {
    // 数据
    records,
    activeId,
    workflows,
    favoriteWorkflows,
    name,
    seq,
    nodes,
    edges,
    selectedId,
    selectedIds,
    selectedNode,
    activeLastRun,
    running,
    paused,
    runningNodeId,
    dirty,
    layoutBump,
    runLogs,
    runEntries,
    runMode,
    runParams,
    persistError,
    migrationWarnings,
    clipboard,
    canUndo,
    canRedo,
    stats,
    // 撤销 / 重做
    undo,
    redo,
    // 工作流 CRUD
    createWorkflow,
    renameWorkflow,
    renameActive,
    duplicateWorkflow,
    deleteWorkflow,
    openWorkflow,
    // 元数据
    updateMeta,
    toggleFavorite,
    toggleTemplate,
    createFromTemplate,
    // 版本
    createVersion,
    listVersions,
    restoreVersion,
    // 节点 / 连线
    addNode,
    updateNodeData,
    removeNode,
    removeNodes,
    selectNode,
    toggleNodeSelected,
    selectMany,
    clearSelection,
    recordUndoPoint,
    afterNodesRemoved,
    focusSelected,
    focusRequest,
    moveNodes,
    addEdge,
    removeEdge,
    removeEdges,
    // 复制 / 粘贴
    copySelection,
    pasteNodes,
    deleteSelection,
    // 对齐 / 分布 / 自动布局
    alignSelected,
    distributeSelected,
    autoLayoutCanvas,
    // 节点模板
    nodeTemplates,
    ensureTemplates,
    saveSelectionAsTemplate,
    insertTemplate,
    deleteTemplate,
    exportTemplatesJson,
    importTemplatesJson,
    // 变量浏览器 / 数据映射
    availableVars,
    availableVarNames,
    nodeInputVars,
    missingVarsFor,
    nodeOutputPreview,
    runOutputs,
    // v4 输入输出契约与运行配置
    inputDefs,
    outputDefs,
    runConfig,
    setInputDefs,
    setOutputDefs,
    updateRunConfig,
    validateRunInputs,
    buildInputs,
    lastRunInput,
    defaultInputs,
    summarizeWorkflowOutputs,
    // 子流程
    workflowStubs,
    checkSubflowIssues,
    checkWorkflowCycles,
    validateSubflows,
    updateSubflowMap,
    executeSubflow,
    // 运行历史
    runHistory,
    runHistoryWarnings,
    deleteRunEntry,
    pinRunEntry,
    clearAllRuns,
    exportRunEntryJson,
    filterRuns,
    compareRunEntries,
    // 回放
    replayState,
    replayRunId,
    isReplaying,
    startReplay,
    exitReplay,
    rerunFromHistory,
    // 模块化子图
    modules,
    saveSelectionAsModule,
    insertModule,
    updateModuleDefinition,
    removeModule,
    replaceModuleInstances,
    // 诊断 / 预估 / 类型检查
    diagnostics,
    diagnosticsCount,
    runDiagnostics,
    estimateRunPerformance,
    runTypeCheck,
    // 人工确认
    approvalPending,
    approveRun,
    rejectRun,
    // 断点 / 单步
    breakpoints,
    toggleBreakpoint,
    hasBreakpoint,
    stepRun,
    // AI 生成预览
    aiPhase,
    aiBusy,
    aiError,
    aiPreview,
    lastAiPrompt,
    setAiService,
    generateAiWorkflow,
    clearAiPreview,
    togglePendingChoice,
    previewEdges,
    applyAiDraft,
    // 校验 / 排序 / 运行
    validate,
    topoSort: topoSortFn,
    executionOrder,
    simulateRun,
    runWorkflow: runWorkflowFn,
    runSelected,
    runFromSelected,
    pauseRun,
    resumeRun,
    cancelRun,
    retryFailed,
    exportRunResult,
    copyRunResult,
    // 持久化 / 导入导出 / 示例
    save,
    load,
    restore,
    clear,
    loadDemo,
    exportJson,
    importJson,
    inspectJson,
    validateSnapshot,
    // 工具
    resetToDefaults,
  };
});
