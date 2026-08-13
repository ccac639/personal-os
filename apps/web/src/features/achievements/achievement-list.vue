<script setup lang="ts">
import { ref } from 'vue';
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Inbox,
  Pencil,
  Pin,
  Trash2,
} from '@lucide/vue';
import { TYPE_META, tagCls } from './constants';
import { hasReuse } from './reuse';
import type { Achievement } from './types';

defineProps<{
  items: Achievement[];
  selectedIds: string[];
  manual: boolean;
}>();

const emit = defineEmits<{
  open: [item: Achievement];
  select: [id: string];
  move: [id: string, dir: -1 | 1];
  pin: [id: string];
  edit: [item: Achievement];
  archive: [id: string];
  remove: [id: string];
}>();

/** 两段式删除确认（按 id 记录确认态，避免行间互相干扰） */
const confirmingId = ref<string | null>(null);
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

function askRemove(id: string) {
  if (confirmingId.value === id) {
    emit('remove', id);
    resetConfirm();
    return;
  }
  confirmingId.value = id;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(resetConfirm, 2500);
}

function resetConfirm() {
  confirmingId.value = null;
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
}
</script>

<template>
  <ul class="space-y-1">
    <li
      v-for="item in items"
      :key="item.id"
      class="group hover:border-surface-100 hover:bg-surface-0/70 flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 transition-all duration-200"
      :class="
        selectedIds.includes(item.id) ? 'border-brand-500/50 bg-brand-500/5' : 'border-transparent'
      "
      @click="emit('open', item)"
    >
      <!-- 多选 -->
      <button
        type="button"
        role="checkbox"
        :aria-checked="selectedIds.includes(item.id)"
        :aria-label="
          selectedIds.includes(item.id) ? `取消选择 ${item.title}` : `选择 ${item.title}`
        "
        class="text-surface-800/40 hover:text-brand-600 shrink-0 rounded p-0.5 transition"
        @click.stop="emit('select', item.id)"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-4"
          :class="selectedIds.includes(item.id) ? 'text-brand-600 fill-brand-600' : 'fill-none'"
          aria-hidden="true"
        >
          <rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="3"
            :class="selectedIds.includes(item.id) ? 'stroke-brand-600' : 'stroke-surface-800/40'"
            stroke-width="1.5"
          />
          <path
            v-if="selectedIds.includes(item.id)"
            d="M4.5 8.2 7 10.6l4.5-5"
            class="stroke-white"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>

      <!-- 类型图标 -->
      <span
        class="flex size-8 shrink-0 items-center justify-center rounded-lg"
        :class="TYPE_META[item.type].chip"
      >
        <component :is="TYPE_META[item.type].icon" class="size-4" />
      </span>

      <!-- 标题 + 摘要 -->
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <p class="text-surface-900 truncate text-sm font-medium">{{ item.title }}</p>
          <Pin
            v-if="item.pinned"
            class="size-3 shrink-0 fill-amber-500 text-amber-500"
            aria-label="已置顶"
          />
          <span
            v-if="item.archived"
            class="text-surface-800/40 shrink-0 rounded-full border border-dashed px-1.5 py-0.5 text-[9px]"
          >
            已归档
          </span>
          <span
            v-if="hasReuse(item)"
            class="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/5 px-1.5 py-0.5 text-[9px] text-emerald-600/80"
          >
            复用包
          </span>
        </div>
        <p class="text-surface-800/50 mt-0.5 truncate text-xs">{{ item.summary || '暂无摘要' }}</p>
      </div>

      <!-- 标签（前 2 个） -->
      <div class="hidden w-36 shrink-0 flex-wrap gap-1 md:flex">
        <span
          v-for="t in item.tags.slice(0, 2)"
          :key="t"
          class="max-w-full truncate rounded-full px-2 py-0.5 text-[10px]"
          :class="tagCls(t)"
        >
          {{ t }}
        </span>
      </div>

      <!-- 完成日期 -->
      <span
        class="text-surface-800/50 hidden w-24 shrink-0 items-center gap-1 text-[11px] tabular-nums lg:flex"
      >
        <CalendarDays class="size-3" />
        {{ item.completedAt }}
      </span>

      <!-- 操作 -->
      <div class="flex shrink-0 items-center gap-0.5">
        <button
          v-if="manual"
          type="button"
          title="上移"
          aria-label="上移"
          class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
          @click.stop="emit('move', item.id, -1)"
        >
          <ChevronUp class="size-3.5" />
        </button>
        <button
          v-if="manual"
          type="button"
          title="下移"
          aria-label="下移"
          class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
          @click.stop="emit('move', item.id, 1)"
        >
          <ChevronDown class="size-3.5" />
        </button>
        <button
          type="button"
          :title="item.pinned ? '取消置顶' : '置顶'"
          :aria-label="item.pinned ? '取消置顶' : '置顶'"
          class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
          @click.stop="emit('pin', item.id)"
        >
          <Pin class="size-3.5" :class="item.pinned ? 'fill-current' : ''" />
        </button>
        <button
          type="button"
          title="编辑"
          aria-label="编辑"
          class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
          @click.stop="emit('edit', item)"
        >
          <Pencil class="size-3.5" />
        </button>
        <button
          type="button"
          :title="item.archived ? '取消归档' : '归档'"
          :aria-label="item.archived ? '取消归档' : '归档'"
          class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1.5 transition"
          @click.stop="emit('archive', item.id)"
        >
          <component :is="item.archived ? Inbox : Archive" class="size-3.5" />
        </button>
        <button
          type="button"
          :title="confirmingId === item.id ? '再次点击确认删除' : '删除'"
          :aria-label="confirmingId === item.id ? '再次点击确认删除' : '删除'"
          class="text-surface-800/50 rounded-md p-1.5 transition"
          :class="
            confirmingId === item.id
              ? 'bg-red-500/10 text-red-600'
              : 'hover:bg-red-500/10 hover:text-red-600'
          "
          @click.stop="askRemove(item.id)"
        >
          <Trash2 class="size-3.5" />
        </button>
      </div>
    </li>
  </ul>
</template>
