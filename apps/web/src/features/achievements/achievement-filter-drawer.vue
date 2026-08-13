<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Archive,
  Bookmark,
  Inbox,
  Pencil,
  RefreshCw,
  RotateCcw,
  Tag,
  Trash2,
  X,
} from '@lucide/vue';
import { ACHIEVEMENT_TYPES, TYPE_META } from './constants';
import { activeFilterCount } from './filters';
import { useOverlayFocus } from './overlay';
import type { AchievementFilters, SavedFilter } from './types';

const props = defineProps<{
  visible: boolean;
  filters: AchievementFilters;
  years: number[];
  months: number[];
  tags: string[];
  savedFilters: SavedFilter[];
}>();

const emit = defineEmits<{
  close: [];
  'update:filters': [filters: AchievementFilters];
  clear: [];
  'save-scheme': [name: string];
  'apply-scheme': [id: string];
  'delete-scheme': [id: string];
  'update-scheme': [id: string, patch: { name?: string; filters?: AchievementFilters }];
}>();

const panel = ref<HTMLElement | null>(null);

// 统一焦点管理：不抢焦点，Escape 关闭；Tab 陷阱；滚动锁定
useOverlayFocus({
  visible: () => props.visible,
  onEscape: () => emit('close'),
  container: panel,
});

const activeCount = computed(() => activeFilterCount(props.filters));

/* ---------- 筛选修改 ---------- */

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

/* ---------- 筛选方案 ---------- */

const schemeName = ref('');
const schemeSaved = ref(false);
/** 内联编辑中的方案 id（重命名） */
const editingSchemeId = ref<string | null>(null);
const editingSchemeName = ref('');

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

/* ---------- 静态选项 ---------- */

const ARCHIVE_TABS: { value: AchievementFilters['archived']; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: '未归档' },
  { value: 'archived', label: '已归档' },
];

const inputCls =
  'border-surface-100 bg-surface-50/60 text-surface-900 placeholder:text-surface-800/40 focus:border-brand-500 w-full rounded-lg border px-2.5 py-1.5 text-xs transition outline-none';

const sectionTitleCls = 'text-surface-800/80 mb-2 text-[11px] font-semibold tracking-wide';
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="visible"
        class="fixed inset-0 z-[65] bg-black/30 backdrop-blur-sm"
        @click.self="emit('close')"
      >
        <Transition
          enter-active-class="transition duration-300 ease-out"
          enter-from-class="translate-y-full sm:translate-x-full sm:translate-y-0"
          leave-active-class="transition duration-250 ease-in"
          leave-to-class="translate-y-full sm:translate-x-full sm:translate-y-0"
        >
          <aside
            v-if="visible"
            ref="panel"
            class="border-surface-100/70 bg-surface-0/95 shadow-float absolute inset-x-0 bottom-0 flex max-h-[86vh] w-full flex-col rounded-t-2xl border backdrop-blur-xl sm:inset-x-auto sm:top-0 sm:right-0 sm:bottom-0 sm:max-h-none sm:w-96 sm:rounded-t-none"
            role="dialog"
            aria-modal="true"
            aria-label="筛选成果"
            tabindex="-1"
          >
            <!-- 头部 -->
            <header
              class="border-surface-100/70 flex items-center justify-between gap-3 border-b px-5 py-4"
            >
              <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
                筛选成果
                <span
                  v-if="activeCount > 0"
                  class="bg-brand-500/10 text-brand-600 rounded-full px-2 py-0.5 text-[10px] font-medium tabular-nums"
                >
                  {{ activeCount }} 项生效
                </span>
              </h2>
              <button
                type="button"
                title="关闭（Esc）"
                aria-label="关闭筛选"
                class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
                @click="emit('close')"
              >
                <X class="size-4" />
              </button>
            </header>

            <!-- 条件区 -->
            <div class="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <!-- 类型 -->
              <section aria-label="按类型筛选">
                <h3 :class="sectionTitleCls">类型</h3>
                <div class="flex flex-wrap gap-1.5">
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
              </section>

              <!-- 完成时间 -->
              <section aria-label="按完成时间筛选">
                <h3 :class="sectionTitleCls">完成时间</h3>
                <div class="flex items-center gap-2">
                  <select
                    class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-50/60 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="filters.year ?? ''"
                    aria-label="按年份筛选"
                    @change="setYear(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">全部年份</option>
                    <option v-for="y in years" :key="y" :value="y">{{ y }} 年</option>
                  </select>
                  <select
                    v-if="filters.year != null"
                    class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-50/60 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    :value="filters.month ?? ''"
                    aria-label="按月份筛选"
                    @change="setMonth(($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">全部月份</option>
                    <option v-for="m in months" :key="m" :value="m">{{ m }} 月</option>
                  </select>
                </div>
              </section>

              <!-- 归档状态 -->
              <section aria-label="按归档状态筛选">
                <h3 :class="sectionTitleCls">归档状态</h3>
                <div
                  class="border-surface-100 bg-surface-0/70 inline-flex items-center rounded-lg border p-0.5"
                  role="group"
                >
                  <button
                    v-for="tab in ARCHIVE_TABS"
                    :key="tab.value"
                    type="button"
                    :aria-pressed="filters.archived === tab.value"
                    class="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] transition"
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
              </section>

              <!-- 标签 -->
              <section aria-label="按标签筛选">
                <h3 :class="sectionTitleCls">标签</h3>
                <div v-if="tags.length > 0" class="max-h-36 space-y-1 overflow-y-auto pr-1">
                  <button
                    v-for="t in tags"
                    :key="t"
                    type="button"
                    :aria-pressed="filters.tags.includes(t)"
                    class="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[11px] transition"
                    :class="
                      filters.tags.includes(t)
                        ? 'bg-brand-500/10 text-brand-600'
                        : 'text-surface-800/60 hover:bg-surface-50 hover:text-surface-900'
                    "
                    @click="toggleTag(t)"
                  >
                    <span class="flex min-w-0 items-center gap-1.5">
                      <Tag class="size-3 shrink-0" />
                      <span class="truncate">{{ t }}</span>
                    </span>
                    <X v-if="filters.tags.includes(t)" class="size-3 shrink-0" />
                  </button>
                </div>
                <p v-else class="text-surface-800/40 text-xs">暂无标签</p>
              </section>

              <!-- 结构化搜索 -->
              <section aria-label="结构化搜索">
                <h3 :class="sectionTitleCls">结构化搜索</h3>
                <div class="space-y-2">
                  <div>
                    <label class="text-surface-800/60 mb-1 block text-[10px]" for="fdraw-title">
                      标题包含
                    </label>
                    <input
                      id="fdraw-title"
                      :value="filters.titleQuery"
                      type="text"
                      :class="inputCls"
                      placeholder="标题关键词"
                      @input="patch({ titleQuery: ($event.target as HTMLInputElement).value })"
                    />
                  </div>
                  <div>
                    <label class="text-surface-800/60 mb-1 block text-[10px]" for="fdraw-desc">
                      描述包含
                    </label>
                    <input
                      id="fdraw-desc"
                      :value="filters.descQuery"
                      type="text"
                      :class="inputCls"
                      placeholder="描述关键词"
                      @input="patch({ descQuery: ($event.target as HTMLInputElement).value })"
                    />
                  </div>
                  <div>
                    <label class="text-surface-800/60 mb-1 block text-[10px]" for="fdraw-project">
                      关联项目名称
                    </label>
                    <input
                      id="fdraw-project"
                      :value="filters.projectQuery"
                      type="text"
                      :class="inputCls"
                      placeholder="如：Personal OS"
                      @input="patch({ projectQuery: ($event.target as HTMLInputElement).value })"
                    />
                  </div>
                </div>
              </section>

              <!-- 筛选方案 -->
              <section aria-label="筛选方案">
                <h3 :class="sectionTitleCls">筛选方案</h3>
                <div class="flex items-center gap-1.5">
                  <Bookmark class="text-surface-800/40 size-3.5 shrink-0" />
                  <input
                    v-model="schemeName"
                    type="text"
                    maxlength="40"
                    placeholder="方案名称"
                    aria-label="筛选方案名称"
                    class="border-surface-100 bg-surface-50/60 text-surface-900 placeholder:text-surface-800/40 min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                    @keydown.enter="saveScheme"
                  />
                  <button
                    type="button"
                    class="border-surface-100 text-surface-800/70 hover:bg-surface-50 flex shrink-0 items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition"
                    :disabled="!schemeName.trim()"
                    @click="saveScheme"
                  >
                    {{ schemeSaved ? '已保存' : '保存方案' }}
                  </button>
                </div>
                <select
                  v-if="savedFilters.length > 0"
                  class="text-surface-800/80 hover:border-surface-800/30 border-surface-100 bg-surface-50/60 mt-2 w-full rounded-lg border px-2 py-1.5 text-xs transition outline-none"
                  value=""
                  aria-label="应用保存的筛选方案"
                  @change="applyScheme"
                >
                  <option value="">应用方案…</option>
                  <option v-for="s in savedFilters" :key="s.id" :value="s.id">
                    {{ s.name }}
                  </option>
                </select>
                <ul v-if="savedFilters.length > 0" class="mt-2 space-y-1">
                  <li
                    v-for="s in savedFilters"
                    :key="s.id"
                    class="border-surface-100/80 bg-surface-50/60 flex items-center gap-1 rounded-lg border px-2 py-1.5"
                  >
                    <template v-if="editingSchemeId === s.id">
                      <input
                        v-model="editingSchemeName"
                        type="text"
                        maxlength="40"
                        :aria-label="`方案新名称：${s.name}`"
                        class="border-surface-100 text-surface-900 min-w-0 flex-1 rounded border px-1.5 py-0.5 text-[11px] outline-none"
                        @keydown.enter="saveEditScheme"
                        @keydown.esc="cancelEditScheme"
                      />
                      <button
                        type="button"
                        class="text-brand-600 shrink-0 font-medium transition"
                        :disabled="!editingSchemeName.trim()"
                        title="保存名称"
                        @click="saveEditScheme"
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        class="text-surface-800/40 hover:text-surface-900 shrink-0 transition"
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
                        class="text-surface-800/70 hover:text-brand-600 min-w-0 flex-1 truncate text-left text-[11px] transition"
                        :title="`恢复方案：${s.name}`"
                        @click="emit('apply-scheme', s.id)"
                      >
                        {{ s.name }}
                      </button>
                      <button
                        type="button"
                        class="text-surface-800/40 hover:text-brand-600 shrink-0 transition"
                        :aria-label="`编辑方案名称 ${s.name}`"
                        title="重命名"
                        @click="startEditScheme(s)"
                      >
                        <Pencil class="size-3" />
                      </button>
                      <button
                        type="button"
                        class="text-surface-800/40 hover:text-brand-600 shrink-0 transition"
                        :aria-label="`用当前筛选更新方案 ${s.name}`"
                        title="更新为当前筛选"
                        @click="refreshScheme(s)"
                      >
                        <RefreshCw class="size-3" />
                      </button>
                      <button
                        type="button"
                        class="text-surface-800/40 shrink-0 transition hover:text-red-600"
                        :aria-label="`删除方案 ${s.name}`"
                        title="删除方案"
                        @click="emit('delete-scheme', s.id)"
                      >
                        <Trash2 class="size-3" />
                      </button>
                    </template>
                  </li>
                </ul>
              </section>
            </div>

            <!-- 底部 -->
            <footer
              class="border-surface-100/70 flex items-center justify-between gap-2 border-t px-5 py-3.5"
            >
              <button
                type="button"
                class="text-surface-800/60 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1 rounded-lg border border-transparent px-2.5 py-2 text-xs font-medium transition"
                :disabled="activeCount === 0"
                @click="emit('clear')"
              >
                <RotateCcw class="size-3.5" />
                清空筛选
              </button>
              <button
                type="button"
                class="bg-brand-500 hover:bg-brand-600 rounded-lg px-4 py-2 text-xs font-medium text-white shadow-sm transition"
                @click="emit('close')"
              >
                完成
              </button>
            </footer>
          </aside>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>
