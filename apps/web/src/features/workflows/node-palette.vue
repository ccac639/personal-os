<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { NODE_DEFS, type WorkflowNodeKind } from './types';
import { useWorkflowStore } from './store';

const store = useWorkflowStore();

function add(kind: WorkflowNodeKind) {
  store.addNode(kind);
}

/** 拖拽：把节点类型写入 DataTransfer（canvas 端 drop 时读取） */
function onDragStart(kind: WorkflowNodeKind, e: DragEvent) {
  e.dataTransfer?.setData('application/x-workflow-kind', kind);
  e.dataTransfer?.setData('text/plain', kind);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0 flex w-full shrink-0 flex-col rounded-xl border shadow-sm lg:w-52"
  >
    <header class="border-surface-100 border-b px-3 py-2.5">
      <h2 class="text-surface-900 text-sm font-semibold">节点库</h2>
      <p class="text-surface-800/50 mt-0.5 text-[11px]">拖拽或点击添加到画布</p>
    </header>

    <div
      class="flex flex-row gap-1.5 overflow-x-auto p-2.5 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto"
    >
      <button
        v-for="def in NODE_DEFS"
        :key="def.kind"
        type="button"
        draggable="true"
        class="group hover:border-surface-800/30 hover:bg-surface-50 flex w-44 shrink-0 cursor-grab items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition active:cursor-grabbing lg:w-full"
        @click="add(def.kind)"
        @dragstart="onDragStart(def.kind, $event)"
      >
        <span class="flex size-8 shrink-0 items-center justify-center rounded-lg" :class="def.chip">
          <component :is="def.icon" class="size-4" />
        </span>
        <span class="min-w-0 flex-1">
          <span class="text-surface-900 block text-[13px] font-medium">
            {{ def.label }}
          </span>
          <span class="text-surface-800/50 block text-[11px] leading-snug">
            {{ def.description }}
          </span>
        </span>
        <Plus
          class="text-surface-800/30 group-hover:text-brand-600 mt-1 size-3.5 shrink-0 transition"
        />
      </button>
    </div>
  </aside>
</template>
