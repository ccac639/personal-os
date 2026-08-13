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
import type { Achievement } from './types';

const props = defineProps<{
  item: Achievement;
  selected: boolean;
  /** 手动排序模式下显示上移/下移 */
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

/** 两段式删除确认：首次点击进入确认态，2.5s 后或再次点击执行 */
const confirming = ref(false);
let confirmTimer: ReturnType<typeof setTimeout> | null = null;

function askRemove() {
  if (confirming.value) {
    emit('remove', props.item.id);
    resetConfirm();
    return;
  }
  confirming.value = true;
  if (confirmTimer) clearTimeout(confirmTimer);
  confirmTimer = setTimeout(resetConfirm, 2500);
}

function resetConfirm() {
  confirming.value = false;
  if (confirmTimer) {
    clearTimeout(confirmTimer);
    confirmTimer = null;
  }
}

function onAction(fn: () => void) {
  resetConfirm();
  fn();
}
</script>

<template>
  <article
    class="border-surface-100/70 bg-surface-0/70 shadow-card group hover:shadow-float relative flex cursor-pointer flex-col overflow-hidden rounded-xl border backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5"
    :class="selected ? 'border-brand-500/60 ring-brand-500/20 ring-2' : ''"
    @click="emit('open', item)"
  >
    <!-- 封面预设：类型色条（顶部，占位最小视觉锚点） -->
    <div class="h-1 w-full shrink-0" :class="TYPE_META[item.type].dot" role="presentation" />

    <div class="flex flex-1 flex-col p-3.5">
      <!-- 顶部：多选 + 类型 chip + 置顶/归档 + hover 操作 -->
      <div class="mb-2 flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5">
          <button
            type="button"
            role="checkbox"
            :aria-checked="selected"
            :aria-label="selected ? `取消选择 ${item.title}` : `选择 ${item.title}`"
            class="text-surface-800/40 hover:text-brand-600 shrink-0 rounded p-0.5 transition"
            @click.stop="emit('select', item.id)"
          >
            <svg
              viewBox="0 0 16 16"
              class="size-4"
              :class="selected ? 'text-brand-600 fill-brand-600' : 'fill-none'"
              aria-hidden="true"
            >
              <rect
                x="1"
                y="1"
                width="14"
                height="14"
                rx="3"
                :class="selected ? 'stroke-brand-600' : 'stroke-surface-800/40'"
                stroke-width="1.5"
              />
              <path
                v-if="selected"
                d="M4.5 8.2 7 10.6l4.5-5"
                class="stroke-white"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
              />
            </svg>
          </button>

          <span
            class="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium"
            :class="TYPE_META[item.type].chip"
          >
            <component :is="TYPE_META[item.type].icon" class="size-3" />
            <span class="truncate">{{ TYPE_META[item.type].label }}</span>
          </span>

          <Pin
            v-if="item.pinned"
            class="size-3.5 shrink-0 fill-amber-500 text-amber-500"
            aria-label="已置顶"
          />
          <span
            v-if="item.archived"
            class="text-surface-800/40 shrink-0 rounded-full border border-dashed px-1.5 py-0.5 text-[9px]"
          >
            已归档
          </span>
        </div>

        <div class="flex shrink-0 items-center gap-0.5">
          <div
            class="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within:opacity-100 group-hover:opacity-100"
          >
            <button
              v-if="manual"
              type="button"
              title="上移"
              aria-label="上移"
              class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1 transition"
              @click.stop="onAction(() => emit('move', item.id, -1))"
            >
              <ChevronUp class="size-3.5" />
            </button>
            <button
              v-if="manual"
              type="button"
              title="下移"
              aria-label="下移"
              class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1 transition"
              @click.stop="onAction(() => emit('move', item.id, 1))"
            >
              <ChevronDown class="size-3.5" />
            </button>
            <button
              type="button"
              :title="item.pinned ? '取消置顶' : '置顶'"
              :aria-label="item.pinned ? '取消置顶' : '置顶'"
              class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1 transition"
              @click.stop="onAction(() => emit('pin', item.id))"
            >
              <Pin class="size-3.5" :class="item.pinned ? 'fill-current' : ''" />
            </button>
            <button
              type="button"
              title="编辑"
              aria-label="编辑"
              class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1 transition"
              @click.stop="onAction(() => emit('edit', item))"
            >
              <Pencil class="size-3.5" />
            </button>
            <button
              type="button"
              :title="item.archived ? '取消归档' : '归档'"
              :aria-label="item.archived ? '取消归档' : '归档'"
              class="text-surface-800/50 hover:bg-brand-500/10 hover:text-brand-600 rounded-md p-1 transition"
              @click.stop="onAction(() => emit('archive', item.id))"
            >
              <component :is="item.archived ? Inbox : Archive" class="size-3.5" />
            </button>
            <button
              type="button"
              :title="confirming ? '再次点击确认删除' : '删除'"
              :aria-label="confirming ? '再次点击确认删除' : '删除'"
              class="text-surface-800/50 rounded-md p-1 transition hover:bg-red-500/10"
              :class="confirming ? 'bg-red-500/10 text-red-600' : 'hover:text-red-600'"
              @click.stop="askRemove"
            >
              <Trash2 class="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <!-- 标题（长文本截断，不破坏布局；长描述只在详情抽屉展示） -->
      <h3 class="text-surface-900 line-clamp-2 text-sm leading-snug font-semibold break-words">
        {{ item.title }}
      </h3>

      <!-- 底部：关键标签 + 完成日期 -->
      <div class="mt-3 flex flex-1 items-end justify-between gap-2">
        <div v-if="item.tags.length" class="flex min-w-0 flex-wrap gap-1">
          <span
            v-for="t in item.tags.slice(0, 3)"
            :key="t"
            class="max-w-full truncate rounded-full px-2 py-0.5 text-[10px]"
            :class="tagCls(t)"
          >
            {{ t }}
          </span>
        </div>
        <span class="text-surface-800/50 flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
          <CalendarDays class="size-3 shrink-0" />
          {{ item.completedAt }}
        </span>
      </div>
    </div>
  </article>
</template>
