<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  BarChart3,
  Download,
  FileJson,
  Folder,
  LayoutGrid,
  List,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  X,
} from '@lucide/vue';
import { SORT_OPTIONS } from './constants';
import { activeFilterCount } from './filters';
import AchievementFilterDrawer from './achievement-filter-drawer.vue';
import type { AchievementFilters, AchievementView, SavedFilter } from './types';

const props = defineProps<{
  filters: AchievementFilters;
  years: number[];
  months: number[];
  tags: string[];
  view: AchievementView;
  savedFilters: SavedFilter[];
  /** 当前聚焦集合（导航态） */
  activeCollection: { id: string; name: string } | null;
}>();

const emit = defineEmits<{
  'update:filters': [filters: AchievementFilters];
  'update:view': [view: AchievementView];
  clear: [];
  'save-scheme': [name: string];
  'apply-scheme': [id: string];
  'delete-scheme': [id: string];
  'update-scheme': [id: string, patch: { name?: string; filters?: AchievementFilters }];
  'clear-collection': [];
  'export-all': [];
  'open-import': [];
}>();

/* ---------- 筛选抽屉（复杂筛选收纳；紧凑条展示当前生效条件） ---------- */

const filterOpen = ref(false);
const activeCount = computed(() => activeFilterCount(props.filters));
const hasActiveState = computed(() => activeCount.value > 0 || props.activeCollection !== null);

/** 当前生效筛选的摘要 chips（点击移除对应条件） */
const summaryChips = computed(() => {
  const f = props.filters;
  const chips: { key: string; label: string; clear: Partial<AchievementFilters> }[] = [];
  if (f.types.length > 0) {
    chips.push({ key: 'types', label: `类型 ${f.types.length}`, clear: { types: [] } });
  }
  if (f.year != null) {
    chips.push({
      key: 'time',
      label: f.month != null ? `${f.year} 年 ${f.month} 月` : `${f.year} 年`,
      clear: { year: null, month: null },
    });
  }
  if (f.tags.length > 0) {
    chips.push({ key: 'tags', label: `标签 ${f.tags.length}`, clear: { tags: [] } });
  }
  if (f.archived === 'archived') {
    chips.push({ key: 'archived', label: '仅已归档', clear: { archived: 'active' } });
  } else if (f.archived === 'all') {
    chips.push({ key: 'archived', label: '包含已归档', clear: { archived: 'active' } });
  }
  if (f.titleQuery.trim()) {
    chips.push({
      key: 'titleQuery',
      label: `标题含「${f.titleQuery.trim()}」`,
      clear: { titleQuery: '' },
    });
  }
  if (f.descQuery.trim()) {
    chips.push({
      key: 'descQuery',
      label: `描述含「${f.descQuery.trim()}」`,
      clear: { descQuery: '' },
    });
  }
  if (f.projectQuery.trim()) {
    chips.push({
      key: 'projectQuery',
      label: `项目「${f.projectQuery.trim()}」`,
      clear: { projectQuery: '' },
    });
  }
  return chips;
});

function patch(p: Partial<AchievementFilters>) {
  emit('update:filters', { ...props.filters, ...p });
}

/* ---------- 视图 ---------- */

const VIEWS: { value: AchievementView; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'card', label: '卡片', icon: LayoutGrid },
  { value: 'list', label: '列表', icon: List },
  { value: 'timeline', label: '时间线', icon: Rows3 },
  { value: 'overview', label: '概览', icon: BarChart3 },
  { value: 'collections', label: '集合', icon: Folder },
];

const selectCls =
  'border-surface-100 bg-surface-0/70 text-surface-800/80 hover:border-surface-800/30 rounded-lg border px-2 py-1.5 text-xs transition outline-none';

const chipCls =
  'text-surface-800/70 bg-surface-100/70 hover:bg-surface-100 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition';

const toolBtnCls =
  'border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border px-2 py-2 text-xs transition';
</script>

<template>
  <section class="space-y-2" aria-label="成果工具栏">
    <!-- 第一行：搜索 + 视图切换 + 筛选 + 排序 + 数据工具 -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          class="text-surface-800/40 pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
        />
        <input
          :value="filters.keyword"
          type="search"
          placeholder="搜索标题、摘要、标签…"
          aria-label="搜索成果"
          class="border-surface-100 bg-surface-0/70 text-surface-900 placeholder:text-surface-800/40 hover:border-surface-800/30 focus:border-brand-500 w-full rounded-lg border py-2 pr-3 pl-8 text-xs transition outline-none"
          @input="patch({ keyword: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div
        class="border-surface-100 bg-surface-0/70 shadow-card flex items-center gap-0.5 rounded-lg border p-0.5"
        role="radiogroup"
        aria-label="视图切换"
      >
        <button
          v-for="v in VIEWS"
          :key="v.value"
          type="button"
          role="radio"
          :aria-checked="view === v.value"
          :title="`${v.label}视图`"
          class="flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition"
          :class="
            view === v.value
              ? 'bg-brand-500/10 text-brand-600'
              : 'text-surface-800/50 hover:bg-surface-50 hover:text-surface-900'
          "
          @click="emit('update:view', v.value)"
        >
          <component :is="v.icon" class="size-3.5" />
          <span class="hidden sm:inline">{{ v.label }}</span>
        </button>
      </div>

      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition"
        :class="
          filterOpen || activeCount > 0
            ? 'bg-brand-500/10 text-brand-600 border-brand-500/30'
            : 'border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900'
        "
        :aria-expanded="filterOpen ? 'true' : 'false'"
        @click="filterOpen = !filterOpen"
      >
        <SlidersHorizontal class="size-3.5" />
        筛选
        <span
          v-if="activeCount > 0"
          class="bg-brand-500/15 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums"
        >
          {{ activeCount }}
        </span>
      </button>

      <select
        :class="selectCls"
        :value="filters.sort"
        aria-label="排序方式"
        @change="
          patch({ sort: ($event.target as HTMLSelectElement).value as AchievementFilters['sort'] })
        "
      >
        <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>

      <div class="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          :class="toolBtnCls"
          title="导出全部成果与集合为 JSON"
          aria-label="导出全库"
          @click="emit('export-all')"
        >
          <Download class="size-3.5" />
          <span class="hidden md:inline">导出</span>
        </button>
        <button
          type="button"
          :class="toolBtnCls"
          title="从 JSON 导入成果（含集合）"
          aria-label="导入成果"
          @click="emit('open-import')"
        >
          <FileJson class="size-3.5" />
          <span class="hidden md:inline">导入</span>
        </button>
      </div>
    </div>

    <!-- 第二行：紧凑筛选条（默认折叠态，点击 chip 移除对应条件） -->
    <div
      v-if="hasActiveState"
      class="border-surface-100/70 bg-surface-0/70 flex flex-wrap items-center gap-1.5 rounded-lg border px-2.5 py-1.5"
    >
      <span class="text-brand-600 flex items-center gap-1 text-[11px] font-semibold">
        <SlidersHorizontal class="size-3" />
        已筛选 {{ activeCount }} 项
      </span>
      <button
        v-for="c in summaryChips"
        :key="c.key"
        type="button"
        :class="chipCls"
        :title="`移除条件：${c.label}`"
        @click="patch(c.clear)"
      >
        {{ c.label }}
        <X class="size-3" />
      </button>
      <button
        v-if="activeCollection"
        type="button"
        class="bg-brand-500/10 text-brand-600 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition hover:opacity-85"
        :title="`正在查看集合「${activeCollection.name}」，点击退出`"
        @click="emit('clear-collection')"
      >
        <Folder class="size-3" />
        集合：{{ activeCollection.name }}
        <X class="size-3" />
      </button>
      <button
        v-if="activeCount > 0"
        type="button"
        class="text-brand-600 hover:bg-brand-500/10 ml-auto flex items-center gap-1 rounded-lg border border-transparent px-2 py-1 text-[11px] font-medium transition"
        @click="emit('clear')"
      >
        <RotateCcw class="size-3" />
        清空
      </button>
    </div>

    <!-- 手动排序提示 -->
    <p v-if="filters.sort === 'manual'" class="text-surface-800/50 text-[11px]">
      手动排序模式：置顶成果始终在最前，使用卡片 / 列表 / 时间线上的 ↑ ↓ 按钮调整同组顺序。
    </p>

    <!-- 筛选抽屉 -->
    <AchievementFilterDrawer
      :visible="filterOpen"
      :filters="filters"
      :years="years"
      :months="months"
      :tags="tags"
      :saved-filters="savedFilters"
      @close="filterOpen = false"
      @update:filters="emit('update:filters', $event)"
      @clear="emit('clear')"
      @save-scheme="emit('save-scheme', $event)"
      @apply-scheme="emit('apply-scheme', $event)"
      @delete-scheme="emit('delete-scheme', $event)"
      @update-scheme="(id, p) => emit('update-scheme', id, p)"
    />
  </section>
</template>
