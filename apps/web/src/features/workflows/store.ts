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
  nodeData,
  type RunLogEntry,
  type RunMode,
  type RunParams,
  type WorkflowEdgeModel,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowNodeModel,
  type WorkflowVersion,
  type XYPosition,
} from './types';
import { graphStats, topoSort, validateGraph, type TopoResult } from './topo';
import { createRunControl, runWorkflow, type RunnerHooks, type RunSnapshot } from './runner';
import { normalizeDelay, resetToDefaults } from './schema';
import {
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
      selectNode(s.selectedId);
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
    rec.nodes = version.nodes.map((n) => ({
      ...n,
      data: { ...nodeData(n), status: 'idle' as const },
      selected: false,
    }));
    rec.edges = version.edges.map((e) => ({ ...e, selected: false }));
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
    const node = nodes.value.find((n) => n.id === id);
    if (!node) return;
    pushUndo();
    let next = { ...nodeData(node), ...patch };
    if (next.kind === 'delay') next = normalizeDelay(next);
    node.data = next;
  }

  function removeNode(id: string) {
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
    dirty.value = false;
    runningNodeId.value = null;
    resetStatus();
    // 重置控制句柄（保留同一实例，避免 UI 引用失效）
    control.cancelled = false;
    control.paused = false;

    const snapshot: RunSnapshot = {
      nodes: nodes.value.map((n) => ({ ...n, data: { ...nodeData(n) } })),
      edges: edges.value.map((e) => ({ ...e })),
    };

    const result = await runWorkflow({
      snapshot,
      mode,
      targetId: mode === 'full' ? undefined : (targetId ?? selectedId.value ?? undefined),
      params: runParams.value,
      control,
      hooks: runnerHooks,
    });

    running.value = false;
    runningNodeId.value = null;
    finishRun(result.status === 'success' ? 'success' : 'failed', Date.now() - started);
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
  }

  function resumeRun() {
    control.resume();
  }

  function cancelRun() {
    control.cancel();
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
