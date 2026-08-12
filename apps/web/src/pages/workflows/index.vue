<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft } from '@lucide/vue';
import {
  WorkflowCanvas,
  WorkflowList,
  WorkflowToolbar,
  NodePalette,
  InspectorPanel,
  RunPanel,
  WorkflowAiPanel,
  useWorkflowStore,
} from '@/features/workflows';

const store = useWorkflowStore();

/** 视图切换：列表（默认）↔ 编排画布 */
const view = ref<'list' | 'canvas'>('list');

onMounted(() => {
  // 启动时加载本地持久化的工作流列表（含旧版数据幂等迁移）
  store.load();
});

/** 从列表打开指定工作流并进入画布 */
function openWorkflow(id: string) {
  store.openWorkflow(id);
  view.value = 'canvas';
}
</script>

<template>
  <!-- 单根容器：Vue Transition 要求页面组件为单根节点，双视图统一包裹（不改变布局） -->
  <div class="h-full">
    <!-- 列表视图：标题区 + 工作流列表 -->
    <div v-if="view === 'list'" class="page-content-section p-6">
      <WorkflowList @open-canvas="openWorkflow" />
    </div>

    <!-- 画布视图：编排编辑器 + 运行面板（窄屏：节点库横向、检查器底部抽屉） -->
    <div v-else class="page-content-section flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3">
      <div class="page-content-section flex flex-wrap items-center gap-2">
        <button
          type="button"
          class="hover:bg-surface-50 text-surface-800/60 hover:text-surface-900 flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-1.5 text-xs font-medium transition"
          @click="view = 'list'"
        >
          <ArrowLeft class="size-3.5" />
          返回列表
        </button>
        <div class="min-w-0 flex-1">
          <WorkflowToolbar />
        </div>
      </div>
      <div class="page-content-section flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        <NodePalette />
        <div
          class="border-surface-100 bg-surface-50 relative min-h-0 flex-1 overflow-hidden rounded-xl border shadow-sm"
        >
          <WorkflowCanvas />
        </div>
        <InspectorPanel />
        <WorkflowAiPanel />
      </div>
      <RunPanel class="page-content-section" />
    </div>
  </div>
</template>
