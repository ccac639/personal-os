/**
 * 工作流编排 Store（Pinia）
 *
 * 负责画布节点/连线状态、选中、localStorage 持久化、
 * 导入导出与前端模拟运行（真实执行后续接 worker 的 AI Task Job）。
 *
 * 类型说明：内部使用与 Vue Flow 解耦的 WorkflowNodeModel / WorkflowEdgeModel
 * （见 features/workflows/types.ts），画布组件在边界做 as unknown as 转换，
 * 规避 motion/motion-v 双重类型增强导致的 vue-tsc 深层实例化问题。
 */
import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';
import type { Connection } from '@vue-flow/core';
import {
  getNodeDef,
  nextEdgeId,
  nextNodeId,
  nodeData,
  nodeSummary,
  NODE_DEFS,
  type WorkflowEdgeModel,
  type WorkflowNodeData,
  type WorkflowNodeKind,
  type WorkflowNodeModel,
  type XYPosition,
} from '@/features/workflows/types';

const STORAGE_KEY = 'personal-os-workflow-v1';

export interface WorkflowSnapshot {
  name: string;
  seq: number;
  nodes: WorkflowNodeModel[];
  edges: WorkflowEdgeModel[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 默认画布起点（避免节点堆叠在原点） */
const START: XYPosition = { x: 60, y: 60 };

function loadSnapshot(): WorkflowSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkflowSnapshot;
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useWorkflowStore = defineStore('workflow', () => {
  const name = ref('未命名工作流');
  const seq = ref(1);
  const nodes = ref<WorkflowNodeModel[]>([]);
  const edges = ref<WorkflowEdgeModel[]>([]);
  const selectedId = ref<string | null>(null);
  const running = ref(false);
  const dirty = ref(false);
  /** 每次加载/示例/导入/清空自增，画布据此重新 fitView */
  const layoutBump = ref(0);

  const selectedNode = computed<WorkflowNodeModel | null>(
    () => nodes.value.find((n) => n.id === selectedId.value) ?? null,
  );

  const stats = computed(() => ({
    nodeCount: nodes.value.length,
    edgeCount: edges.value.length,
    triggerCount: nodes.value.filter((n) => nodeData(n).kind === 'trigger').length,
  }));

  /* ---------- 节点 ---------- */

  function computePosition(): XYPosition {
    if (nodes.value.length === 0) return { ...START };
    const maxX = Math.max(...nodes.value.map((n) => n.position.x)) + 280;
    const row = (nodes.value.length - 1) % 5;
    return { x: maxX, y: 60 + row * 130 };
  }

  function addNode(kind: WorkflowNodeKind) {
    const def = getNodeDef(kind);
    const id = nextNodeId(seq.value++);
    nodes.value.push({
      id,
      type: 'custom',
      position: computePosition(),
      data: { kind, label: def.label, status: 'idle', ...def.defaults },
    });
    selectNode(id);
  }

  function updateNodeData(id: string, patch: Partial<WorkflowNodeData>) {
    const node = nodes.value.find((n) => n.id === id);
    if (!node) return;
    node.data = { ...nodeData(node), ...patch };
  }

  function removeNode(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id);
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
    if (selectedId.value === id) selectNode(null);
  }

  function selectNode(id: string | null) {
    selectedId.value = id;
    // 与画布高亮保持一致：显式同步 selected 标记
    nodes.value = nodes.value.map((n) => ({ ...n, selected: n.id === id }));
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
    edges.value.push({
      id: nextEdgeId(conn.source, conn.sourceHandle, conn.target),
      source: conn.source,
      target: conn.target,
      sourceHandle: conn.sourceHandle,
      targetHandle: conn.targetHandle,
      type: 'smoothstep',
    });
  }

  /* ---------- 持久化 ---------- */

  /** 序列化时剥离运行时状态（status / selected） */
  function serialize(): WorkflowSnapshot {
    return {
      name: name.value,
      seq: seq.value,
      nodes: nodes.value.map((n) => {
        const copy = { ...n } as Partial<WorkflowNodeModel>;
        delete copy.selected;
        return { ...copy, data: { ...nodeData(n), status: 'idle' } } as WorkflowNodeModel;
      }),
      edges: edges.value.map((e) => {
        const copy = { ...e } as Partial<WorkflowEdgeModel>;
        delete copy.selected;
        return copy as WorkflowEdgeModel;
      }),
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize()));
      dirty.value = false;
    } catch {
      /* 存储失败静默 */
    }
  }

  /** 恢复快照（合并默认字段，兼容旧数据） */
  function restore(snapshot: WorkflowSnapshot) {
    name.value = snapshot.name || '未命名工作流';
    seq.value = snapshot.seq > 0 ? snapshot.seq : 1;
    nodes.value = (snapshot.nodes ?? []).map((n) => {
      const def = getNodeDef(n.data?.kind ?? 'ai');
      return {
        ...n,
        type: 'custom',
        position: n.position ?? { ...START },
        data: { ...def.defaults, ...(n.data ?? {}), status: 'idle' as const },
      };
    });
    edges.value = (snapshot.edges ?? []).filter(
      (e) =>
        e.source &&
        e.target &&
        nodes.value.some((n) => n.id === e.source) &&
        nodes.value.some((n) => n.id === e.target),
    );
    selectNode(null);
    layoutBump.value++;
  }

  function load() {
    const snap = loadSnapshot();
    if (snap) restore(snap);
  }

  function clear() {
    nodes.value = [];
    edges.value = [];
    seq.value = 1;
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
        mk('n-2', 'ai', 300, 140, {
          model: 'deepseek-v3',
          prompt: '审查今日新增 commit，输出安全/质量风险清单',
          label: 'AI 代码审查',
        }),
        mk('n-3', 'condition', 620, 140, { expr: 'risks > 0', label: '存在高危风险？' }),
        mk('n-4', 'notify', 950, 40, {
          channel: '钉钉',
          message: '发现 {{ risks }} 个高危风险，请立即处理',
          label: '告警通知',
        }),
        mk('n-5', 'delay', 950, 260, { seconds: 30, label: '等待 30s' }),
        mk('n-6', 'code', 1250, 260, {
          lang: 'python',
          code: 'print("生成周报…")',
          label: '生成审查周报',
        }),
      ],
      edges: [
        { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
        { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
        { id: 'e-3', source: 'n-3', sourceHandle: 'true', target: 'n-4', type: 'smoothstep' },
        { id: 'e-4', source: 'n-3', sourceHandle: 'false', target: 'n-5', type: 'smoothstep' },
        { id: 'e-5', source: 'n-5', target: 'n-6', type: 'smoothstep' },
      ],
    });
  }

  /* ---------- 导入 / 导出 ---------- */

  function exportJson(): string {
    return JSON.stringify(serialize(), null, 2);
  }

  function importJson(text: string): boolean {
    try {
      const parsed = JSON.parse(text) as WorkflowSnapshot;
      if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return false;
      const known = new Set(NODE_DEFS.map((d) => d.kind));
      if (!parsed.nodes.every((n) => n.data && known.has(n.data.kind))) return false;
      restore(parsed);
      return true;
    } catch {
      return false;
    }
  }

  /* ---------- 模拟运行（前端演示，真实执行后续接 worker） ---------- */

  /** BFS 拓扑顺序：从无入边节点开始逐层推进 */
  function executionOrder(): string[] {
    const incoming = new Map<string, number>();
    for (const n of nodes.value) incoming.set(n.id, 0);
    for (const e of edges.value) {
      if (incoming.has(e.target)) incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    }
    const queue = nodes.value.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id);
    const order: string[] = [];
    const visited = new Set<string>();
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      for (const e of edges.value.filter((x) => x.source === id)) {
        const next = incoming.get(e.target) ?? 0;
        incoming.set(e.target, next - 1);
        if (next - 1 <= 0 && !visited.has(e.target)) queue.push(e.target);
      }
    }
    // 环内节点兜底追加
    for (const n of nodes.value) if (!visited.has(n.id)) order.push(n.id);
    return order;
  }

  function resetStatus() {
    nodes.value = nodes.value.map((n) => ({
      ...n,
      data: { ...nodeData(n), status: 'idle' as const },
    }));
    for (const e of edges.value) delete e.class;
  }

  async function simulateRun() {
    if (running.value || nodes.value.length === 0) return;
    running.value = true;
    dirty.value = false; // 运行中的状态变化不触发自动保存
    resetStatus();
    const order = executionOrder();
    const setStatus = (id: string, status: 'running' | 'success') => {
      // Vue Flow 受控模式持有节点副本，必须换新数组/新对象才能驱动重渲染
      nodes.value = nodes.value.map((n) =>
        n.id === id ? { ...n, data: { ...nodeData(n), status } } : n,
      );
    };
    for (const id of order) {
      const node = nodes.value.find((n) => n.id === id);
      if (!node) continue;
      setStatus(id, 'running');
      for (const e of edges.value) {
        if (e.source === id) e.class = 'wf-edge-active';
      }
      await sleep(420);
      setStatus(id, 'success');
      for (const e of edges.value) {
        if (e.source === id) delete e.class;
      }
    }
    running.value = false;
  }

  /* ---------- 自动保存（防抖，运行期间跳过） ---------- */

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  watch(
    [name, nodes, edges, seq],
    () => {
      if (running.value) return;
      dirty.value = true;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => save(), 600);
    },
    { deep: true },
  );

  return {
    name,
    seq,
    nodes,
    edges,
    selectedId,
    selectedNode,
    running,
    dirty,
    layoutBump,
    stats,
    addNode,
    updateNodeData,
    removeNode,
    selectNode,
    addEdge,
    save,
    load,
    restore,
    clear,
    loadDemo,
    exportJson,
    importJson,
    simulateRun,
    executionOrder,
    nodeSummary,
  };
});
