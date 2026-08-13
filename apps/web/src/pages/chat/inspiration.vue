<script setup lang="ts">
/**
 * Chat 工作台 —— 灵感广场
 *
 * 个人灵感库：瀑布流 / 列表双视图（纯 CSS）、快捷视图、组合筛选、
 * 详情抽屉、新建 / 导入 / 导出、基于灵感创作、创建智能体变体。
 * 只存文本与结构化元数据，绝不包含附件与敏感字段。
 */
import {
  Archive,
  FileDown,
  FileUp,
  LayoutGrid,
  List,
  Pin,
  Plus,
  Search,
  Star,
  X,
} from '@lucide/vue';
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import InspirationCard from '@/features/chat/components/inspiration-card.vue';
import InspirationDetailDrawer from '@/features/chat/components/inspiration-detail-drawer.vue';
import InspirationImportDialog from '@/features/chat/components/inspiration-import-dialog.vue';
import InspirationSaveDialog from '@/features/chat/components/inspiration-save-dialog.vue';
import {
  INSPIRATION_CATEGORIES,
  INSPIRATION_SOURCES,
  inspirationCategoryLabel,
  inspirationSourceLabel,
} from '@/features/chat/inspiration';
import { useInspirationStore } from '@/features/chat/inspiration-store';
import type { InspirationSource } from '@/features/chat/inspiration-types';
import { useAgentsStore } from '@/features/chat/agent-store';
import { pushToast } from '@/features/chat/toast';

const store = useInspirationStore();
const agentsStore = useAgentsStore();
const router = useRouter();

const detailId = ref<string | null>(null);
const detailOpen = ref(false);
const importOpen = ref(false);
/** 新建灵感（复用保存弹窗，来源手动） */
const manualOpen = ref(false);

const quickViews = [
  { key: 'all', label: '全部' },
  { key: 'recent', label: '最近保存' },
  { key: 'favorites', label: '收藏' },
  { key: 'drafting', label: '创作中' },
  { key: 'archived', label: '已归档' },
] as const;

const sortOptions = [
  { key: 'newest', label: '最新优先' },
  { key: 'oldest', label: '最早优先' },
  { key: 'updated', label: '最近更新' },
] as const;

const filterCategory = computed({
  get: () => store.ui.filters.category,
  set: (v: string) => store.setFilters({ category: v as never }),
});

const filterSource = computed({
  get: () => store.ui.filters.source,
  set: (v: string) => store.setFilters({ source: v as InspirationSource | 'all' }),
});

const filterTag = computed({
  get: () => store.ui.filters.tag,
  set: (v: string) => store.setFilters({ tag: v }),
});

const filterKeyword = computed({
  get: () => store.ui.filters.keyword,
  set: (v: string) => store.setFilters({ keyword: v }),
});

function openDetail(id: string) {
  detailId.value = id;
  detailOpen.value = true;
}

function openNewInspiration() {
  // 复用保存弹窗：来源为手动创建
  store.pendingSave = {
    messageId: '',
    draft: {
      title: '',
      summary: '',
      prompt: '',
      category: 'other',
      tags: [],
      source: 'manual',
    },
  };
  manualOpen.value = true;
}

function onSaveDialogClose() {
  manualOpen.value = false;
}

function onCreateDraft() {
  detailOpen.value = false;
  void router.push('/chat');
  pushToast('会话已创建，草稿已填入输入框（未发送）', 'success');
}

function onAgentVariant(inspirationId: string) {
  const it = store.itemById(inspirationId);
  if (!it) return;
  agentsStore.prefillFromInspiration(inspirationId, it.title, it.prompt);
  detailOpen.value = false;
  void router.push('/chat/agents');
}
</script>

<template>
  <div class="bg-page absolute inset-0 flex overflow-hidden">
    <!-- 主区 -->
    <main class="flex min-w-0 flex-1 flex-col">
      <!-- 工具栏 -->
      <header class="flex h-11 shrink-0 items-center gap-2 border-b border-surface-100 px-3">
        <div class="min-w-0 flex-1">
          <p class="text-surface-900 truncate text-sm font-medium">灵感广场</p>
          <p class="text-surface-800/40 truncate text-[10px]">共 {{ store.itemCount }} 条 · 当前显示 {{ store.visibleItems.length }} 条</p>
        </div>

        <!-- 视图切换 -->
        <div class="flex items-center gap-0.5 rounded-lg bg-surface-50 p-0.5" role="group" aria-label="视图切换">
          <button
            class="flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            :class="store.ui.view === 'masonry' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-800/50'"
            aria-label="瀑布流视图"
            :aria-pressed="store.ui.view === 'masonry'"
            title="瀑布流"
            @click="store.setView('masonry')"
          >
            <LayoutGrid class="size-3.5" />
          </button>
          <button
            class="flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
            :class="store.ui.view === 'list' ? 'bg-surface-0 text-surface-900 shadow-sm' : 'text-surface-800/50'"
            aria-label="列表视图"
            :aria-pressed="store.ui.view === 'list'"
            title="列表"
            @click="store.setView('list')"
          >
            <List class="size-3.5" />
          </button>
        </div>

        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="导入灵感"
          title="导入灵感 JSON"
          @click="importOpen = true"
        >
          <FileUp class="size-4" />
        </button>
        <button
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="导出灵感"
          title="导出当前筛选结果"
          @click="store.exportFiltered"
        >
          <FileDown class="size-4" />
        </button>
        <button
          class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="新建灵感"
          @click="openNewInspiration"
        >
          <Plus class="size-3.5" />
          新建灵感
        </button>
      </header>

      <!-- 筛选行 -->
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b border-surface-100 px-3 py-2">
        <div class="border-surface-100 focus-within:border-brand-500 bg-surface-50 flex min-w-40 flex-1 items-center gap-1.5 rounded-lg border px-2 transition-colors">
          <Search class="text-surface-800/40 size-3.5 shrink-0" />
          <input
            v-model="filterKeyword"
            class="bg-transparent h-7 w-full min-w-0 text-xs outline-none"
            placeholder="搜索标题 / 摘要 / 提示词 / 标签"
            aria-label="搜索灵感"
          />
        </div>

        <div class="flex items-center gap-0.5 overflow-x-auto">
          <button
            v-for="qv in quickViews"
            :key="qv.key"
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.ui.quickView === qv.key ? 'bg-surface-100 text-surface-900' : ''"
            :aria-pressed="store.ui.quickView === qv.key"
            @click="store.setQuickView(qv.key)"
          >
{{ qv.label }}
</button>
        </div>

        <select
          v-model="filterCategory"
          class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1 text-[11px] outline-none"
          aria-label="按类别筛选"
        >
          <option v-for="c in INSPIRATION_CATEGORIES" :key="c.key" :value="c.key">{{ c.label }}</option>
        </select>

        <select
          v-if="store.allTags.length > 0"
          v-model="filterTag"
          class="border-surface-100 bg-surface-50 max-w-32 rounded-lg border px-2 py-1 text-[11px] outline-none"
          aria-label="按标签筛选"
        >
          <option value="">全部标签</option>
          <option v-for="t in store.allTags" :key="t" :value="t">{{ t }}</option>
        </select>

        <select
          v-model="filterSource"
          class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1 text-[11px] outline-none"
          aria-label="按来源筛选"
        >
          <option v-for="s in INSPIRATION_SOURCES" :key="s.key" :value="s.key">{{ s.label }}</option>
        </select>

        <div class="flex items-center gap-1">
          <button
            class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.ui.filters.favoritesOnly ? 'bg-surface-100 text-amber-500' : 'text-surface-800/50'"
            :aria-pressed="store.ui.filters.favoritesOnly"
            aria-label="只看收藏"
            title="只看收藏"
            @click="store.setFilters({ favoritesOnly: !store.ui.filters.favoritesOnly })"
          >
            <Star class="size-3.5" :class="store.ui.filters.favoritesOnly ? 'fill-current' : ''" />
          </button>
          <button
            class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.ui.filters.pinnedOnly ? 'bg-surface-100 text-amber-500' : 'text-surface-800/50'"
            :aria-pressed="store.ui.filters.pinnedOnly"
            aria-label="只看置顶"
            title="只看置顶"
            @click="store.setFilters({ pinnedOnly: !store.ui.filters.pinnedOnly })"
          >
            <Pin class="size-3.5" :class="store.ui.filters.pinnedOnly ? 'fill-current' : ''" />
          </button>
          <button
            class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="store.ui.filters.archived ? 'bg-surface-100 text-surface-900' : 'text-surface-800/50'"
            :aria-pressed="store.ui.filters.archived"
            aria-label="包含归档"
            title="包含归档"
            @click="store.setFilters({ archived: !store.ui.filters.archived })"
          >
            <Archive class="size-3.5" />
          </button>
        </div>

        <select
          class="border-surface-100 bg-surface-50 rounded-lg border px-2 py-1 text-[11px] outline-none"
          :value="store.ui.sort"
          aria-label="排序方式"
          @change="store.setSort(($event.target as HTMLSelectElement).value as typeof store.ui.sort)"
        >
          <option v-for="o in sortOptions" :key="o.key" :value="o.key">{{ o.label }}</option>
        </select>

        <button
          v-if="store.activeCount > 0"
          class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="清空筛选"
          @click="store.clearFilters"
        >
          <X class="size-3" />
          清空（{{ store.activeCount }}）
        </button>
      </div>

      <!-- 内容区 -->
      <div class="min-h-0 flex-1 overflow-y-auto p-3">
        <!-- 瀑布流：CSS Columns（无依赖） -->
        <div
          v-if="store.visibleItems.length > 0 && store.ui.view === 'masonry'"
          class="insp-masonry"
        >
          <div v-for="item in store.visibleItems" :key="item.id" class="mb-3 break-inside-avoid">
            <InspirationCard :item="item" @open="openDetail" @create="onCreateDraft" />
          </div>
        </div>

        <!-- 列表视图 -->
        <div v-else-if="store.visibleItems.length > 0 && store.ui.view === 'list'" class="flex flex-col gap-2">
          <div
            v-for="item in store.visibleItems"
            :key="item.id"
            class="border-surface-100 bg-surface-0/70 hover:border-brand-500/40 hover:bg-surface-0 flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors"
            role="button"
            tabindex="0"
            :aria-label="`打开灵感 ${item.title}`"
            @click="openDetail(item.id)"
            @keydown.enter="openDetail(item.id)"
            @keydown.space.prevent="openDetail(item.id)"
          >
            <span
              class="shrink-0 rounded px-1.5 py-px text-[10px] font-medium"
              :style="{
                color: 'var(--chat-cyan)',
                background: 'color-mix(in srgb, var(--chat-cyan) 10%, transparent)',
              }"
            >{{ inspirationCategoryLabel(item.category) }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-surface-900 truncate text-sm font-medium">
                <span v-if="item.pinned" class="text-amber-500" aria-label="已置顶">📌 </span>{{ item.title }}
              </p>
              <p class="text-surface-800/50 truncate text-xs">{{ item.summary }}</p>
            </div>
            <span class="text-surface-800/35 shrink-0 text-[10px]">{{ inspirationSourceLabel(item.source) }}</span>
            <Star
              class="shrink-0 text-amber-500"
              :class="item.favorite ? '' : 'opacity-0'"
              :aria-label="item.favorite ? '已收藏' : ''"
            />
          </div>
        </div>

        <!-- 空态 -->
        <div v-else class="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p class="text-surface-800/60 text-sm">还没有灵感</p>
          <p class="text-surface-800/40 max-w-xs text-xs">可以在对话中把助手回复「保存为灵感」，或直接新建一条</p>
          <div class="flex gap-2">
            <button
              class="hover:bg-brand-600 bg-brand-500 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="新建灵感"
              @click="openNewInspiration"
            >
              <Plus class="size-3.5" />
              新建灵感
            </button>
            <button
              class="hover:bg-surface-100 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
              aria-label="前往对话"
              @click="router.push('/chat')"
            >
              前往对话
            </button>
          </div>
        </div>
      </div>
    </main>

    <!-- 详情抽屉 -->
    <InspirationDetailDrawer
      :open="detailOpen"
      :item-id="detailId"
      @close="detailOpen = false"
      @created="onCreateDraft"
      @agent-variant="onAgentVariant"
    />

    <!-- 保存 / 新建弹窗 -->
    <InspirationSaveDialog @close="onSaveDialogClose" @navigate-inspiration="onSaveDialogClose" />

    <!-- 导入弹窗 -->
    <InspirationImportDialog :open="importOpen" @close="importOpen = false" />
  </div>
</template>

<style scoped>
/* 瀑布流：CSS Columns（原生，无第三方依赖） */
.insp-masonry {
  columns: 1;
  column-gap: 0.75rem;
}

@media (min-width: 640px) {
  .insp-masonry {
    columns: 2;
  }
}

@media (min-width: 1024px) {
  .insp-masonry {
    columns: 3;
  }
}

@media (min-width: 1536px) {
  .insp-masonry {
    columns: 4;
  }
}
</style>
