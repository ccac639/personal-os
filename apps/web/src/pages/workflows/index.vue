<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { ArrowLeft } from '@lucide/vue';
import {
  WorkflowCanvas,
  WorkflowList,
  WorkflowToolbar,
  NodePalette,
  InspectorPanel,
} from '@/features/workflows';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();

/** 视图切换：列表（默认）↔ 编排画布 */
const view = ref<'list' | 'canvas'>('list');

onMounted(() => {
  // 进入画布前预加载上次保存的工作流（列表视图不依赖它）
  store.load();
});
</script>

<template>
  <!-- 列表视图：标题区 + 工作流列表 -->
  <div v-if="view === 'list'" class="p-6">
    <WorkflowList @open-canvas="view = 'canvas'" />
  </div>

  <!-- 画布视图：编排编辑器 -->
  <div v-else class="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3">
    <div class="flex items-center gap-2">
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
    <div class="flex min-h-0 flex-1 gap-3">
      <NodePalette />
      <div
        class="border-surface-100 bg-surface-50 relative min-w-0 flex-1 overflow-hidden rounded-xl border shadow-sm"
      >
        <WorkflowCanvas />
      </div>
      <InspectorPanel />
    </div>
  </div>
</template>
