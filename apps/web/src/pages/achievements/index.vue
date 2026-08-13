<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AlertTriangle, CircleCheck, Download, FileJson, SearchX } from '@lucide/vue';
import { useAchievementStore } from '@/features/achievements/store';
import {
  activeFilterCount,
  allTags,
  filterAchievements,
  filterSummary,
  monthOptions,
  sortAchievements,
  yearOptions,
} from '@/features/achievements/filters';
import { useToasts } from '@/features/achievements/toast';
import {
  buildReuseExport,
  buildReuseMarkdown,
  reuseFilename,
  reuseMarkdownFilename,
} from '@/features/achievements/reuse';
import { exportFilename } from '@/features/achievements/storage';
import { emptyFilters } from '@/features/achievements/types';
import type {
  Achievement,
  AchievementDraft,
  AchievementFilters,
  AchievementView,
  CollectionDraft,
} from '@/features/achievements/types';
import type { ImportMode, ImportPayload } from '@/features/achievements/storage';
import { useProjectStore } from '@/features/projects/store';
import { useWorkflowStore } from '@/features/workflows/store';
import AchievementStats from '@/features/achievements/achievement-stats.vue';
import AchievementCollections from '@/features/achievements/achievement-collections.vue';
import AchievementToolbar from '@/features/achievements/achievement-toolbar.vue';
import AchievementBulkBar from '@/features/achievements/achievement-bulk-bar.vue';
import AchievementCard from '@/features/achievements/achievement-card.vue';
import AchievementList from '@/features/achievements/achievement-list.vue';
import AchievementTimeline from '@/features/achievements/achievement-timeline.vue';
import AchievementDrawer from '@/features/achievements/achievement-drawer.vue';
import AchievementForm from '@/features/achievements/achievement-form.vue';
import AchievementImportDialog from '@/features/achievements/achievement-import-dialog.vue';
import AchievementConfirmDialog from '@/features/achievements/achievement-confirm-dialog.vue';
import AchievementToasts from '@/features/achievements/achievement-toasts.vue';

const store = useAchievementStore();
const toasts = useToasts();

/* ---------- 只读引用其他模块（仅读 Store，不修改） ---------- */
const projectStore = useProjectStore();
const workflowStore = useWorkflowStore();

const projectNameById = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const p of projectStore.projects) map[p.id] = p.name;
  return map;
});
const workflowNameById = computed<Record<string, string>>(() => {
  const map: Record<string, string> = {};
  for (const w of workflowStore.workflows) map[w.id] = w.name;
  return map;
});
const itemsById = computed<Record<string, Achievement>>(() => {
  const map: Record<string, Achievement> = {};
  for (const a of store.achievements) map[a.id] = a;
  return map;
});
const projectNameOf = (id: string): string | undefined => projectNameById.value[id];

/* ---------- 视图与筛选状态（store 持久化，刷新恢复） ---------- */
const view = computed<AchievementView>({
  get: () => store.ui.view,
  set: (v) => store.setView(v),
});

const filters = computed<AchievementFilters>({
  get: () => store.ui.filters,
  set: (f) => store.setFilters(f),
});

const years = computed(() => yearOptions(store.achievements));
const months = computed(() =>
  filters.value.year != null ? monthOptions(store.achievements, filters.value.year) : [],
);
const tags = computed(() => allTags(store.achievements));

/* ---------- 当前集合（导航态）：按集合成员裁剪数据源 ---------- */
const activeCollection = computed<{ id: string; name: string } | null>(() => {
  if (!store.activeCollectionId) return null;
  const col = store.collections.find((c) => c.id === store.activeCollectionId);
  return col ? { id: col.id, name: col.name } : null;
});

const baseList = computed<Achievement[]>(() => {
  if (!store.activeCollectionId) return store.achievements;
  const col = store.collections.find((c) => c.id === store.activeCollectionId);
  if (!col) return store.achievements;
  const set = new Set(col.achievementIds);
  return store.achievements.filter((a) => set.has(a.id));
});

const filtered = computed(() =>
  sortAchievements(
    filterAchievements(baseList.value, filters.value, projectNameOf),
    filters.value.sort,
  ),
);

const visibleCount = computed(() => filtered.value.length);
const totalCount = computed(() => store.achievements.length);
const activeCount = computed(() => activeFilterCount(filters.value));
const summaryParts = computed(() => filterSummary(filters.value));
const selectedSet = computed(() => new Set(store.selectedIds));
const manualSort = computed(() => filters.value.sort === 'manual');

/* ---------- 大数据列表：窗口化渲染（滚动到底加载更多，避免一次性渲染全部） ---------- */
const RENDER_PAGE = 60;
const renderLimit = ref(RENDER_PAGE);
const rendered = computed(() => filtered.value.slice(0, renderLimit.value));
const truncated = computed(() => filtered.value.length > renderLimit.value);
const sentinel = ref<HTMLElement | null>(null);
let io: IntersectionObserver | null = null;

function resetRenderWindow() {
  renderLimit.value = RENDER_PAGE;
}

watch(filtered, resetRenderWindow);

onMounted(() => {
  if (!('IntersectionObserver' in window)) return;
  io = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting) && truncated.value) {
        renderLimit.value += RENDER_PAGE;
      }
    },
    { rootMargin: '400px' },
  );
  if (sentinel.value) io.observe(sentinel.value);
});

onBeforeUnmount(() => {
  io?.disconnect();
  io = null;
});

/* ---------- 抽屉（按 id 派生，操作后自动刷新；支持前置/衍生跳转） ---------- */
const detailId = ref<string | null>(null);
const detail = computed(() => (detailId.value ? store.get(detailId.value) : null) ?? null);

function openDetail(item: Achievement) {
  detailId.value = item.id;
}

function openLinked(id: string) {
  detailId.value = id;
}

/* ---------- 表单 ---------- */
const formVisible = ref(false);
const formItemId = ref<string | null>(null);

const projectOptions = computed(() =>
  projectStore.projects.map((p) => ({ id: p.id, name: p.name })),
);
const workflowOptions = computed(() =>
  workflowStore.workflows.map((w) => ({ id: w.id, name: w.name })),
);

function startCreate() {
  formItemId.value = null;
  formVisible.value = true;
}

function startEdit(item: Achievement) {
  formItemId.value = item.id;
  formVisible.value = true;
}

function submitForm(draft: AchievementDraft) {
  if (formItemId.value) {
    store.update(formItemId.value, draft);
    toasts.push('成果已更新', 'success');
  } else {
    const created = store.add(draft);
    detailId.value = created.id;
    toasts.push('成果已创建', 'success');
  }
  formVisible.value = false;
  formItemId.value = null;
}

function handleRemove(id: string) {
  store.remove(id);
  if (detailId.value === id) detailId.value = null;
  toasts.push('成果已删除', 'success');
}

/* ---------- 批量操作 ---------- */
const pendingDeleteIds = ref<string[] | null>(null);

function requestBatchDelete() {
  if (store.selectedIds.length === 0) return;
  pendingDeleteIds.value = [...store.selectedIds];
}

function confirmBatchDelete() {
  const ids = pendingDeleteIds.value;
  if (!ids) return;
  store.batchDelete(ids);
  pendingDeleteIds.value = null;
  toasts.push(`已删除 ${ids.length} 项成果`, 'success');
}

const pendingTitles = computed(() =>
  (pendingDeleteIds.value ?? []).slice(0, 3).map((id) => store.get(id)?.title ?? ''),
);

function batchToast(message: string) {
  toasts.push(message, 'success');
}

/* ---------- 集合操作 ---------- */

function createCollection(draft: CollectionDraft) {
  const col = store.addCollection(draft);
  toasts.push(`集合「${col.name}」已创建`, 'success');
}

function updateCollection(
  id: string,
  patch: Partial<CollectionDraft> | { achievementIds: string[] },
) {
  store.updateCollection(id, patch);
  toasts.push('集合已更新', 'success');
}

function removeCollection(id: string) {
  store.removeCollection(id);
  toasts.push('集合已删除', 'success');
}

function addCollectionItems(colId: string, ids: string[]) {
  store.addToCollection(colId, ids);
  const col = store.getCollection(colId);
  toasts.push(`已向「${col?.name ?? '集合'}」添加 ${ids.length} 项`, 'success');
}

function removeCollectionItem(colId: string, achievementId: string) {
  store.removeFromCollection(colId, achievementId);
  toasts.push('已移出集合', 'success');
}

function moveCollectionItem(colId: string, achievementId: string, dir: -1 | 1) {
  store.moveCollectionItem(colId, achievementId, dir);
}

function openCollection(colId: string) {
  store.setActiveCollection(store.activeCollectionId === colId ? null : colId);
}

function clearCollection() {
  store.setActiveCollection(null);
}

/* ---------- 筛选方案 ---------- */

function saveScheme(name: string) {
  store.saveFilter(name, filters.value);
  toasts.push(`筛选方案「${name}」已保存`, 'success');
}

function applyScheme(id: string) {
  const saved = store.savedFilters.find((s) => s.id === id);
  if (!saved) return;
  store.setFilters({ ...saved.filters });
  toasts.push(`已恢复方案「${saved.name}」`, 'success');
}

function deleteScheme(id: string) {
  store.deleteSavedFilter(id);
  toasts.push('筛选方案已删除', 'success');
}

function updateScheme(id: string, patch: { name?: string; filters?: AchievementFilters }) {
  store.updateSavedFilter(id, patch);
  toasts.push('筛选方案已更新', 'success');
}

/* ---------- 导出 / 导入 ---------- */

/** 下载 JSON 文件（Blob + 临时链接） */
function downloadJson(json: string, filename: string) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportAll() {
  const json = store.exportJson('all');
  if (!json) return;
  downloadJson(json, exportFilename('all'));
  toasts.push('成果库已导出为 JSON', 'success');
}

function exportSingle(item: Achievement) {
  const json = store.exportJson('single', item.id);
  if (!json) return;
  downloadJson(json, exportFilename(`item-${item.id}`));
  toasts.push('单项成果已导出', 'success');
}

function exportCollection(colId: string) {
  const col = store.getCollection(colId);
  if (!col) return;
  const json = store.exportJson('collection', colId);
  if (!json) return;
  downloadJson(json, exportFilename(`collection-${col.id}`));
  toasts.push(`集合「${col.name}」已导出`, 'success');
}

function exportReuse(item: Achievement) {
  downloadJson(buildReuseExport(item), reuseFilename(item));
  toasts.push('复用包已导出为 JSON', 'success');
}

function exportReuseMarkdown(item: Achievement) {
  const blob = new Blob([buildReuseMarkdown(item)], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = reuseMarkdownFilename(item);
  a.click();
  URL.revokeObjectURL(url);
  toasts.push('复用包已导出为 Markdown', 'success');
}

const importVisible = ref(false);

function confirmImport(payload: ImportPayload, mode: ImportMode) {
  const outcome = store.importItems(payload, mode);
  importVisible.value = false;
  const parts = [
    mode === 'skip' ? `新增 ${outcome.added} 项，跳过 ${outcome.skipped} 项` : undefined,
    mode === 'overwrite' ? `新增 ${outcome.added} 项，覆盖 ${outcome.replaced} 项` : undefined,
    mode === 'copy' ? `新增 ${outcome.added} 项，复制 ${outcome.copied} 项` : undefined,
  ].filter(Boolean);
  const collectionParts: string[] = [];
  if (outcome.collectionAdded > 0) collectionParts.push(`集合新增 ${outcome.collectionAdded}`);
  if (outcome.collectionReplaced > 0)
    collectionParts.push(`集合覆盖 ${outcome.collectionReplaced}`);
  if (outcome.collectionSkipped > 0) collectionParts.push(`集合跳过 ${outcome.collectionSkipped}`);
  const tail = collectionParts.length > 0 ? `，${collectionParts.join('、')}` : '';
  toasts.push(`导入完成：${parts.join('，')}${tail}`, 'success');
}

/* ---------- 持久化失败非阻塞提示 ---------- */
watch(
  () => store.persistError,
  (err) => {
    if (err) toasts.push('本地保存失败：更改仅保留在当前页面', 'error');
  },
);

function clearFilters() {
  store.setFilters(emptyFilters());
}
</script>

<template>
  <div class="space-y-4 p-6">
    <!-- 标题区 -->
    <header
      class="border-surface-100/70 bg-surface-0/70 shadow-card flex items-center justify-between rounded-xl border px-5 py-4 backdrop-blur-xl"
    >
      <div class="flex items-center gap-3">
        <span
          class="bg-brand-500/10 text-brand-600 flex size-10 items-center justify-center rounded-lg"
        >
          <CircleCheck class="size-5" />
        </span>
        <div>
          <h1 class="text-surface-900 text-lg leading-tight font-semibold">已完成</h1>
          <p class="text-surface-800/50 mt-0.5 text-xs">
            个人成果归档与展示 · 共 {{ totalCount }} 项，当前显示 {{ visibleCount }} 项
            <template v-if="truncated">
              （已展示 {{ rendered.length }} 项，滚动加载更多）
            </template>
          </p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          title="导出全部成果与集合为 JSON"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
          @click="exportAll"
        >
          <Download class="size-3.5" />
          导出全库
        </button>
        <button
          type="button"
          title="从 JSON 导入成果（含集合）"
          class="border-surface-100 text-surface-800/70 hover:bg-surface-50 hover:text-surface-900 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition"
          @click="importVisible = true"
        >
          <FileJson class="size-3.5" />
          导入
        </button>
      </div>
    </header>

    <!-- 写入失败横幅（非阻塞） -->
    <div
      v-if="store.persistError"
      class="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-600"
      role="alert"
    >
      <AlertTriangle class="size-4 shrink-0" />
      本地存储不可用（配额或隐私模式），更改仅保留在当前页面，刷新后将丢失。
    </div>

    <!-- 统计概览（含年度回顾） -->
    <AchievementStats :items="store.achievements" />

    <!-- 成果集合 -->
    <AchievementCollections
      :collections="store.collections"
      :items="store.achievements"
      :active-collection-id="store.activeCollectionId"
      @create="createCollection"
      @update="updateCollection"
      @remove="removeCollection"
      @open="openCollection"
      @add-items="addCollectionItems"
      @remove-item="removeCollectionItem"
      @move-item="moveCollectionItem"
      @export="exportCollection"
    />

    <!-- 筛选工具条 -->
    <AchievementToolbar
      v-model:filters="filters"
      v-model:view="view"
      :years="years"
      :months="months"
      :tags="tags"
      :saved-filters="store.savedFilters"
      :active-collection="activeCollection"
      @clear="clearFilters"
      @create="startCreate"
      @save-scheme="saveScheme"
      @apply-scheme="applyScheme"
      @delete-scheme="deleteScheme"
      @update-scheme="updateScheme"
      @clear-collection="clearCollection"
    />

    <!-- 批量操作条 -->
    <AchievementBulkBar
      v-if="store.selectedIds.length > 0"
      :count="store.selectedIds.length"
      :visible-count="visibleCount"
      @pin="
        store.batchSetPinned(store.selectedIds, true);
        batchToast('已批量置顶');
      "
      @unpin="
        store.batchSetPinned(store.selectedIds, false);
        batchToast('已批量取消置顶');
      "
      @archive="
        store.batchSetArchived(store.selectedIds, true);
        batchToast('已批量归档');
      "
      @unarchive="
        store.batchSetArchived(store.selectedIds, false);
        batchToast('已批量取消归档');
      "
      @remove="requestBatchDelete"
      @select-all="store.setSelection(filtered.map((a) => a.id))"
      @clear="store.clearSelection"
    />

    <!-- 内容区 -->
    <section
      class="border-surface-100/70 bg-surface-0/70 shadow-card rounded-xl border backdrop-blur-xl"
    >
      <!-- 卡片视图（v-memo 避免无关变化重复渲染） -->
      <div v-if="view === 'card'" class="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
        <AchievementCard
          v-for="item in rendered"
          :key="item.id"
          v-memo="[item.id, item.pinned, item.archived, selectedSet.has(item.id)]"
          :item="item"
          :selected="selectedSet.has(item.id)"
          :manual="manualSort"
          @open="openDetail"
          @select="store.toggleSelect"
          @move="store.move"
          @pin="store.togglePin"
          @edit="startEdit"
          @archive="store.toggleArchive"
          @remove="handleRemove"
        />
      </div>

      <!-- 列表视图 -->
      <div v-else-if="view === 'list'" class="p-3">
        <AchievementList
          :items="rendered"
          :selected-ids="store.selectedIds"
          :manual="manualSort"
          @open="openDetail"
          @select="store.toggleSelect"
          @move="store.move"
          @pin="store.togglePin"
          @edit="startEdit"
          @archive="store.toggleArchive"
          @remove="handleRemove"
        />
      </div>

      <!-- 时间线视图 -->
      <div v-else class="p-4 sm:p-5">
        <AchievementTimeline
          :items="rendered"
          :selected-ids="store.selectedIds"
          :manual="manualSort"
          @open="openDetail"
          @select="store.toggleSelect"
          @move="store.move"
          @pin="store.togglePin"
          @edit="startEdit"
          @archive="store.toggleArchive"
          @remove="handleRemove"
        />
      </div>

      <!-- 窗口化加载哨兵（滚动到底加载更多） -->
      <div
        v-if="truncated"
        ref="sentinel"
        class="text-surface-800/50 flex items-center justify-center gap-2 py-4 text-xs"
      >
        <span class="bg-surface-100/70 size-2 animate-pulse rounded-full" />
        已展示 {{ rendered.length }} / {{ filtered.length }} 项，滚动加载更多
      </div>

      <!-- 空态：展示当前条件摘要 + 清空筛选 -->
      <div v-if="filtered.length === 0" class="flex flex-col items-center gap-3 px-4 py-14">
        <span
          class="bg-surface-100/70 text-surface-800/50 flex size-12 items-center justify-center rounded-full"
        >
          <SearchX class="size-5" />
        </span>
        <p class="text-surface-800/60 text-sm">
          {{ activeCount > 0 || activeCollection ? '没有符合当前条件的成果' : '还没有任何成果' }}
        </p>
        <ul v-if="summaryParts.length > 0" class="text-surface-800/50 max-w-md text-center text-xs">
          <li v-for="(part, i) in summaryParts" :key="i">{{ part }}</li>
        </ul>
        <div class="flex flex-wrap items-center justify-center gap-2">
          <button
            v-if="activeCollection"
            type="button"
            class="border-surface-100 text-surface-800/70 hover:bg-surface-50 rounded-lg border px-3 py-1.5 text-xs transition"
            @click="clearCollection"
          >
            退出集合「{{ activeCollection.name }}」
          </button>
          <button
            v-if="activeCount > 0"
            type="button"
            class="text-brand-600 hover:text-brand-700 border-brand-500/30 hover:bg-brand-500/10 rounded-lg border px-3 py-1.5 text-xs transition"
            @click="clearFilters"
          >
            清空筛选条件（{{ activeCount }}）
          </button>
          <button
            v-if="totalCount === 0"
            type="button"
            class="bg-brand-500 hover:bg-brand-600 rounded-lg px-3 py-1.5 text-xs font-medium text-white transition"
            @click="startCreate"
          >
            新增第一条成果
          </button>
        </div>
      </div>
    </section>

    <!-- 详情抽屉 -->
    <AchievementDrawer
      :item="detail"
      :project-name-by-id="projectNameById"
      :workflow-name-by-id="workflowNameById"
      :items-by-id="itemsById"
      @close="detailId = null"
      @edit="startEdit"
      @pin="store.togglePin"
      @archive="store.toggleArchive"
      @remove="handleRemove"
      @open-linked="openLinked"
      @export="exportSingle"
      @export-reuse="exportReuse"
      @export-reuse-md="exportReuseMarkdown"
    />

    <!-- 新增 / 编辑表单 -->
    <AchievementForm
      :visible="formVisible"
      :item="formItemId ? store.get(formItemId) : null"
      :project-options="projectOptions"
      :workflow-options="workflowOptions"
      :all-items="store.achievements"
      @close="
        formVisible = false;
        formItemId = null;
      "
      @submit="submitForm"
    />

    <!-- 导入 -->
    <AchievementImportDialog
      :visible="importVisible"
      :current-count="totalCount"
      :current-ids="store.achievements.map((a) => a.id)"
      @close="importVisible = false"
      @confirm="confirmImport"
    />

    <!-- 批量删除确认 -->
    <AchievementConfirmDialog
      :visible="pendingDeleteIds !== null"
      :titles="pendingTitles"
      :count="pendingDeleteIds?.length ?? 0"
      @close="pendingDeleteIds = null"
      @confirm="confirmBatchDelete"
    />

    <!-- 通知 -->
    <AchievementToasts />
  </div>
</template>
