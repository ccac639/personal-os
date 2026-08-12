<script setup lang="ts">
import { onMounted } from 'vue';
import { WorkflowCanvas, WorkflowToolbar, NodePalette, InspectorPanel } from '@/features/workflows';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();

onMounted(() => {
  // 恢复上次保存的工作流（无则保持空画布）
  store.load();
});
</script>

<template>
  <!-- 高度对齐布局主体：header h-14，画布需要固定可视高度 -->
  <div class="flex h-[calc(100vh-3.5rem)] flex-col gap-3 p-3">
    <WorkflowToolbar />
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
