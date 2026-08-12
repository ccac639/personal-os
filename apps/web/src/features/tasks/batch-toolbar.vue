<script setup lang="ts">
import { ArrowRight, Plus, Trash2, X } from '@lucide/vue';
import { computed, ref } from 'vue';
import type { TaskPriority } from '@personal-os/types';

import { useTaskStore } from './store';
import { KANBAN_STATUSES, TASK_PRIORITY_META, TASK_STATUS_META } from './types';
import type { KanbanStatus } from './types';

const emit = defineEmits<{
  delete: [ids: string[]];
}>();

const store = useTaskStore();

const count = computed(() => store.selectedTasks.length);
const PRIORITIES = Object.keys(TASK_PRIORITY_META) as TaskPriority[];

const tagInputOpen = ref(false);
const newTag = ref('');

function moveAll(status: KanbanStatus) {
  store.batchMove([...store.selectedIds], status);
}

function setPriority(p: TaskPriority) {
  store.batchSetPriority([...store.selectedIds], p);
}

function confirmAddTag() {
  const tag = newTag.value.trim();
  if (!tag) return;
  store.batchAddTag([...store.selectedIds], tag);
  newTag.value = '';
  tagInputOpen.value = false;
}
</script>

<template>
  <div
    class="border-brand-500/30 bg-brand-500/5 shadow-card fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5"
    role="toolbar"
    aria-label="批量操作"
  >
    <span class="text-brand-700 text-sm font-semibold whitespace-nowrap">已选 {{ count }} 项</span>

    <div class="flex flex-wrap items-center gap-1.5">
      <span class="text-surface-800/50 text-xs whitespace-nowrap">移至</span>
      <button
        v-for="status in KANBAN_STATUSES"
        :key="status"
        type="button"
        class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors"
        :title="`批量移至${TASK_STATUS_META[status].label}`"
        :aria-label="`批量移至${TASK_STATUS_META[status].label}`"
        @click="moveAll(status)"
      >
        <ArrowRight class="size-3" />
        {{ TASK_STATUS_META[status].label }}
      </button>
    </div>

    <select
      class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors"
      aria-label="批量设置优先级"
      :value="''"
      @change="
        (e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v) setPriority(v as TaskPriority);
          (e.target as HTMLSelectElement).value = '';
        }
      "
    >
      <option value="" disabled>批量设优先级…</option>
      <option v-for="p in PRIORITIES" :key="p" :value="p">
        {{ TASK_PRIORITY_META[p].label }}
      </option>
    </select>

    <div v-if="tagInputOpen" class="flex items-center gap-1.5">
      <input
        v-model="newTag"
        type="text"
        class="border-surface-100 bg-surface-0 focus:border-brand-500 focus:ring-brand-500/20 w-32 rounded-lg border px-2 py-1.5 text-xs transition outline-none focus:ring-4"
        placeholder="标签名"
        autocomplete="off"
        @keydown.enter.prevent="confirmAddTag"
        @keydown.escape="tagInputOpen = false"
      />
      <button
        type="button"
        class="bg-brand-600 hover:bg-brand-700 text-surface-0 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
        aria-label="确认添加标签"
        title="确认添加"
        @click="confirmAddTag"
      >
        确认
      </button>
    </div>
    <button
      v-else
      type="button"
      class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors"
      title="批量添加标签"
      aria-label="批量添加标签"
      @click="tagInputOpen = true"
    >
      <Plus class="size-3" />
      加标签
    </button>

    <button
      type="button"
      class="border-surface-100 bg-surface-0 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors"
      title="批量删除选中任务"
      aria-label="批量删除选中任务"
      @click="emit('delete', [...store.selectedIds])"
    >
      <Trash2 class="size-3" />
      删除
    </button>

    <button
      type="button"
      class="text-surface-800/50 hover:bg-surface-100 hover:text-surface-900 ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors"
      title="取消选择"
      aria-label="取消选择"
      @click="store.clearSelection()"
    >
      <X class="size-3" />
      取消
    </button>
  </div>
</template>
