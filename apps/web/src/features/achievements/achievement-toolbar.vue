<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Archive,
  Bookmark,
  Folder,
  Inbox,
  LayoutGrid,
  List,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from '@lucide/vue';
import { ACHIEVEMENT_TYPES, SORT_OPTIONS, TYPE_META } from './constants';
import { activeFilterCount } from './filters';
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
  create: [];
  'save-scheme': [name: string];
  'apply-scheme': [id: string];
  'delete-scheme': [id: string];
  'update-scheme': [id: string, patch: { name?: string; filters?: AchievementFilters }];
  'clear-collection': [];
}>();

const activeCount = computed(() => activeFilterCount(props.filters));
const advancedOpen = ref(false);
const schemeName = ref('');
const schemeSaved = ref(false);
/** 内联编辑中的方案 id（重命名） */
const editingSchemeId = ref<string | null>(null);
const editingSchemeName = ref('');

function startEditScheme(s: SavedFilter) {
  editingSchemeId.value = s.id;
  editingSchemeName.value = s.name;
}

function cancelEditScheme() {
  editingSchemeId.value = null;
  editingSchemeName.value = '';
}

function saveEditScheme() {
  if (editingSchemeId.value) {
    const name = editingSchemeName.value.trim();
    if (name) emit('update-scheme', editingSchemeId.value, { name });
  }
  cancelEditScheme();
}

/** 用当前筛选条件覆盖方案快照（编辑筛选内容） */
function refreshScheme(s: SavedFilter) {
  emit('update-scheme', s.id, { filters: { ...props.filters } });
}

function patch(p: Partial<AchievementFilters>) {
  emit('update:filters', { ...props.filters, ...p });
}

function toggleType(type: (typeof ACHIEVEMENT_TYPES)[number]) {
  const types = props.filters.types.includes(type)
    ? props.filters.types.filter((t) => t !== type)
    : [...props.filters.types, type];
  patch({ types });
}

function toggleTag(tag: string) {
  const tags = props.filters.tags.includes(tag)
    ? props.filters.tags.filter((t) => t !== tag)
    : [...props.filters.tags, tag];
  patch({ tags });
}

function setYear(value: string) {
  const year = value ? Number(value) : null;
  patch({ year, month: null });
}

function setMonth(value: string) {
  patch({ month: value ? Number(value) : null });
}

function saveScheme() {
  const name = schemeName.value.trim();
  if (!name) return;
  emit('save-scheme', name);
  schemeName.value = '';
  schemeSaved.value = true;
  setTimeout(() => {
    schemeSaved.value = false;
  }, 1500);
}

function applyScheme(event: Event) {
  const id = (event.target as HTMLSelectElement).value;
  if (id) emit('apply-scheme', id);
  (event.target as HTMLSelectElement).value = '';
}

const VIEWS: { value: AchievementView; label: string; icon: typeof LayoutGrid }[] = [
  { value: 'card', label: '卡片', icon: LayoutGrid },
  { value: 'list', label: '列表', icon: List },
  { value: 'timeline', label: '时间线', icon: Rows3 },
];

const ARCHIVE_TABS: { value: AchievementFilters['archived']; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未归档' },
  { value: 'archived', label: '已归档' },
];

const selectCls =
  'border-surface-100 bg-surface-0/70 text-surface-800/80 hover:border-surface-800/30 rounded-lg border px-2 py-1.5 text-xs outline-none transition';

const inputCls =
  'border-surface-100 bg-surface-0/70 text-surface-900 placeholder:text-surface-800/40 hover:border-surface-800/30 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-xs outline-none transition';

const unselectedTagCls = computed(() =>
  props.filters.tags.length > 0
    ? 'border-surface-100 bg-surface-0/70 text-surface-800/50'
    : 'border-surface-100 bg-surface-0/70 text-surface-800/80',
);

const advancedActive = computed(
  () =>
    props.filters.titleQuery.trim() !== '' ||
    props.filters.descQuery.trim() !== '' ||
    props.filters.projectQuery.trim() !== '',
);
</script>

<template>
  <section class="space-y-3">
    <!-- 第一行：搜索 + 高级筛选 + 视图切换 + 筛选状态 + 新增 -->
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

      <button
        type="button"
        class="flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition"
        :class="
          advancedOpen || advancedActive
            ? 'bg-brand-500/10 text-brand-600 border-brand-500/30'
            : 'border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900'
        "
        :aria-expanded="advancedOpen ? 'true' : 'false'"
        @click="advancedOpen = !advancedOpen"
      >
        <SlidersHorizontal class="size-3.5" />
        高级
        <span
          v-if="advancedActive"
          class="bg-brand-500/15 rounded-full px-1.5 text-[10px] tabular-nums"
        >
          {{ advancedActive ? '●' : '' }}
        </span>
      </button>

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

      <div class="flex items-center gap-1.5">
        <button
          v-if="activeCount > 0"
          type="button"
          class="text-brand-600 hover:bg-brand-500/10 flex items-center gap-1 rounded-lg border border-transparent px-2 py-1.5 text-xs font-medium transition"
          title="清空全部筛选条件"
          @click="emit('clear')"
        >
          <RotateCcw class="size-3.5" />
          清空筛选
          <span class="bg-brand-500/15 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">
            {{ activeCount }}
          </span>
        </button>
        <button
          type="button"
          class="bg-brand-500 hover:bg-brand-600 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-white shadow-sm transition"
          @click="emit('create')"
        >
          <Plus class="size-3.5" />
          新增成果
        </button>
      </div>
    </div>

    <!-- 高级筛选面板（结构化搜索：标题 / 描述 / 关联项目名称） -->
    <div
      v-if="advancedOpen"
      class="border-surface-100/80 bg-surface-0/70 grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-3"
    >
      <div>
        <label class="text-surface-800/80 mb-1 block text-[11px] font-medium" for="adv-title">
          标题包含
        </label>
        <input
          id="adv-title"
          :value="filters.titleQuery"
          type="text"
          :class="inputCls"
          placeholder="标题关键词"
          @input="patch({ titleQuery: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div>
        <label class="text-surface-800/80 mb-1 block text-[11px] font-medium" for="adv-desc">
          描述包含
        </label>
        <input
          id="adv-desc"
          :value="filters.descQuery"
          type="text"
          :class="inputCls"
          placeholder="描述关键词"
          @input="patch({ descQuery: ($event.target as HTMLInputElement).value })"
        />
      </div>
      <div>
        <label class="text-surface-800/80 mb-1 block text-[11px] font-medium" for="adv-project">
          关联项目名称
        </label>
        <input
          id="adv-project"
          :value="filters.projectQuery"
          type="text"
          :class="inputCls"
          placeholder="如：Personal OS"
          @input="patch({ projectQuery: ($event.target as HTMLInputElement).value })"
        />
      </div>
    </div>

    <!-- 第二行：类型 chips + 归档 + 时间 + 标签 + 排序 -->
    <div class="flex flex-wrap items-center gap-2">
      <div class="flex flex-wrap items-center gap-1">
        <button
          type="button"
          aria-pressed="false"
          class="rounded-full px-2.5 py-1 text-[11px] font-medium transition"
          :class="
            filters.types.length === 0
              ? 'bg-brand-500/10 text-brand-600'
              : 'bg-surface-100/70 text-surface-800/60 hover:text-surface-900'
          "
          @click="patch({ types: [] })"
        >
          全部类型
        </button>
        <button
          v-for="t in ACHIEVEMENT_TYPES"
          :key="t"
          type="button"
          :aria-pressed="filters.types.includes(t)"
          :title="TYPE_META[t].label"
          class="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition"
          :class="
            filters.types.includes(t)
              ? 'bg-brand-500/10 text-brand-600'
              : 'bg-surface-100/70 text-surface-800/60 hover:text-surface-900'
          "
          @click="toggleType(t)"
        >
          <component :is="TYPE_META[t].icon" class="size-3" />
          {{ TYPE_META[t].label }}
        </button>
      </div>

      <span class="bg-surface-100/70 mx-1 hidden h-4 w-px sm:block" />

      <div
        class="border-surface-100 bg-surface-0/70 flex items-center rounded-lg border p-0.5"
        role="group"
        aria-label="归档状态筛选"
      >
        <button
          v-for="tab in ARCHIVE_TABS"
          :key="tab.value"
          type="button"
          :aria-pressed="filters.archived === tab.value"
          class="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition"
          :class="
            filters.archived === tab.value
              ? 'bg-brand-500/10 text-brand-600'
              : 'text-surface-800/50 hover:text-surface-900'
          "
          @click="patch({ archived: tab.value })"
        >
          <component :is="tab.value === 'archived' ? Archive : Inbox" class="size-3" />
          {{ tab.label }}
        </button>
      </div>

      <select
        class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-0/70 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        :value="filters.year ?? ''"
        aria-label="按年份筛选"
        @change="setYear(($event.target as HTMLSelectElement).value)"
      >
        <option value="">全部年份</option>
        <option v-for="y in years" :key="y" :value="y">{{ y }} 年</option>
      </select>

      <select
        v-if="filters.year != null"
        class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-0/70 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        :value="filters.month ?? ''"
        aria-label="按月份筛选"
        @change="setMonth(($event.target as HTMLSelectElement).value)"
      >
        <option value="">全部月份</option>
        <option v-for="m in months" :key="m" :value="m">{{ m }} 月</option>
      </select>

      <select
        :class="selectCls"
        value=""
        aria-label="按标签筛选"
        @change="
          const t = ($event.target as HTMLSelectElement).value;
          if (t && !filters.tags.includes(t)) toggleTag(t);
          ($event.target as HTMLSelectElement).value = '';
        "
      >
        <option value="" :class="unselectedTagCls">+ 标签</option>
        <option v-for="t in tags" :key="t" :value="t">{{ t }}</option>
      </select>

      <select
        class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-0/70 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
        :value="filters.sort"
        aria-label="排序方式"
        @change="
          patch({ sort: ($event.target as HTMLSelectElement).value as AchievementFilters['sort'] })
        "
      >
        <option v-for="o in SORT_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </div>

    <!-- 手动排序提示 -->
    <p v-if="filters.sort === 'manual'" class="text-surface-800/50 text-[11px]">
      手动排序模式：置顶成果始终在最前，使用卡片 / 列表 / 时间线上的 ↑ ↓ 按钮调整同组顺序。
    </p>

    <!-- 已选标签 chips -->
    <div v-if="filters.tags.length > 0" class="flex flex-wrap items-center gap-1.5">
      <span class="text-surface-800/50 flex items-center gap-1 text-[11px]">
        <Tag class="size-3" />
        已选标签
      </span>
      <button
        v-for="t in filters.tags"
        :key="t"
        type="button"
        class="bg-brand-500/10 text-brand-600 flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition hover:opacity-80"
        :aria-label="`移除标签 ${t}`"
        @click="toggleTag(t)"
      >
        {{ t }}
        <X class="size-3" />
      </button>
    </div>

    <!-- 当前集合 + 筛选方案 -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        v-if="activeCollection"
        type="button"
        class="bg-brand-500/10 text-brand-600 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition hover:opacity-85"
        :title="`正在查看集合「${activeCollection.name}」，点击退出`"
        @click="emit('clear-collection')"
      >
        <Folder class="size-3" />
        集合：{{ activeCollection.name }}
        <X class="size-3" />
      </button>

      <span class="bg-surface-100/70 hidden h-4 w-px sm:block" />

      <div class="flex items-center gap-1.5">
        <Bookmark class="text-surface-800/40 size-3.5" />
        <input
          v-model="schemeName"
          type="text"
          maxlength="40"
          placeholder="方案名称"
          aria-label="筛选方案名称"
          class="border-surface-100 bg-surface-0/70 text-surface-900 placeholder:text-surface-800/40 w-28 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
          @keydown.enter="saveScheme"
        />
        <button
          type="button"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition"
          :disabled="!schemeName.trim()"
          @click="saveScheme"
        >
          {{ schemeSaved ? '已保存' : '保存方案' }}
        </button>
        <select
          v-if="savedFilters.length > 0"
          class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-0/70 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
          value=""
          aria-label="应用保存的筛选方案"
          @change="applyScheme"
        >
          <option value="">应用方案…</option>
          <option v-for="s in savedFilters" :key="s.id" :value="s.id">
            {{ s.name }}
          </option>
        </select>
      </div>

      <div v-if="savedFilters.length > 0" class="flex flex-wrap items-center gap-1">
        <span
          v-for="s in savedFilters"
          :key="s.id"
          class="border-surface-100 bg-surface-50/70 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]"
        >
          <template v-if="editingSchemeId === s.id">
            <input
              v-model="editingSchemeName"
              type="text"
              maxlength="40"
              :aria-label="`方案新名称：${s.name}`"
              class="border-surface-100 text-surface-900 w-24 rounded border px-1.5 py-0.5 text-[11px] outline-none"
              @keydown.enter="saveEditScheme"
              @keydown.esc="cancelEditScheme"
            />
            <button
              type="button"
              class="text-brand-600 font-medium transition"
              :disabled="!editingSchemeName.trim()"
              title="保存名称"
              @click="saveEditScheme"
            >
              保存
            </button>
            <button
              type="button"
              class="text-surface-800/40 hover:text-surface-900 transition"
              title="取消"
              aria-label="取消编辑"
              @click="cancelEditScheme"
            >
              <X class="size-3" />
            </button>
          </template>
          <template v-else>
            <button
              type="button"
              class="text-surface-800/70 hover:text-brand-600 transition"
              :title="`恢复方案：${s.name}`"
              @click="emit('apply-scheme', s.id)"
            >
              {{ s.name }}
            </button>
            <button
              type="button"
              class="text-surface-800/40 hover:text-brand-600 transition"
              :aria-label="`编辑方案名称 ${s.name}`"
              title="重命名"
              @click="startEditScheme(s)"
            >
              <Pencil class="size-3" />
            </button>
            <button
              type="button"
              class="text-surface-800/40 hover:text-brand-600 transition"
              :aria-label="`用当前筛选更新方案 ${s.name}`"
              title="更新为当前筛选"
              @click="refreshScheme(s)"
            >
              <RefreshCw class="size-3" />
            </button>
            <button
              type="button"
              class="text-surface-800/40 transition hover:text-red-600"
              :aria-label="`删除方案 ${s.name}`"
              title="删除方案"
              @click="emit('delete-scheme', s.id)"
            >
              <Trash2 class="size-3" />
            </button>
          </template>
        </span>
      </div>
    </div>
  </section>
</template>
