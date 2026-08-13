<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Folder,
  ListPlus,
  Pencil,
  Plus,
  Trash2,
  X,
} from '@lucide/vue';
import { COLLECTION_COLORS, DEFAULT_COLLECTION_COLOR } from './constants';
import { useOverlayFocus } from './overlay';
import { emptyCollectionDraft } from './storage';
import type { Achievement, AchievementCollection, CollectionDraft } from './types';

const props = defineProps<{
  collections: AchievementCollection[];
  /** 全部成果（添加成员与失效引用判断用） */
  items: Achievement[];
  activeCollectionId: string | null;
}>();

const emit = defineEmits<{
  create: [draft: CollectionDraft];
  update: [id: string, patch: Partial<CollectionDraft> | { achievementIds: string[] }];
  remove: [id: string];
  open: [id: string];
  'add-items': [colId: string, ids: string[]];
  'remove-item': [colId: string, achievementId: string];
  'move-item': [colId: string, achievementId: string, dir: -1 | 1];
  export: [id: string];
}>();

const byId = computed(() => new Map(props.items.map((a) => [a.id, a])));

/** 集合内成果（保留集合顺序；失效引用在管理弹窗中标记） */
function contained(col: AchievementCollection): Achievement[] {
  const map = byId.value;
  return col.achievementIds
    .map((id) => map.get(id))
    .filter((a): a is Achievement => a !== undefined);
}

function titleOf(id: string): string {
  return byId.value.get(id)?.title ?? '（已失效的成果）';
}

/* ---------- 创建 / 编辑弹窗 ---------- */
const formVisible = ref(false);
const editingId = ref<string | null>(null);
const form = reactive<CollectionDraft>({ ...emptyCollectionDraft() });
const formPanel = ref<HTMLElement | null>(null);
const formError = ref('');

useOverlayFocus({
  visible: () => formVisible.value,
  onEscape: () => closeForm(),
  container: formPanel,
});

function openCreate() {
  editingId.value = null;
  form.name = '';
  form.description = '';
  form.color = DEFAULT_COLLECTION_COLOR;
  formError.value = '';
  formVisible.value = true;
}

function openEdit(col: AchievementCollection) {
  editingId.value = col.id;
  form.name = col.name;
  form.description = col.description;
  form.color = col.color;
  formError.value = '';
  formVisible.value = true;
}

function closeForm() {
  formVisible.value = false;
  editingId.value = null;
}

function submitForm() {
  if (!form.name.trim()) {
    formError.value = '请填写集合名称';
    return;
  }
  if (editingId.value) emit('update', editingId.value, { ...form });
  else emit('create', { ...form });
  closeForm();
}

/* ---------- 管理弹窗（成员排序 / 移除 / 添加） ---------- */
const manageColId = ref<string | null>(null);
const managePanel = ref<HTMLElement | null>(null);
/** 待添加的候选选中集 */
const addingIds = ref<string[]>([]);

const manageCol = computed(() =>
  manageColId.value ? (props.collections.find((c) => c.id === manageColId.value) ?? null) : null,
);

/** 不在集合内的候选成果（按完成日期降序，最多展示 50 条防卡顿） */
const candidates = computed(() => {
  const col = manageCol.value;
  if (!col) return [];
  const inSet = new Set(col.achievementIds);
  return props.items
    .filter((a) => !inSet.has(a.id))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 50);
});

useOverlayFocus({
  visible: () => manageColId.value !== null,
  onEscape: () => closeManage(),
  container: managePanel,
});

function openManage(col: AchievementCollection) {
  manageColId.value = col.id;
  addingIds.value = [];
}

function closeManage() {
  manageColId.value = null;
  addingIds.value = [];
}

function toggleAdding(id: string) {
  addingIds.value = addingIds.value.includes(id)
    ? addingIds.value.filter((x) => x !== id)
    : [...addingIds.value, id];
}

function confirmAdd() {
  if (manageColId.value && addingIds.value.length > 0) {
    emit('add-items', manageColId.value, addingIds.value);
  }
  addingIds.value = [];
}

/* ---------- 两段式删除 ---------- */
const confirmingDeleteId = ref<string | null>(null);
let deleteTimer: ReturnType<typeof setTimeout> | null = null;

function askRemove(col: AchievementCollection) {
  if (confirmingDeleteId.value === col.id) {
    emit('remove', col.id);
    resetDelete();
    return;
  }
  confirmingDeleteId.value = col.id;
  if (deleteTimer) clearTimeout(deleteTimer);
  deleteTimer = setTimeout(resetDelete, 2500);
}

function resetDelete() {
  confirmingDeleteId.value = null;
  if (deleteTimer) {
    clearTimeout(deleteTimer);
    deleteTimer = null;
  }
}

watch(
  () => props.collections,
  () => resetDelete(),
);
</script>

<template>
  <section class="space-y-3" aria-label="成果集合">
    <div class="flex items-center justify-between">
      <h2 class="text-surface-900 flex items-center gap-2 text-sm font-semibold">
        <Folder class="text-brand-600 size-4" />
        成果集合
        <span class="text-surface-800/50 text-xs font-normal tabular-nums">
          {{ collections.length }} 个
        </span>
      </h2>
      <button
        type="button"
        class="border-brand-500/30 text-brand-600 hover:bg-brand-500/10 flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition"
        @click="openCreate"
      >
        <Plus class="size-3.5" />
        新建集合
      </button>
    </div>

    <div
      v-if="collections.length === 0"
      class="border-surface-100/70 bg-surface-0/70 text-surface-800/50 rounded-xl border border-dashed px-4 py-6 text-center text-xs"
    >
      还没有集合：把主题相近的成果归档到一起，便于回顾与复用。
    </div>

    <div v-else class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <article
        v-for="col in collections"
        :key="col.id"
        class="border-surface-100/70 bg-surface-0/70 shadow-card overflow-hidden rounded-xl border backdrop-blur-xl transition"
        :class="
          activeCollectionId === col.id
            ? 'ring-brand-500/40 border-brand-500/50 ring-2'
            : 'hover:shadow-float'
        "
      >
        <!-- 封面色条 -->
        <div class="h-1.5 w-full" :style="{ backgroundColor: col.color }" role="presentation" />

        <div class="space-y-2.5 p-3.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <h3 class="text-surface-900 truncate text-sm font-semibold">{{ col.name }}</h3>
              <p class="text-surface-800/50 mt-0.5 truncate text-[11px]">
                {{ col.description || '暂无说明' }}
              </p>
            </div>
            <span
              class="bg-surface-100/80 text-surface-800/70 shrink-0 rounded-full px-2 py-0.5 text-[10px] tabular-nums"
            >
              {{ col.achievementIds.length }} 项
            </span>
          </div>

          <!-- 成员预览（前 3 个） -->
          <ul class="min-h-6 space-y-1">
            <li
              v-for="a in contained(col).slice(0, 3)"
              :key="a.id"
              class="text-surface-800/70 truncate text-[11px]"
            >
              · {{ a.title }}
            </li>
            <li
              v-if="col.achievementIds.length > contained(col).length"
              class="text-[11px] text-red-600/70"
            >
              含 {{ col.achievementIds.length - contained(col).length }} 个失效引用
            </li>
            <li v-if="contained(col).length === 0" class="text-surface-800/40 text-[11px]">
              空集合，点击「管理成果」添加
            </li>
          </ul>

          <div class="flex flex-wrap items-center gap-1.5 pt-1">
            <button
              type="button"
              class="bg-brand-500/10 text-brand-600 flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-medium transition hover:opacity-85"
              @click="emit('open', col.id)"
            >
              <Eye class="size-3" />
              {{ activeCollectionId === col.id ? '查看中' : '查看' }}
            </button>
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition"
              @click="openManage(col)"
            >
              <ListPlus class="size-3" />
              管理成果
            </button>
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition"
              @click="openEdit(col)"
            >
              <Pencil class="size-3" />
              编辑
            </button>
            <button
              type="button"
              class="border-surface-100 text-surface-800/70 hover:bg-surface-50 flex items-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] transition"
              @click="emit('export', col.id)"
            >
              <Download class="size-3" />
              导出
            </button>
            <button
              type="button"
              class="ml-auto flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] transition"
              :class="
                confirmingDeleteId === col.id
                  ? 'bg-red-500/10 text-red-600'
                  : 'text-surface-800/50 hover:bg-red-500/10 hover:text-red-600'
              "
              @click="askRemove(col)"
            >
              <Trash2 class="size-3" />
              {{ confirmingDeleteId === col.id ? '确认删除' : '删除' }}
            </button>
          </div>
        </div>
      </article>
    </div>

    <!-- 创建 / 编辑弹窗 -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="formVisible"
          class="fixed inset-0 z-[62] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          @click.self="closeForm"
        >
          <div
            ref="formPanel"
            class="border-surface-100/70 bg-surface-0/95 shadow-float w-full max-w-sm rounded-xl border backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            :aria-label="editingId ? '编辑集合' : '新建集合'"
          >
            <header
              class="border-surface-100/70 flex items-center justify-between border-b px-5 py-3.5"
            >
              <h3 class="text-surface-900 text-sm font-semibold">
                {{ editingId ? '编辑集合' : '新建集合' }}
              </h3>
              <button
                type="button"
                title="关闭"
                aria-label="关闭"
                class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
                @click="closeForm"
              >
                <X class="size-4" />
              </button>
            </header>

            <div class="space-y-4 px-5 py-4">
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="col-form-name"
                >
                  集合名称 *
                </label>
                <input
                  id="col-form-name"
                  v-model="form.name"
                  type="text"
                  maxlength="60"
                  placeholder="例如：2026 上半年精选"
                  class="border-surface-100 bg-surface-50/60 text-surface-900 focus:border-brand-500 w-full rounded-lg border px-3 py-2 text-[13px] transition outline-none"
                  @input="formError = ''"
                />
              </div>
              <div>
                <label
                  class="text-surface-800/80 mb-1 block text-xs font-medium"
                  for="col-form-desc"
                >
                  说明
                </label>
                <textarea
                  id="col-form-desc"
                  v-model="form.description"
                  rows="2"
                  placeholder="这个集合收录什么成果…"
                  class="border-surface-100 bg-surface-50/60 text-surface-900 focus:border-brand-500 w-full resize-none rounded-lg border px-3 py-2 text-[13px] transition outline-none"
                />
              </div>
              <fieldset>
                <legend class="text-surface-800/80 mb-1.5 text-xs font-medium">封面色</legend>
                <div class="flex flex-wrap gap-2">
                  <button
                    v-for="c in COLLECTION_COLORS"
                    :key="c.value"
                    type="button"
                    :title="c.label"
                    :aria-label="`封面色 ${c.label}`"
                    class="size-7 rounded-full transition"
                    :class="
                      form.color === c.value
                        ? 'ring-surface-900 ring-2 ring-offset-2'
                        : 'hover:scale-110'
                    "
                    :style="{ backgroundColor: c.value }"
                    @click="form.color = c.value"
                  />
                </div>
              </fieldset>
              <p v-if="formError" class="text-xs text-red-600">{{ formError }}</p>
            </div>

            <footer
              class="border-surface-100/70 flex items-center justify-end gap-2 border-t px-5 py-3.5"
            >
              <button
                type="button"
                class="border-surface-100 text-surface-800/70 hover:bg-surface-50 rounded-lg border px-3 py-2 text-xs font-medium transition"
                @click="closeForm"
              >
                取消
              </button>
              <button
                type="button"
                class="bg-brand-500 hover:bg-brand-600 rounded-lg px-4 py-2 text-xs font-medium text-white shadow-sm transition"
                @click="submitForm"
              >
                {{ editingId ? '保存修改' : '创建集合' }}
              </button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 管理弹窗（成员排序 / 移除 / 添加） -->
    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="manageCol"
          class="fixed inset-0 z-[62] flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
          @click.self="closeManage"
        >
          <div
            ref="managePanel"
            class="border-surface-100/70 bg-surface-0/95 shadow-float flex max-h-[82vh] w-full max-w-lg flex-col rounded-xl border backdrop-blur-xl"
            role="dialog"
            aria-modal="true"
            :aria-label="`管理集合 ${manageCol.name}`"
          >
            <header
              class="border-surface-100/70 flex items-center justify-between border-b px-5 py-3.5"
            >
              <h3 class="text-surface-900 text-sm font-semibold">
                管理集合「{{ manageCol.name }}」
              </h3>
              <button
                type="button"
                title="关闭"
                aria-label="关闭"
                class="text-surface-800/50 hover:bg-surface-50 hover:text-surface-900 rounded-md p-1.5 transition"
                @click="closeManage"
              >
                <X class="size-4" />
              </button>
            </header>

            <div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <!-- 现有成员（有序 + 上移/下移 + 移除） -->
              <section>
                <h4 class="text-surface-800/80 mb-2 text-xs font-medium">
                  成员（{{ manageCol.achievementIds.length }}，可手动排序）
                </h4>
                <ul v-if="manageCol.achievementIds.length > 0" class="space-y-1.5">
                  <li
                    v-for="(id, i) in manageCol.achievementIds"
                    :key="id"
                    class="border-surface-100/80 bg-surface-50/60 flex items-center gap-1.5 rounded-lg border px-2.5 py-2"
                  >
                    <span
                      class="text-surface-800/40 w-5 shrink-0 text-right text-[10px] tabular-nums"
                    >
                      {{ i + 1 }}
                    </span>
                    <span class="text-surface-800/80 min-w-0 flex-1 truncate text-xs">
                      {{ titleOf(id) }}
                    </span>
                    <button
                      type="button"
                      :disabled="i === 0"
                      title="上移"
                      aria-label="上移"
                      class="text-surface-800/50 hover:text-brand-600 rounded p-1 transition disabled:opacity-30"
                      @click="emit('move-item', manageCol.id, id, -1)"
                    >
                      <ChevronUp class="size-3.5" />
                    </button>
                    <button
                      type="button"
                      :disabled="i === manageCol.achievementIds.length - 1"
                      title="下移"
                      aria-label="下移"
                      class="text-surface-800/50 hover:text-brand-600 rounded p-1 transition disabled:opacity-30"
                      @click="emit('move-item', manageCol.id, id, 1)"
                    >
                      <ChevronDown class="size-3.5" />
                    </button>
                    <button
                      type="button"
                      :title="titleOf(id) === '（已失效的成果）' ? '清除失效引用' : '移出集合'"
                      aria-label="移出集合"
                      class="text-surface-800/50 rounded p-1 transition hover:bg-red-500/10 hover:text-red-600"
                      @click="emit('remove-item', manageCol.id, id)"
                    >
                      <X class="size-3.5" />
                    </button>
                  </li>
                </ul>
                <p v-else class="text-surface-800/40 text-xs">暂无成员，从下方添加。</p>
              </section>

              <!-- 添加候选 -->
              <section>
                <h4 class="text-surface-800/80 mb-2 text-xs font-medium">添加成果</h4>
                <ul
                  v-if="candidates.length > 0"
                  class="bg-surface-50/60 border-surface-100/80 max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2"
                >
                  <li v-for="a in candidates" :key="a.id" class="flex items-center gap-2">
                    <input
                      :id="`add-${a.id}`"
                      type="checkbox"
                      :checked="addingIds.includes(a.id)"
                      class="shrink-0 accent-[color:var(--color-brand-500)]"
                      @change="toggleAdding(a.id)"
                    />
                    <label
                      :for="`add-${a.id}`"
                      class="text-surface-800/80 min-w-0 flex-1 truncate text-xs"
                    >
                      {{ a.completedAt }} · {{ a.title }}
                    </label>
                  </li>
                </ul>
                <p v-else class="text-surface-800/40 text-xs">
                  没有可添加的成果（全部已在集合内）。
                </p>
                <button
                  type="button"
                  class="bg-brand-500/10 text-brand-600 hover:bg-brand-500/20 mt-2 flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition disabled:opacity-40"
                  :disabled="addingIds.length === 0"
                  @click="confirmAdd"
                >
                  <Plus class="size-3" />
                  添加所选（{{ addingIds.length }}）
                </button>
              </section>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>
