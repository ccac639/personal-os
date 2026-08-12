<script setup lang="ts">
import { Search, Star, X } from '@lucide/vue';
import { computed } from 'vue';

import { MODEL_CATEGORIES, categoryLabel } from '../models';
import { useChatStore } from '../store';

const emit = defineEmits<{ select: [] }>();

const store = useChatStore();

const query = computed({
  get: () => store.prefs.modelQuery,
  set: (v: string) => store.setModelQuery(v),
});

const empty = computed(() => store.filteredModels.length === 0);

function handleSelect(modelId: string) {
  store.setCurrentModel(modelId);
  emit('select');
}
</script>

<template>
  <div class="flex min-h-0 flex-col">
    <!-- 模型类别切换 -->
    <div class="flex items-center gap-1 px-3 pb-2" role="tablist" aria-label="模型类别">
      <button
        v-for="c in MODEL_CATEGORIES"
        :key="c.key"
        role="tab"
        class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
        :class="store.prefs.modelFilter === c.key ? 'bg-surface-100 text-surface-900' : ''"
        :aria-selected="store.prefs.modelFilter === c.key"
        @click="store.setModelFilter(c.key)"
      >
        <span class="size-1.5 shrink-0 rounded-full" :style="{ background: c.color }" />
        {{ c.label }}
      </button>
    </div>

    <!-- 模型搜索 + 仅看收藏 -->
    <div class="flex items-center gap-1.5 px-3 pb-2">
      <div
        class="border-surface-100 focus-within:border-brand-500 bg-surface-50 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border px-2 transition-colors"
      >
        <Search class="text-surface-800/40 size-3.5 shrink-0" />
        <input
          v-model="query"
          class="bg-transparent h-7 w-full min-w-0 text-xs outline-none placeholder:text-surface-800/40"
          type="text"
          placeholder="搜索模型…"
          aria-label="搜索模型"
        />
        <button
          v-if="query"
          class="text-surface-800/40 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
          aria-label="清空模型搜索"
          title="清空模型搜索"
          @click="query = ''"
        >
          <X class="size-3" />
        </button>
      </div>
      <button
        class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
        :class="store.prefs.showFavoritesOnly ? 'bg-surface-100 text-amber-500' : 'text-surface-800/50 hover:text-surface-900'"
        :aria-pressed="store.prefs.showFavoritesOnly"
        aria-label="仅看收藏模型"
        title="仅看收藏模型"
        @click="store.toggleShowFavoritesOnly()"
      >
        <Star class="size-3.5" :class="store.prefs.showFavoritesOnly ? 'fill-current' : ''" />
      </button>
    </div>

    <!-- 模型列表 -->
    <div class="scrollbar-thin min-h-0 flex-1 space-y-1 overflow-y-auto px-2.5 pb-1">
      <div
        v-for="m in store.filteredModels"
        :key="m.id"
        class="group relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors"
        :class="[
          store.currentModel === m.id
            ? 'bg-surface-100 ring-brand-500/40 ring-1'
            : 'hover:bg-surface-100/70',
          !m.available ? 'opacity-55' : '',
        ]"
        role="button"
        :tabindex="0"
        :aria-label="`选择模型 ${m.label}`"
        :aria-current="store.currentModel === m.id ? 'true' : undefined"
        @click="handleSelect(m.id)"
        @keydown.enter="handleSelect(m.id)"
        @keydown.space.prevent="handleSelect(m.id)"
      >
        <!-- 字母头像（语义色） -->
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          :style="{ background: m.color }"
        >
          {{ m.label.slice(0, 1) }}
        </span>

        <span class="min-w-0 flex-1">
          <span class="flex items-center gap-1.5">
            <span class="text-surface-900 truncate text-xs font-medium">{{ m.label }}</span>
            <span
              v-if="!m.available"
              class="text-surface-800/40 border-surface-100 rounded border px-1 text-[9px]"
            >未接入</span>
          </span>
          <span class="text-surface-800/45 block truncate text-[11px]">
            {{ m.description }}
          </span>
        </span>

        <span
          class="shrink-0 rounded px-1 py-0.5 text-[9px] font-medium"
          :style="{ color: m.color, background: 'color-mix(in srgb, ' + m.color + ' 12%, transparent)' }"
        >
          {{ categoryLabel(m.id) }}
        </span>

        <button
          class="hover:text-amber-500 focus-visible:ring-brand-500/40 absolute right-1.5 top-1.5 hidden size-5 items-center justify-center rounded transition-colors group-hover:flex focus-visible:outline-none focus-visible:ring-2"
          :class="store.isFavorite(m.id) ? 'text-amber-500' : 'text-surface-800/35'"
          :aria-label="store.isFavorite(m.id) ? `取消收藏 ${m.label}` : `收藏 ${m.label}`"
          :title="store.isFavorite(m.id) ? '取消收藏' : '收藏'"
          @click.stop="store.toggleFavorite(m.id)"
        >
          <Star class="size-3" :class="store.isFavorite(m.id) ? 'fill-current' : ''" />
        </button>
      </div>

      <p v-if="empty" class="text-surface-800/40 px-2 pt-3 text-center text-[11px]">
        没有匹配的模型
      </p>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgb(15 23 42 / 0.14);
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
</style>
