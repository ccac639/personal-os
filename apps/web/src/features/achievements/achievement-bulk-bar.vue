<script setup lang="ts">
import { Archive, Inbox, ListChecks, Pin, Trash2, X } from '@lucide/vue';

defineProps<{
  /** 已选中数量 */
  count: number;
  /** 当前筛选结果数量（用于全选） */
  visibleCount: number;
}>();

const emit = defineEmits<{
  pin: [];
  unpin: [];
  archive: [];
  unarchive: [];
  remove: [];
  selectAll: [];
  clear: [];
}>();

const btnCls = 'flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition';
</script>

<template>
  <div
    class="border-brand-500/30 bg-brand-500/10 flex flex-wrap items-center gap-1.5 rounded-xl border px-3 py-2"
    role="toolbar"
    aria-label="批量操作"
  >
    <span class="text-brand-600 flex items-center gap-1.5 text-xs font-semibold">
      <ListChecks class="size-3.5" />
      已选 {{ count }} 项
    </span>

    <span class="bg-brand-500/20 mx-1 hidden h-4 w-px sm:block" />

    <button
      type="button"
      class="text-brand-600 hover:bg-brand-500/10 rounded-md px-2 py-1.5 text-[11px] font-medium transition"
      @click="emit('selectAll')"
    >
      全选当前结果（{{ visibleCount }}）
    </button>

    <button
      type="button"
      :class="[btnCls, 'text-surface-800/70 hover:bg-surface-50 hover:text-surface-900']"
      title="批量置顶"
      @click="emit('pin')"
    >
      <Pin class="size-3.5" /> 置顶
    </button>
    <button
      type="button"
      :class="[btnCls, 'text-surface-800/70 hover:bg-surface-50 hover:text-surface-900']"
      title="批量取消置顶"
      @click="emit('unpin')"
    >
      <Pin class="size-3.5 rotate-45" /> 取消置顶
    </button>
    <button
      type="button"
      :class="[btnCls, 'text-surface-800/70 hover:bg-surface-50 hover:text-surface-900']"
      title="批量归档"
      @click="emit('archive')"
    >
      <Archive class="size-3.5" /> 归档
    </button>
    <button
      type="button"
      :class="[btnCls, 'text-surface-800/70 hover:bg-surface-50 hover:text-surface-900']"
      title="批量取消归档"
      @click="emit('unarchive')"
    >
      <Inbox class="size-3.5" /> 取消归档
    </button>
    <button
      type="button"
      :class="[btnCls, 'text-red-600 hover:bg-red-500/10']"
      title="批量删除"
      @click="emit('remove')"
    >
      <Trash2 class="size-3.5" /> 删除
    </button>

    <button
      type="button"
      :class="[btnCls, 'text-surface-800/50 hover:text-surface-900 ml-auto']"
      title="取消选择"
      @click="emit('clear')"
    >
      <X class="size-3.5" /> 取消选择
    </button>
  </div>
</template>
