<script setup lang="ts">
import { Archive, ArchiveRestore, Lightbulb, Pin, Star } from '@lucide/vue';

import InspirationCover from './inspiration-cover.vue';
import { inspirationCategoryLabel, inspirationSourceLabel } from '../inspiration';
import { useInspirationStore } from '../inspiration-store';
import type { ChatInspiration } from '../inspiration-types';

const props = defineProps<{ item: ChatInspiration }>();

const emit = defineEmits<{ open: [id: string]; create: [id: string] }>();

const store = useInspirationStore();

function stop(e: MouseEvent) {
  e.stopPropagation();
}

function toggleFavorite(e: MouseEvent) {
  stop(e);
  store.toggleFavorite(props.item.id);
}

function togglePinned(e: MouseEvent) {
  stop(e);
  store.togglePinned(props.item.id);
}

function toggleArchived(e: MouseEvent) {
  stop(e);
  store.toggleArchived(props.item.id);
}
</script>

<template>
  <div
    class="border-surface-100 bg-surface-0/70 hover:border-brand-500/40 hover:bg-surface-0 group flex cursor-pointer flex-col overflow-hidden rounded-xl border transition-colors"
    role="button"
    tabindex="0"
    :aria-label="`打开灵感 ${item.title}`"
    @click="emit('open', item.id)"
    @keydown.enter="emit('open', item.id)"
    @keydown.space.prevent="emit('open', item.id)"
  >
    <div class="relative">
      <InspirationCover :preset="item.visualPreset" :category="item.category" :title="item.title" />
      <div class="absolute top-2 right-2 flex items-center gap-1">
        <button
          v-if="item.pinned"
          class="bg-surface-0/90 text-amber-500 flex size-6 items-center justify-center rounded-md shadow-sm"
          :aria-label="`取消置顶 ${item.title}`"
          :title="'取消置顶'"
          @click="togglePinned"
        >
          <Pin class="size-3.5 fill-current" />
        </button>
        <button
          class="bg-surface-0/90 text-amber-500 flex size-6 items-center justify-center rounded-md shadow-sm transition-colors"
          :class="item.favorite ? '' : 'opacity-0 group-hover:opacity-100'"
          :aria-pressed="item.favorite"
          :aria-label="item.favorite ? '取消收藏' : '收藏'"
          :title="item.favorite ? '取消收藏' : '收藏'"
          @click="toggleFavorite"
        >
          <Star class="size-3.5" :class="item.favorite ? 'fill-current' : ''" />
        </button>
      </div>
    </div>

    <div class="flex min-w-0 flex-1 flex-col gap-1.5 p-3">
      <div class="flex min-w-0 items-center gap-1.5">
        <span
          class="shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
          :style="{
            color: 'var(--chat-cyan)',
            background: 'color-mix(in srgb, var(--chat-cyan) 10%, transparent)',
          }"
        >
          {{ inspirationCategoryLabel(item.category) }}
        </span>
        <span class="text-surface-800/40 truncate text-[10px]">{{ inspirationSourceLabel(item.source) }}</span>
      </div>

      <p class="text-surface-900 line-clamp-1 text-sm font-medium">{{ item.title }}</p>
      <p class="text-surface-800/60 line-clamp-2 min-h-[2.4em] text-xs leading-relaxed">{{ item.summary }}</p>

      <div class="mt-auto flex min-w-0 flex-wrap items-center gap-1 pt-1">
        <span
          v-for="t in item.tags.slice(0, 3)"
          :key="t"
          class="border-surface-100 bg-surface-50 text-surface-800/55 rounded border px-1.5 py-px text-[10px]"
        >{{ t }}</span>
        <button
          class="text-surface-800/40 hover:text-brand-600 focus-visible:ring-brand-500/40 ml-auto flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="`基于「${item.title}」创作`"
          :title="'基于此创作'"
          @click="emit('create', item.id)"
        >
          <Lightbulb class="size-3" />
          创作
        </button>
        <button
          class="text-surface-800/40 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-5 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
          :aria-label="item.archived ? '恢复' : '归档'"
          :title="item.archived ? '恢复' : '归档'"
          @click="toggleArchived"
        >
          <ArchiveRestore v-if="item.archived" class="size-3" />
          <Archive v-else class="size-3" />
        </button>
      </div>
    </div>
  </div>
</template>
