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
} from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import { useThemeStore } from '@/stores/theme';
import { useWorkflowStore } from '@/stores/workflow';
import type { WorkflowEdgeModel, WorkflowNodeModel } from './types';
import WorkflowNode from './workflow-node.vue';

import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';
import '@vue-flow/minimap/dist/style.css';

const store = useWorkflowStore();
const theme = useThemeStore();
const flowRef = ref<InstanceType<typeof VueFlow>>();

const nodeTypes = { custom: WorkflowNode };

/** 边界转换：Store 轻量模型 → Vue Flow 类型（模型有索引签名，运行时可兼容） */
const flowNodes = computed<Node[]>(() => store.nodes as unknown as Node[]);
const flowEdges = computed<Edge[]>(() => store.edges as unknown as Edge[]);

function onNodesChange(changes: NodeChange[]) {
  store.nodes = applyNodeChanges(
    changes,
    store.nodes as unknown as GraphNode[],
  ) as unknown as WorkflowNodeModel[];
}

function onEdgesChange(changes: EdgeChange[]) {
  store.edges = applyEdgeChanges(
    changes,
    store.edges as unknown as GraphEdge[],
  ) as unknown as WorkflowEdgeModel[];
}

/** 点阵背景色随主题明暗切换 */
const patternColor = computed(() => (theme.palette.dark ? '#3b4250' : '#94a3b8'));

function onNodeClick(e: NodeMouseEvent) {
  store.selectNode(e.node.id);
}

function onPaneClick() {
  store.selectNode(null);
}

function onConnect(conn: Connection) {
  store.addEdge(conn);
}

/** 加载示例 / 导入 / 清空后重新适配视口 */
watch(
  () => store.layoutBump,
  async () => {
    await nextTick();
    if (store.nodes.length > 0) flowRef.value?.fitView({ padding: 0.25 });
  },
);
</script>

<template>
  <div class="relative h-full w-full">
    <VueFlow
      ref="flowRef"
      :nodes="flowNodes"
      :edges="flowEdges"
      :node-types="nodeTypes"
      :default-edge-options="{ type: 'smoothstep' }"
      :delete-key-code="['Backspace', 'Delete']"
      :min-zoom="0.2"
      :max-zoom="2.5"
      fit-view-on-init
      class="wf-canvas"
      @nodes-change="onNodesChange"
      @edges-change="onEdgesChange"
      @node-click="onNodeClick"
      @pane-click="onPaneClick"
      @connect="onConnect"
    >
      <Background variant="dots" :gap="22" :size="1.5" :pattern-color="patternColor" />
      <Controls position="bottom-right" />
      <MiniMap position="bottom-left" :pannable="true" :zoomable="true" />
    </VueFlow>

    <!-- 空画布引导 -->
    <div
      v-if="store.nodes.length === 0"
      class="pointer-events-none absolute inset-0 flex items-center justify-center"
    >
      <div class="text-surface-800/40 flex flex-col items-center gap-2 text-center text-sm">
        <span class="text-4xl">🧩</span>
        <p>点击左侧「节点库」添加节点，或加载「示例工作流」</p>
        <p class="text-xs">连线：从节点右侧锚点拖到下一个节点左侧</p>
      </div>
    </div>
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
