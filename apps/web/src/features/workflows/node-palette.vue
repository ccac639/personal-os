<script setup lang="ts">
import { computed } from 'vue';
import { Plus } from '@lucide/vue';
import { NODE_DEFS, type NodeGroup, type WorkflowNodeKind } from './types';
import { useWorkflowStore } from './store';

const store = useWorkflowStore();

/** 节点分组：触发 / 控制 / 数据 / 集成 / 人工交互 / 输出 */
const GROUPS: Array<{ key: NodeGroup; label: string; kinds: WorkflowNodeKind[] }> = [
  { key: 'trigger', label: '触发', kinds: ['trigger', 'schedule'] },
  { key: 'control', label: '控制', kinds: ['condition', 'switch', 'delay', 'merge'] },
  { key: 'data', label: '数据', kinds: ['prompt', 'ai', 'code', 'transform'] },
  { key: 'integration', label: '集成', kinds: ['http-request', 'subworkflow'] },
  { key: 'human', label: '人工交互', kinds: ['manual-approval', 'notify'] },
  { key: 'output', label: '输出', kinds: ['output'] },
];

const defsByKind = new Map(NODE_DEFS.map((d) => [d.kind, d]));

const groups = computed(() =>
  GROUPS.map((g) => ({
    ...g,
    defs: g.kinds.map((k) => defsByKind.get(k)).filter((d): d is NonNullable<typeof d> => !!d),
  })).filter((g) => g.defs.length > 0),
);

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
      <section v-for="group in groups" :key="group.key" class="shrink-0 lg:shrink">
        <h3
          class="text-surface-800/40 mb-1 px-1 text-[10px] font-semibold tracking-wider uppercase"
        >
          {{ group.label }}
        </h3>
        <div class="flex flex-row gap-1.5 lg:flex-col">
          <button
            v-for="def in group.defs"
            :key="def.kind"
            type="button"
            draggable="true"
            class="group hover:border-surface-800/30 hover:bg-surface-50 flex w-44 shrink-0 cursor-grab items-start gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left transition active:cursor-grabbing lg:w-full"
            @click="add(def.kind)"
            @dragstart="onDragStart(def.kind, $event)"
          >
            <span
              class="flex size-8 shrink-0 items-center justify-center rounded-lg"
              :class="def.chip"
            >
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
      </section>
    </div>
  </aside>
</template>
