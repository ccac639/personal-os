<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position, type NodeProps } from '@vue-flow/core';
import { getNodeDef, nodeSummary, type WorkflowNodeData } from './types';
import { useWorkflowStore } from './store';

const props = defineProps<NodeProps<WorkflowNodeData>>();
const store = useWorkflowStore();

const def = computed(() => getNodeDef(props.data.kind));
const isTrigger = computed(() => props.data.kind === 'trigger');
const isCondition = computed(() => props.data.kind === 'condition');
/** 末端节点：无出边锚点（输出/通知/延迟），条件节点特殊处理 */
const isEnd = computed(() => ['notify', 'delay', 'output'].includes(props.data.kind));
/** 断点状态（模拟运行时执行前暂停） */
const hasBreakpoint = computed(() => store.hasBreakpoint(props.id));

const statusDot = computed(() => {
  switch (props.data.status) {
    case 'running':
      return { cls: 'bg-brand-500 animate-pulse', title: '运行中' };
    case 'success':
      return { cls: 'bg-green-500', title: '成功' };
    case 'error':
      return { cls: 'bg-red-500', title: '失败' };
    default:
      return { cls: 'bg-surface-800/25', title: '就绪' };
  }
});

/** 失败时的文本状态提示（可访问性：不只依赖颜色） */
const statusText = computed(() => {
  switch (props.data.status) {
    case 'running':
      return '运行中';
    case 'success':
      return '成功';
    case 'error':
      return '失败';
    default:
      return '';
  }
});
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0 shadow-card w-60 rounded-xl border transition-shadow"
    :class="{
      'ring-brand-500/60 border-brand-500 shadow-float ring-2': props.selected,
      'wf-node-running': data.status === 'running',
      'wf-node-success': data.status === 'success',
      'wf-node-error': data.status === 'error',
    }"
  >
    <!-- 入边锚点：trigger 不可作为目标 -->
    <Handle v-if="!isTrigger" type="target" :position="Position.Left" class="wf-handle" />

    <!-- 头部：图标 + 名称 + 状态点 -->
    <header class="flex items-center gap-2 px-3 pt-2.5 pb-1.5">
      <span class="flex size-7 shrink-0 items-center justify-center rounded-md" :class="def.chip">
        <component :is="def.icon" class="size-4" />
      </span>
      <span class="text-surface-900 min-w-0 flex-1 truncate text-sm font-semibold">
        {{ data.label }}
      </span>
      <!-- 断点角标：右键节点可切换 -->
      <span
        v-if="hasBreakpoint"
        class="text-surface-0 absolute -top-1.5 -left-1.5 flex size-4 items-center justify-center rounded-full bg-red-500 shadow-sm"
        title="断点（执行前暂停）"
      >
        <span class="bg-surface-0 block size-1.5 rounded-full" />
      </span>
      <span class="size-2 shrink-0 rounded-full" :class="statusDot.cls" :title="statusDot.title" />
      <span v-if="statusText" class="sr-only" aria-live="polite">{{ statusText }}</span>
    </header>

    <!-- 摘要 -->
    <p class="text-surface-800/60 truncate px-3 pb-2.5 text-xs">
      {{ nodeSummary(data) }}
    </p>

    <!-- 出边锚点：条件节点 右=通过 / 下=不通过 -->
    <Handle
      v-if="!isEnd || isCondition"
      :id="isCondition ? 'true' : undefined"
      type="source"
      :position="Position.Right"
      class="wf-handle"
    />
    <Handle
      v-if="isCondition"
      id="false"
      type="source"
      :position="Position.Bottom"
      class="wf-handle"
    />

    <!-- 条件分支角标 -->
    <span
      v-if="isCondition"
      class="text-surface-800/40 pointer-events-none absolute top-1/2 -right-1.5 -translate-y-1/2 text-[9px] font-medium"
    >
      通过
    </span>
    <span
      v-if="isCondition"
      class="text-surface-800/40 pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-medium"
    >
      不通过
    </span>
  </div>
</template>

<style scoped>
/* 锚点跟随主题（覆盖 Vue Flow 默认） */
.wf-handle {
  width: 10px;
  height: 10px;
  background: var(--color-surface-800);
  border: 2px solid var(--color-surface-0);
}

.wf-node-running :deep(.wf-handle),
.wf-node-success :deep(.wf-handle) {
  border-color: var(--color-surface-50);
}

/* 运行中轻微上浮提示 */
.wf-node-running {
  animation: wf-node-pulse 1s ease-in-out infinite;
}
@keyframes wf-node-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgb(99 102 241 / 0.25);
  }
  50% {
    box-shadow: 0 0 0 6px rgb(99 102 241 / 0);
  }
}

/* 运行失败：红色描边提示 */
.wf-node-error {
  border-color: rgb(239 68 68 / 0.6);
  box-shadow: 0 0 0 2px rgb(239 68 68 / 0.18);
}
</style>
