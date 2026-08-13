<script setup lang="ts">
import { ref } from 'vue';
import {
  Archive,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  FolderKanban,
  GitBranch,
  Inbox,
  Package,
  Pencil,
  Pin,
  Trash2,
  Workflow,
} from '@lucide/vue';
import { TYPE_META, tagCls } from './constants';
import { hasReuse } from './reuse';
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
    class="border-surface-100/70 bg-surface-0/70 shadow-card group hover:shadow-float relative flex cursor-pointer flex-col rounded-xl border p-4 backdrop-blur-xl transition-all duration-200 hover:-translate-y-0.5"
    :class="selected ? 'border-brand-500/60 ring-brand-500/20 ring-2' : ''"
    @click="emit('open', item)"
  >
    <!-- 顶部：多选 + 类型 chip + 置顶标记 + hover 操作 -->
    <div class="mb-2.5 flex items-center justify-between gap-2">
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

    <!-- 标题 + 摘要（长文本截断，不破坏布局） -->
    <h3 class="text-surface-900 line-clamp-2 text-sm leading-snug font-semibold break-words">
      {{ item.title }}
    </h3>
    <p class="text-surface-800/60 mt-1 line-clamp-2 text-xs leading-relaxed break-words">
      {{ item.summary || '暂无摘要' }}
    </p>

    <!-- 关键指标预览（前 2 项；无数据时显示占位而非 0） -->
    <div v-if="item.metrics.length > 0" class="mt-2.5 flex flex-wrap gap-1.5">
      <span
        v-for="m in item.metrics.slice(0, 2)"
        :key="m.label"
        class="bg-surface-50 border-surface-100/80 text-surface-800/70 rounded-md border px-1.5 py-0.5 text-[10px]"
      >
        {{ m.label }}
        <span class="text-surface-900 font-medium tabular-nums">{{ m.value || '—' }}</span>
      </span>
    </div>
    <p v-else class="text-surface-800/35 mt-2.5 text-[10px]">暂无关键指标</p>

    <!-- 关系 / 复用角标（只读引用计数，不展开详情） -->
    <div
      v-if="
        item.relations.projectIds.length > 0 ||
        item.relations.workflowIds.length > 0 ||
        item.relations.predecessorIds.length > 0 ||
        item.relations.derivedIds.length > 0 ||
        hasReuse(item)
      "
      class="mt-2 flex flex-wrap gap-1.5"
    >
      <span
        v-if="item.relations.projectIds.length > 0"
        class="text-brand-600/80 flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px]"
      >
        <FolderKanban class="size-2.5" />
        项目 {{ item.relations.projectIds.length }}
      </span>
      <span
        v-if="item.relations.workflowIds.length > 0"
        class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-600/80"
      >
        <Workflow class="size-2.5" />
        工作流 {{ item.relations.workflowIds.length }}
      </span>
      <span
        v-if="item.relations.predecessorIds.length > 0 || item.relations.derivedIds.length > 0"
        class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-amber-600/80"
      >
        <GitBranch class="size-2.5" />
        关联 {{ item.relations.predecessorIds.length + item.relations.derivedIds.length }}
      </span>
      <span
        v-if="hasReuse(item)"
        class="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-emerald-600/80"
      >
        <Package class="size-2.5" />
        复用包
      </span>
    </div>

    <!-- 底部：标签 + 日期/关联项目 -->
    <div class="mt-3 flex flex-1 flex-col justify-end gap-2">
      <div v-if="item.tags.length" class="flex flex-wrap gap-1">
        <span
          v-for="t in item.tags.slice(0, 3)"
          :key="t"
          class="max-w-full truncate rounded-full px-2 py-0.5 text-[10px]"
          :class="tagCls(t)"
        >
          {{ t }}
        </span>
      </div>
      <div class="text-surface-800/50 flex items-center justify-between gap-2 text-[10px]">
        <span class="flex min-w-0 items-center gap-1">
          <CalendarDays class="size-3 shrink-0" />
          <span class="truncate">{{ item.completedAt }}</span>
        </span>
        <span v-if="item.relatedProject" class="flex min-w-0 items-center gap-1">
          <FolderKanban class="size-3 shrink-0" />
          <span class="truncate">{{ item.relatedProject }}</span>
        </span>
      </div>
    </div>
  </article>
</template>
