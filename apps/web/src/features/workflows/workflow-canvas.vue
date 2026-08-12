<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  VueFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type GraphEdge,
  type GraphNode,
  type Node,
  type NodeChange,
  type NodeMouseEvent,
  type SelectionMode,
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { useThemeStore } from '@/stores/theme';
import { useWorkflowStore } from './store';
import {
  NODE_KINDS,
  type WorkflowEdgeModel,
  type WorkflowNodeKind,
  type WorkflowNodeModel,
  type XYPosition,
} from './types';
import WorkflowNode from './workflow-node.vue';
import WorkflowAiPreview from './workflow-ai-preview.vue';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const store = useWorkflowStore();
const theme = useThemeStore();
const flowRef = ref<InstanceType<typeof VueFlow>>();
const aiPreviewRef = ref<InstanceType<typeof WorkflowAiPreview>>();

const nodeTypes = { custom: WorkflowNode };

/** 边界转换：Store 轻量模型 → Vue Flow 类型（模型有索引签名，运行时可兼容） */
const flowNodes = computed<Node[]>(() => store.nodes as unknown as Node[]);
const flowEdges = computed<Edge[]>(() => store.edges as unknown as Edge[]);

function onNodesChange(changes: NodeChange[]) {
  const hasRemove = changes.some((c) => c.type === 'remove');
  const removedIds = hasRemove ? changes.filter((c) => c.type === 'remove').map((c) => c.id) : [];
  if (hasRemove && !dragging) store.recordUndoPoint();
  store.nodes = applyNodeChanges(
    changes,
    store.nodes as unknown as GraphNode[],
  ) as unknown as WorkflowNodeModel[];
  if (removedIds.length > 0) store.afterNodesRemoved(removedIds);
}

function onEdgesChange(changes: EdgeChange[]) {
  const hasRemove = changes.some((c) => c.type === 'remove');
  if (hasRemove) {
    store.recordUndoPoint();
    store.edges = applyEdgeChanges(
      changes,
      store.edges as unknown as GraphEdge[],
    ) as unknown as WorkflowEdgeModel[];
  } else {
    store.edges = applyEdgeChanges(
      changes,
      store.edges as unknown as GraphEdge[],
    ) as unknown as WorkflowEdgeModel[];
  }
}

/** 点阵背景色随主题明暗切换 */
const patternColor = computed(() => (theme.palette.dark ? '#3b4250' : '#94a3b8'));

/** 拖动状态：拖动开始记录一次撤销点，拖动中的 position 变化不再入栈 */
let dragging = false;
function onNodeDragStart() {
  if (dragging) return;
  dragging = true;
  store.recordUndoPoint();
}
function onNodeDragStop() {
  dragging = false;
}

function onNodeClick(e: NodeMouseEvent) {
  const additive = e.event.shiftKey || e.event.ctrlKey || e.event.metaKey;
  store.toggleNodeSelected(e.node.id, additive);
}

function onSelectionChange(e: { nodes: GraphNode[] }) {
  store.selectMany(e.nodes.map((n) => n.id));
}

function onPaneClick() {
  store.selectNode(null);
  closeContextMenu();
}

function onConnect(conn: Connection) {
  store.addEdge(conn);
}

/** AI 预览层跟随画布视口（缩放/平移） */
function onViewportChange(v: { x: number; y: number; zoom: number }) {
  aiPreviewRef.value?.syncViewport(v);
}

/** 拖放：把节点库拖入的节点放到鼠标所在画布坐标 */
function onDragOver(e: DragEvent) {
  if (e.dataTransfer?.types.includes('application/x-workflow-kind')) {
    e.dataTransfer.dropEffect = 'copy';
  }
}

function onDrop(e: DragEvent) {
  const kind = e.dataTransfer?.getData('application/x-workflow-kind') as WorkflowNodeKind | '';
  if (!kind || !NODE_KINDS.has(kind)) return;
  const flow = flowRef.value as unknown as
    { screenToFlowCoordinate: (p: XYPosition) => XYPosition } | undefined;
  const position = flow?.screenToFlowCoordinate({ x: e.clientX, y: e.clientY });
  store.addNode(kind, position);
}

/* ---------- 键盘：撤销 / 重做 / 复制 / 粘贴 / 聚焦 ---------- */

function onKeydown(e: KeyboardEvent) {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return;
  const key = e.key.toLowerCase();
  if (key === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (key === 'y') {
    e.preventDefault();
    store.redo();
  } else if (key === 'c') {
    e.preventDefault();
    store.copySelection();
  } else if (key === 'v') {
    e.preventDefault();
    store.pasteNodes();
  } else if (key === 'a') {
    // 全选（框选操作的便捷入口）
    e.preventDefault();
    if (store.nodes.length > 0) store.selectMany(store.nodes.map((n) => n.id));
  }
}

/* ---------- 节点右键菜单：断点 / 复制 / 删除 ---------- */

const contextMenu = ref<{ x: number; y: number; nodeId: string } | null>(null);

function onNodeContextMenu(e: NodeMouseEvent) {
  // 阻止浏览器默认菜单
  e.event.preventDefault();
  const ev = e.event as MouseEvent;
  contextMenu.value = {
    x: ev.clientX,
    y: ev.clientY,
    nodeId: e.node.id,
  };
}

function closeContextMenu() {
  contextMenu.value = null;
}

function menuToggleBreakpoint() {
  if (contextMenu.value) store.toggleBreakpoint(contextMenu.value.nodeId);
  closeContextMenu();
}
function menuCopy() {
  if (contextMenu.value) {
    store.selectNode(contextMenu.value.nodeId);
    store.copySelection();
  }
  closeContextMenu();
}
function menuDelete() {
  if (contextMenu.value) {
    store.selectNode(contextMenu.value.nodeId);
    store.deleteSelection();
  }
  closeContextMenu();
}

/* ---------- 视口：加载/导入/清空后 fitView，聚焦选中 ---------- */

watch(
  () => store.layoutBump,
  async () => {
    await nextTick();
    if (store.nodes.length > 0) flowRef.value?.fitView({ padding: 0.25 });
  },
);

watch(
  () => store.focusRequest,
  async () => {
    await nextTick();
    const selectedIds = (flowNodes.value as GraphNode[])
      .filter((n) => store.selectedIds.includes(n.id))
      .map((n) => n.id);
    if (selectedIds.length > 0) {
      flowRef.value?.fitView({ nodes: selectedIds, padding: 0.6 });
    } else {
      flowRef.value?.fitView({ padding: 0.25 });
    }
  },
);

/** 画布内点击聚焦键盘监听（按钮等焦点元素不拦截） */
function isEditableTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

function onContainerKeydown(e: KeyboardEvent) {
  if (isEditableTarget(e)) return;
  onKeydown(e);
}
</script>

<template>
  <div
    class="relative h-full w-full outline-none"
    tabindex="0"
    @dragover.prevent="onDragOver"
    @drop.prevent="onDrop"
    @keydown="onContainerKeydown"
  >
    <VueFlow
      ref="flowRef"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :default-edge-options="{ type: 'smoothstep' }"
      :delete-key-code="store.running ? [] : ['Backspace', 'Delete']"
      :multi-selection-key-code="['Meta', 'Control', 'Shift']"
      :selection-on-drag="true"
      :selection-mode="'partial' as SelectionMode"
      :nodes-draggable="!store.running"
      :nodes-connectable="!store.running"
      :min-zoom="0.2"
      :max-zoom="2.5"
      :zoom-on-scroll="true"
      :zoom-on-pinch="true"
      :pan-on-drag="true"
      fit-view-on-init
      class="wf-canvas"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
      @node-click="onNodeClick"
      @node-context-menu="onNodeContextMenu"
      @node-drag-start="onNodeDragStart"
      @node-drag-stop="onNodeDragStop"
      @selection-change="onSelectionChange"
      @pane-click="onPaneClick"
      @connect="onConnect"
      @viewport-change="onViewportChange"
    >
      <Background variant="dots" :gap="22" :size="1.5" :pattern-color="patternColor" />
      <Controls position="bottom-right" />
      <MiniMap position="bottom-left" :pannable="true" :zoomable="true" class="hidden md:block" />
    </VueFlow>

    <!-- 空画布引导 -->
    <div
      v-if="store.nodes.length === 0"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div class="text-surface-800/40 flex flex-col items-center gap-2 text-center text-sm">
        <span class="text-4xl">🧩</span>
        <p>从上方「节点库」拖入或点击添加节点，也可以加载「示例工作流」</p>
        <p class="text-xs">连线：从节点右侧锚点拖到下一个节点左侧 · 框选或 Shift 点击可多选</p>
        <p class="text-xs">快捷键：Ctrl/⌘ Z 撤销 · Y 重做 · C 复制 · V 粘贴</p>
      </div>
    </div>

    <!-- AI 生成预览层（叠加，不修改正式数据） -->
    <WorkflowAiPreview ref="aiPreviewRef" />

    <!-- 运行中编辑锁定提示 -->
    <div
      v-if="store.running"
      class="absolute top-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-amber-400/40 bg-amber-50/95 px-3 py-1 text-[11px] font-medium text-amber-700 shadow-sm backdrop-blur dark:bg-amber-950/80 dark:text-amber-300"
    >
      模拟运行中，画布编辑已锁定
    </div>

    <!-- 节点右键菜单 -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="fixed z-50"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        @click.stop="closeContextMenu"
        @contextmenu.prevent="closeContextMenu"
      >
        <div
          class="border-surface-100 bg-surface-0 shadow-float w-36 overflow-hidden rounded-lg border py-1 text-xs backdrop-blur-xl"
        >
          <button
            type="button"
            class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center gap-2 px-3 py-1.5 text-left transition"
            @click.stop="menuToggleBreakpoint"
          >
            <span class="inline-block size-2 rounded-full bg-red-500" />
            {{ store.hasBreakpoint(contextMenu.nodeId) ? '移除断点' : '设置断点' }}
          </button>
          <button
            type="button"
            class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center gap-2 px-3 py-1.5 text-left transition"
            @click.stop="menuCopy"
          >
            复制
          </button>
          <button
            type="button"
            class="text-surface-800/80 hover:bg-surface-100 flex w-full items-center gap-2 px-3 py-1.5 text-left transition hover:text-red-600"
            @click.stop="menuDelete"
          >
            删除
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* 画布容器跟随主题 */
.wf-canvas {
  background: var(--color-surface-50);
  font-family: inherit;
}

/* 节点默认壳（我们使用自定义节点，去掉默认白底样式干扰） */
.wf-canvas .vue-flow__node {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
}

/* 连线颜色跟随主题 */
.wf-canvas .vue-flow__edge-path {
  stroke: var(--color-surface-800);
  stroke-width: 1.8;
}

.wf-canvas .vue-flow__edge.selected .vue-flow__edge-path {
  stroke: var(--color-brand-500);
  stroke-width: 2.2;
}

/* 模拟运行时高亮连线 */
.wf-canvas .vue-flow__edge.wf-edge-active .vue-flow__edge-path {
  stroke: var(--color-brand-500);
  stroke-width: 2.6;
  animation: wf-dash 0.8s linear infinite;
}
@keyframes wf-dash {
  to {
    stroke-dashoffset: -16;
  }
}

/* 连接预览线 */
.wf-canvas .vue-flow__connection-path {
  stroke: var(--color-brand-500);
  stroke-width: 2;
}

/* 框选虚线框 */
.wf-canvas .vue-flow__selection {
  background: rgb(99 102 241 / 0.08);
  border: 1px dashed var(--color-brand-500);
}

/* 控件按钮跟随主题 */
.wf-canvas .vue-flow__controls {
  border: 1px solid var(--color-surface-100);
  border-radius: 0.5rem;
  overflow: hidden;
  box-shadow: var(--shadow-card);
}
.wf-canvas .vue-flow__controls-button {
  background: var(--color-surface-0);
  border-bottom: 1px solid var(--color-surface-100);
  color: var(--color-surface-800);
  fill: var(--color-surface-800);
}
.wf-canvas .vue-flow__controls-button:hover {
  background: var(--color-surface-50);
}
.wf-canvas .vue-flow__controls-button svg {
  max-width: 12px;
  max-height: 12px;
}

/* 缩略图跟随主题 */
.wf-canvas .vue-flow__minimap {
  background: var(--color-surface-0);
  border: 1px solid var(--color-surface-100);
  border-radius: 0.5rem;
  box-shadow: var(--shadow-card);
}
.wf-canvas .vue-flow__minimap-node {
  fill: var(--color-brand-500);
}
</style>
