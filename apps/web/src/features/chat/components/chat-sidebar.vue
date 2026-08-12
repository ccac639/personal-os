<script setup lang="ts">
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  ChevronsLeft,
  ListChecks,
  PanelLeftClose,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Star,
  Trash2,
  X,
} from '@lucide/vue';
import { AnimatePresence, motion } from 'motion-v';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

import ChatModelList from './chat-model-list.vue';
import { MODEL_CATEGORIES, categoryLabel, modelById } from '../models';
import { useChatStore } from '../store';
import type { ChatSession, ChatSessionTimeFilter } from '../types';

const store = useChatStore();

/** 折叠态：窄栏只保留新建按钮；移动端 (<md) 忽略折叠，直接隐藏并用抽屉 */
const collapsed = ref(false);
/** 移动端抽屉开关（由父级通过 v-model:mobile-open 控制） */
const mobileOpen = defineModel<boolean>('mobileOpen', { default: false });

const keyword = ref('');
const pendingDeleteId = ref<string | null>(null);
const editingId = ref<string | null>(null);
const editingTitle = ref('');
/** v-for 内 ref 为数组，兼容两种情况 */
const editInput = ref<HTMLInputElement | HTMLInputElement[] | null>(null);

/** 批量选择模式（组件内状态，不持久化） */
const batchMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
/** 归档区是否展开 */
const showArchived = ref(false);

let deleteTimer: ReturnType<typeof setTimeout> | null = null;
let renameTimer: ReturnType<typeof setTimeout> | null = null;

const TIME_FILTERS: { key: ChatSessionTimeFilter; label: string }[] = [
  { key: 'all', label: '全部时间' },
  { key: 'today', label: '今天' },
  { key: 'week', label: '近 7 天' },
  { key: 'month', label: '近 30 天' },
];

/** 搜索结果：可见会话 + 命中的消息片段（标题未命中时取第一条匹配消息的上下文） */
interface SessionMatch {
  session: ChatSession;
  snippet: string | null;
}

const filtered = computed<SessionMatch[]>(() => {
  const base = store.visibleSessions;
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return base.map((s) => ({ session: s, snippet: null }));
  const result: SessionMatch[] = [];
  for (const s of base) {
    if (s.title.toLowerCase().includes(kw)) {
      result.push({ session: s, snippet: null });
      continue;
    }
    for (const m of s.messages) {
      const idx = m.content.toLowerCase().indexOf(kw);
      if (idx >= 0) {
        const start = Math.max(0, idx - 20);
        const end = Math.min(m.content.length, idx + kw.length + 30);
        const snippet =
          (start > 0 ? '…' : '') +
          m.content.slice(start, end) +
          (end < m.content.length ? '…' : '');
        result.push({ session: s, snippet });
        break;
      }
    }
  }
  return result;
});

/** 分组：置顶优先，其余按最近更新时间分「今天 / 更早」 */
const pinned = computed(() => filtered.value.filter((f) => f.session.pinned));
const unpinned = computed(() => filtered.value.filter((f) => !f.session.pinned));
const today = computed(() => unpinned.value.filter((f) => isToday(f.session.updatedAt)));
const earlier = computed(() => unpinned.value.filter((f) => !isToday(f.session.updatedAt)));
const groups = computed(() => [
  ...(pinned.value.length > 0 ? [{ key: 'pinned', label: '置顶', items: pinned.value }] : []),
  { key: 'today', label: '今天', items: today.value },
  { key: 'earlier', label: '更早', items: earlier.value },
]);

/** 当前模型摘要（底部状态条） */
const activeModel = computed(() => modelById(store.activeModelId));

const selectedCount = computed(() => selectedIds.value.size);

const modelFilter = computed({
  get: () => store.prefs.sessionModelFilter,
  set: (v: string) => store.setSessionModelFilter(v as never),
});

const timeFilter = computed({
  get: () => store.prefs.sessionTimeFilter,
  set: (v: string) => store.setSessionTimeFilter(v as never),
});

function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  if (isToday(ts)) return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** 安全高亮：纯文本分段渲染（<mark> 由模板输出，不引入未净化 v-html） */
interface HighlightPart {
  text: string;
  match: boolean;
}
function highlightParts(text: string): HighlightPart[] {
  const kw = keyword.value.trim().toLowerCase();
  if (!kw) return [{ text, match: false }];
  const lower = text.toLowerCase();
  const parts: HighlightPart[] = [];
  let i = 0;
  while (i < text.length) {
    const idx = lower.indexOf(kw, i);
    if (idx < 0) {
      parts.push({ text: text.slice(i), match: false });
      break;
    }
    if (idx > i) parts.push({ text: text.slice(i, idx), match: false });
    parts.push({ text: text.slice(idx, idx + kw.length), match: true });
    i = idx + kw.length;
  }
  return parts;
}

function handleCreate() {
  store.createSession();
  collapsed.value = false;
  mobileOpen.value = false;
  exitBatch();
}

function handleSelect(id: string) {
  store.selectSession(id);
  mobileOpen.value = false;
}

/** 选择模型后：桌面展开折叠态，移动端收起抽屉 */
function handleModelSelect() {
  collapsed.value = false;
  mobileOpen.value = false;
}

/** 会话条目键盘激活：Enter / Space 打开或勾选（批量模式） */
function handleItemKeydown(e: KeyboardEvent, id: string) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    if (batchMode.value) toggleSelect(id);
    else handleSelect(id);
  }
}

/* ---------- 批量选择 ---------- */

function enterBatch() {
  batchMode.value = true;
  selectedIds.value = new Set();
}

function exitBatch() {
  batchMode.value = false;
  selectedIds.value = new Set();
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  selectedIds.value = next;
}

function selectAllVisible() {
  selectedIds.value = new Set(filtered.value.map((f) => f.session.id));
}

function handleBatchDelete() {
  if (selectedCount.value === 0) return;
  store.deleteSessions([...selectedIds.value]);
  exitBatch();
}

/* ---------- 单会话操作 ---------- */

/** 删除二次确认：第一次点击进入确认态，3 秒自动还原 */
function handleDelete(session: ChatSession) {
  if (pendingDeleteId.value === session.id) {
    store.deleteSession(session.id);
    pendingDeleteId.value = null;
    if (deleteTimer) {
      clearTimeout(deleteTimer);
      deleteTimer = null;
    }
  } else {
    pendingDeleteId.value = session.id;
    if (deleteTimer) clearTimeout(deleteTimer);
    deleteTimer = setTimeout(() => {
      pendingDeleteId.value = null;
      deleteTimer = null;
    }, 3000);
  }
}

function handlePin(session: ChatSession) {
  store.togglePin(session.id);
}

function handleArchive(session: ChatSession) {
  store.toggleArchive(session.id);
}

function handleRestore(session: ChatSession) {
  store.toggleArchive(session.id);
}

function startRename(session: ChatSession) {
  editingId.value = session.id;
  editingTitle.value = session.title;
  requestAnimationFrame(focusEditInput);
  if (renameTimer) clearTimeout(renameTimer);
}

function focusEditInput() {
  const el = Array.isArray(editInput.value) ? editInput.value[0] : editInput.value;
  el?.focus();
}

function commitRename(session: ChatSession) {
  if (editingId.value !== session.id) return;
  // 不允许空标题：保持编辑态并聚焦
  if (!editingTitle.value.trim()) {
    requestAnimationFrame(focusEditInput);
    return;
  }
  store.renameSession(session.id, editingTitle.value);
  editingId.value = null;
}

function cancelRename() {
  editingId.value = null;
}

/** Escape 关闭移动端抽屉 / 批量模式（输入框内 Escape 已由 .stop 拦截，不冲突） */
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (batchMode.value) {
      exitBatch();
      return;
    }
    if (mobileOpen.value) {
      mobileOpen.value = false;
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  if (deleteTimer) clearTimeout(deleteTimer);
  if (renameTimer) clearTimeout(renameTimer);
});
</script>

<template>
  <!-- 移动端抽屉遮罩 -->
  <AnimatePresence>
    <motion.div
      v-if="mobileOpen"
      key="chat-drawer-mask"
      class="bg-surface-900/30 fixed inset-0 z-40 backdrop-blur-sm md:hidden"
      :initial="{ opacity: 0 }"
      :animate="{ opacity: 1 }"
      :exit="{ opacity: 0 }"
      :transition="{ duration: 0.2 }"
      @click="mobileOpen = false"
    />
  </AnimatePresence>

  <!-- 侧栏本体：桌面固定定位，移动端为抽屉 -->
  <AnimatePresence>
    <motion.aside
      v-if="!collapsed || mobileOpen"
      key="chat-sidebar"
      class="border-surface-100 bg-surface-0 flex h-full shrink-0 flex-col border-r"
      :class="mobileOpen ? 'fixed inset-y-0 left-0 z-50 w-[300px]' : 'hidden md:flex md:w-[300px]'"
      :initial="{ x: -320, opacity: 0 }"
      :animate="{ x: 0, opacity: 1 }"
      :exit="{ x: -320, opacity: 0 }"
      :transition="{ type: 'spring', stiffness: 320, damping: 30 }"
    >
      <!-- 头部：新建对话 -->
      <div class="flex items-center gap-2 p-3 pb-2">
        <motion.button
          class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          :while-tap="{ scale: 0.96 }"
          aria-label="新建对话"
          title="新建对话"
          @click="handleCreate"
        >
          <Plus class="size-4" />
          <span>新建对话</span>
        </motion.button>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 md:hidden"
          aria-label="关闭会话列表"
          title="关闭会话列表"
          @click="mobileOpen = false"
        >
          <X class="size-4" />
        </button>
      </div>

      <!-- 模型库区 -->
      <div class="flex min-h-0 flex-col border-b border-surface-100 pb-2" style="max-height: 46%">
        <p class="text-surface-800/40 px-3 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider">
          模型库
        </p>
        <ChatModelList @select="handleModelSelect" />
      </div>

      <!-- 会话区 -->
      <div class="flex min-h-0 flex-1 flex-col pt-2">
        <div class="flex items-center justify-between px-3 pb-1.5">
          <p class="text-surface-800/40 text-[10px] font-medium uppercase tracking-wider">会话</p>
          <button
            v-if="!batchMode"
            class="text-surface-800/40 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="批量选择会话"
            title="批量选择"
            @click="enterBatch"
          >
            <ListChecks class="size-3.5" />
          </button>
        </div>

        <!-- 会话搜索 -->
        <div class="px-3 pb-1.5">
          <div class="border-surface-100 focus-within:border-brand-500 bg-surface-50 flex items-center gap-2 rounded-lg border px-2.5 transition-colors">
            <Search class="text-surface-800/40 size-3.5" />
            <input
              v-model="keyword"
              class="bg-transparent h-8 w-full text-sm outline-none placeholder:text-surface-800/40"
              type="text"
              placeholder="搜索会话或消息…"
              aria-label="搜索会话或消息"
            />
            <button
              v-if="keyword"
              class="text-surface-800/40 hover:text-surface-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded"
              aria-label="清空搜索"
              title="清空搜索"
              @click="keyword = ''"
            >
              <X class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- 会话筛选：模型 / 时间 / 仅书签 -->
        <div class="flex items-center gap-1.5 px-3 pb-2">
          <select
            v-model="modelFilter"
            class="border-surface-100 bg-surface-50 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 h-7 min-w-0 flex-1 rounded-md border px-1 text-[11px] outline-none transition-colors focus-visible:ring-2"
            aria-label="按模型筛选会话"
            title="按模型类别筛选"
          >
            <option value="all">全部模型</option>
            <option
              v-for="c in MODEL_CATEGORIES.filter((x) => x.key !== 'all')"
              :key="c.key"
              :value="c.key"
            >
              {{ c.label }}
            </option>
          </select>
          <select
            v-model="timeFilter"
            class="border-surface-100 bg-surface-50 text-surface-800/70 hover:text-surface-900 focus-visible:ring-brand-500/40 h-7 min-w-0 flex-1 rounded-md border px-1 text-[11px] outline-none transition-colors focus-visible:ring-2"
            aria-label="按时间筛选会话"
            title="按更新时间筛选"
          >
            <option v-for="t in TIME_FILTERS" :key="t.key" :value="t.key">
              {{ t.label }}
            </option>
          </select>
          <button
            class="hover:bg-surface-100 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
            :class="
              store.prefs.sessionBookmarkFilter
                ? 'bg-surface-100 text-amber-500'
                : 'text-surface-800/50 hover:text-surface-900'
            "
            :aria-pressed="store.prefs.sessionBookmarkFilter"
            aria-label="仅看含书签的会话"
            title="仅看含书签的会话"
            @click="store.toggleSessionBookmarkFilter()"
          >
            <Star class="size-3.5" :class="store.prefs.sessionBookmarkFilter ? 'fill-current' : ''" />
          </button>
        </div>

        <!-- 会话列表 -->
        <div class="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-3 pb-2">
          <AnimatePresence>
            <template v-if="filtered.length > 0">
              <div v-for="group in groups" :key="group.key">
                <p v-if="group.items.length > 0" class="text-surface-800/40 px-1 pb-1 text-[11px] font-medium">
                  {{ group.label }}
                </p>
                <div class="space-y-0.5">
                  <motion.div
                    v-for="{ session: s, snippet } in group.items"
                    :key="s.id"
                    layout
                    :initial="{ opacity: 0, y: 6 }"
                    :animate="{ opacity: 1, y: 0 }"
                    :exit="{ opacity: 0, scale: 0.96 }"
                    :transition="{ duration: 0.18 }"
                  >
                    <!-- 批量模式：勾选行 -->
                    <div
                      v-if="batchMode"
                      class="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
                      :class="
                        selectedIds.has(s.id)
                          ? 'bg-brand-50 text-brand-700'
                          : 'hover:bg-surface-100 text-surface-800/80 hover:text-surface-900'
                      "
                      role="button"
                      :tabindex="0"
                      :aria-label="`选择会话 ${s.title}`"
                      :aria-checked="selectedIds.has(s.id)"
                      @click="toggleSelect(s.id)"
                      @keydown="handleItemKeydown($event, s.id)"
                    >
                      <input
                        type="checkbox"
                        class="size-3.5 shrink-0 accent-brand-600"
                        :checked="selectedIds.has(s.id)"
                        :aria-label="`勾选 ${s.title}`"
                        @click.stop
                        @change="toggleSelect(s.id)"
                      />
                      <span class="min-w-0 flex-1 truncate text-sm">{{ s.title }}</span>
                      <span class="text-surface-800/35 shrink-0 text-[10px]">{{ formatTime(s.updatedAt) }}</span>
                    </div>

                    <!-- 常规行 -->
                    <div
                      v-else
                      class="group relative flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 transition-colors"
                      :class="
                        store.activeId === s.id
                          ? 'bg-brand-50 text-brand-700'
                          : 'hover:bg-surface-100 text-surface-800/80 hover:text-surface-900'
                      "
                      role="button"
                      :tabindex="0"
                      :aria-label="`打开会话 ${s.title}`"
                      @click="handleSelect(s.id)"
                      @keydown="handleItemKeydown($event, s.id)"
                    >
                      <template v-if="editingId === s.id">
                        <input
                          ref="editInput"
                          v-model="editingTitle"
                          class="border-brand-500 bg-surface-0 text-surface-900 min-w-0 flex-1 rounded-md border px-1.5 py-0.5 text-sm outline-none"
                          aria-label="重命名会话"
                          @click.stop
                          @keydown.enter.stop="commitRename(s)"
                          @keydown.esc.stop="cancelRename"
                          @blur="commitRename(s)"
                        />
                        <Check class="size-3.5 shrink-0" />
                      </template>
                      <template v-else>
                        <span class="min-w-0 flex-1">
                          <span class="block truncate text-sm">
                            <Pin
                              v-if="s.pinned"
                              class="text-brand-500 -mt-0.5 mr-1 inline size-3 fill-current"
                              aria-hidden="true"
                            />
                            <template v-for="(p, pi) in highlightParts(s.title)" :key="pi">
                              <mark
                                v-if="p.match"
                                class="bg-brand-200/60 text-brand-700 rounded px-0.5"
                              >{{ p.text }}</mark>
                              <template v-else>{{ p.text }}</template>
                            </template>
                          </span>
                          <span
                            v-if="snippet"
                            class="text-surface-800/45 mt-0.5 block truncate text-xs"
                          >
                            <template v-for="(p, pi) in highlightParts(snippet)" :key="`s${pi}`">
                              <mark
                                v-if="p.match"
                                class="bg-brand-200/60 text-brand-700 rounded px-0.5"
                              >{{ p.text }}</mark>
                              <template v-else>{{ p.text }}</template>
                            </template>
                          </span>
                        </span>
                        <span class="text-surface-800/35 shrink-0 text-[10px]">{{ formatTime(s.updatedAt) }}</span>
                        <div
                          class="absolute right-2 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <button
                            class="hover:bg-surface-200 text-surface-800/50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
                            :aria-label="s.pinned ? '取消固定' : '固定会话'"
                            :title="s.pinned ? '取消固定' : '固定'"
                            @click.stop="handlePin(s)"
                          >
                            <Pin v-if="!s.pinned" class="size-3" />
                            <PinOff v-else class="size-3" />
                          </button>
                          <button
                            class="hover:bg-surface-200 text-surface-800/50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
                            aria-label="归档会话"
                            title="归档"
                            @click.stop="handleArchive(s)"
                          >
                            <Archive class="size-3" />
                          </button>
                          <button
                            class="hover:bg-surface-200 text-surface-800/50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
                            aria-label="重命名"
                            title="重命名"
                            @click.stop="startRename(s)"
                          >
                            <Pencil class="size-3" />
                          </button>
                          <button
                            class="hover:bg-red-100 text-surface-800/50 hover:text-red-600 focus-visible:ring-brand-500/40 flex size-6 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
                            :class="pendingDeleteId === s.id ? 'bg-red-100 text-red-600' : ''"
                            :aria-label="pendingDeleteId === s.id ? '再次点击确认删除' : '删除会话'"
                            :title="pendingDeleteId === s.id ? '再次点击确认删除' : '删除会话'"
                            @click.stop="handleDelete(s)"
                          >
                            <Trash2 class="size-3" />
                          </button>
                        </div>
                      </template>
                    </div>
                  </motion.div>
                </div>
              </div>
            </template>
            <motion.p
              v-else
              key="chat-sidebar-empty"
              class="text-surface-800/40 px-2 pt-6 text-center text-xs"
              :initial="{ opacity: 0 }"
              :animate="{ opacity: 1 }"
            >
              {{ keyword ? '没有匹配的会话或消息' : '还没有对话，点上方新建一个吧' }}
            </motion.p>
          </AnimatePresence>
        </div>

        <!-- 归档区 -->
        <div class="border-surface-100 shrink-0 border-t px-3 py-1.5">
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
            :aria-expanded="showArchived"
            aria-label="展开归档会话"
            title="归档会话"
            @click="showArchived = !showArchived"
          >
            <Archive class="size-3.5" />
            <span class="flex-1 text-left">归档</span>
            <span v-if="store.archivedSessions.length > 0" class="text-surface-800/40">
              {{ store.archivedSessions.length }}
            </span>
            <ChevronDown class="size-3" :class="showArchived ? 'rotate-180' : ''" />
          </button>
          <div v-if="showArchived" class="scrollbar-thin mt-1 max-h-36 space-y-0.5 overflow-y-auto">
            <div
              v-for="s in store.archivedSessions"
              :key="s.id"
              class="group flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-surface-100"
            >
              <span class="text-surface-800/70 min-w-0 flex-1 truncate text-xs">{{ s.title }}</span>
              <span class="text-surface-800/35 shrink-0 text-[10px]">{{ formatTime(s.updatedAt) }}</span>
              <button
                class="hover:bg-surface-200 text-surface-800/50 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-6 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2"
                aria-label="恢复会话"
                title="恢复"
                @click="handleRestore(s)"
              >
                <ArchiveRestore class="size-3" />
              </button>
              <button
                class="hover:bg-red-100 text-surface-800/50 hover:text-red-600 focus-visible:ring-brand-500/40 flex size-6 shrink-0 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2"
                :class="pendingDeleteId === s.id ? 'bg-red-100 text-red-600' : ''"
                :aria-label="pendingDeleteId === s.id ? '再次点击确认删除' : '删除会话'"
                :title="pendingDeleteId === s.id ? '再次点击确认删除' : '删除会话'"
                @click.stop="handleDelete(s)"
              >
                <Trash2 class="size-3" />
              </button>
            </div>
            <p v-if="store.archivedSessions.length === 0" class="text-surface-800/40 px-1.5 py-1 text-center text-[11px]">
              没有归档会话
            </p>
          </div>
        </div>

        <!-- 批量操作栏 -->
        <div
          v-if="batchMode"
          class="border-surface-100 flex shrink-0 items-center gap-1.5 border-t px-3 py-2"
        >
          <span class="text-surface-800/60 min-w-0 flex-1 truncate text-[11px]">
            已选 {{ selectedCount }} 个会话
          </span>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="全选会话"
            @click="selectAllVisible"
          >
            全选
          </button>
          <button
            class="hover:bg-surface-100 text-surface-800/60 hover:text-surface-900 focus-visible:ring-brand-500/40 rounded-md px-1.5 py-1 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2"
            aria-label="取消批量选择"
            @click="exitBatch"
          >
            取消
          </button>
          <button
            class="hover:bg-red-50 text-red-600 focus-visible:ring-brand-500/40 flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-40"
            aria-label="删除所选会话"
            :disabled="selectedCount === 0"
            @click="handleBatchDelete"
          >
            <Trash2 class="size-3" />
            删除
          </button>
        </div>
      </div>

      <!-- 底部：当前模型运行状态 -->
      <div class="border-surface-100 flex shrink-0 items-center gap-2.5 border-t px-3 py-2.5">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
          :style="{ background: activeModel?.color ?? 'var(--chat-mono)' }"
        >
          {{ activeModel?.label.slice(0, 1) ?? '?' }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="text-surface-900 block truncate text-xs font-medium">
            {{ activeModel?.label ?? '未选择模型' }}
          </span>
          <span class="text-surface-800/45 flex items-center gap-1.5 text-[10px]">
            <span class="size-1.5 rounded-full bg-emerald-500" />
            {{ categoryLabel(activeModel?.id ?? '') }}
            <template v-if="activeModel">
              · {{ activeModel.available ? '可用' : '未接入' }} · {{ activeModel.context }}
            </template>
          </span>
        </span>
        <button
          class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 focus-visible:ring-brand-500/40 flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2"
          aria-label="收起侧边栏"
          title="收起侧边栏"
          @click="collapsed = !collapsed"
        >
          <PanelLeftClose class="size-4" />
        </button>
      </div>
    </motion.aside>
  </AnimatePresence>

  <!-- 折叠态窄栏（仅桌面）：保留新建入口 -->
  <div
    v-if="collapsed && !mobileOpen"
    class="border-surface-100 bg-surface-0 hidden w-12 shrink-0 flex-col items-center border-r py-3 md:flex"
  >
    <motion.button
      class="bg-brand-600 hover:bg-brand-700 text-surface-0 flex size-8 items-center justify-center rounded-lg shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
      :while-tap="{ scale: 0.94 }"
      aria-label="新建对话"
      title="新建对话"
      @click="handleCreate"
    >
      <Plus class="size-4" />
    </motion.button>
    <button
      class="text-surface-800/60 hover:bg-surface-100 hover:text-surface-900 mt-auto flex size-8 items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      aria-label="展开侧边栏"
      title="展开侧边栏"
      @click="collapsed = false"
    >
      <ChevronsLeft class="size-4 rotate-180" />
    </button>
  </div>
</template>

<style scoped>
.scrollbar-thin::-webkit-scrollbar {
  width: 5px;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  border-radius: 9999px;
  background: rgb(15 23 42 / 0.12);
}
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgb(15 23 42 / 0.24);
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
</style>
