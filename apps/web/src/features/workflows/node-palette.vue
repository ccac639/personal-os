<script setup lang="ts">
import { Plus } from '@lucide/vue';
import { NODE_DEFS, type WorkflowNodeKind } from './types';
import { useWorkflowStore } from '@/stores/workflow';

const store = useWorkflowStore();

function add(kind: WorkflowNodeKind) {
  store.addNode(kind);
}
</script>

<template>
  <aside
    class="border-surface-100 bg-surface-0 flex w-52 shrink-0 flex-col rounded-xl border shadow-sm"
  >
    <header class="border-surface-100 border-b px-3 py-2.5">
      <h2 class="text-surface-900 text-sm font-semibold">节点库</h2>
      <p class="text-surface-800/50 mt-0.5 text-[11px]">点击添加到画布</p>
    </header>

    <div class="flex-1 space-y-1.5 overflow-y-auto p-2.5">
      <button
        v-for="def in NODE_DEFS"
        :key="def.kind"
        type="button"
        class="group hover:border-surface-800/30 hover:bg-surface-50 flex w-full items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition"
        @click="add(def.kind)"
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
