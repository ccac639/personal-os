/**
 * Chat 功能域 —— 灵感广场 Pinia store
 *
 * 职责：灵感库 CRUD（收藏 / 置顶 / 归档 / 复制 / 删除）、筛选排序（本地持久化）、
 * 快捷视图、导入导出、从对话保存、基于灵感创建 Chat 草稿（不自动发送）。
 * 持久化收敛到 inspiration-storage.ts，组件不得直接读写 localStorage。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  activeFilterCount,
  applyQuickView,
  collectTags,
  createInspirationDraft,
  draftFromAgent,
  draftFromMessage,
  duplicateInspiration,
  emptyInspirationFilters,
  filterInspirations,
  inspirationLibraryJson,
  parseInspirationImport,
  resolveInspirationImport,
  sortInspirations,
} from './inspiration';
import {
  loadInspirationLibrary,
  saveInspirationLibrary,
} from './inspiration-storage';
import type {
  ChatInspiration,
  InspirationDraftInput,
  InspirationFilters,
  InspirationImportResult,
  InspirationImportStrategy,
  InspirationQuickView,
  InspirationSortKey,
  InspirationUiState,
  InspirationView,
} from './inspiration-types';
import { useChatStore } from './store';
import { pushToast } from './toast';
import { downloadTextFile, sanitizeFilename } from './export';

export const useInspirationStore = defineStore('chat-inspiration', () => {
  const { items: initialItems, ui: initialUi, recovered } =
    loadInspirationLibrary();

  const items = ref<ChatInspiration[]>(initialItems);
  const ui = ref<InspirationUiState>(initialUi);
  const recoveredFlag = ref(recovered);

  /** 从对话保存灵感的挂起草稿（弹窗表单预填） */
  const pendingSave = ref<{
    messageId: string;
    sessionId?: string;
    draft: InspirationDraftInput;
  } | null>(null);

  /** 从灵感创建智能体变体的跳转信号 */
  const pendingAgentCreate = ref<{ inspirationId: string } | null>(null);

  watch(
    [items, ui],
    ([it, u]) => {
      saveInspirationLibrary(it, {
        ...u,
        filters: {
          ...u.filters,
          // 持久化层 archived 为 boolean：undefined 归一化为 false（显示全部）
          archived: u.filters.archived ?? false,
        },
      });
    },
    { deep: true },
  );

  /** 快捷视图（含筛选条件的组合视图） */
  const visibleItems = computed(() => {
    const base = applyQuickView(ui.value.filters, ui.value.quickView);
    return sortInspirations(filterInspirations(items.value, base), ui.value.sort);
  });

  const allTags = computed(() => collectTags(items.value));

  const activeCount = computed(() =>
    activeFilterCount(ui.value.filters, ui.value.quickView),
  );

  const itemCount = computed(() => items.value.length);

  function itemById(id: string): ChatInspiration | undefined {
    return items.value.find((it) => it.id === id);
  }

  /* ---------- UI 状态 ---------- */

  function setView(view: InspirationView) {
    ui.value.view = view;
  }

  function setSort(sort: InspirationSortKey) {
    ui.value.sort = sort;
  }

  function setQuickView(view: InspirationQuickView) {
    ui.value.quickView = view;
    // 切换快捷视图时重置归档过滤，避免矛盾状态
    if (view === 'archived') {
      ui.value.filters.archived = true;
    } else {
      ui.value.filters.archived = false;
      if (view === 'favorites') ui.value.filters.favoritesOnly = true;
      if (view === 'drafting') ui.value.filters.pinnedOnly = false;
    }
  }

  function setFilters(patch: Partial<InspirationFilters>) {
    ui.value.filters = { ...ui.value.filters, ...patch };
  }

  function clearFilters() {
    ui.value.filters = emptyInspirationFilters();
    ui.value.quickView = 'all';
  }

  /* ---------- CRUD ---------- */

  function createInspiration(input: InspirationDraftInput): ChatInspiration {
    const item = createInspirationDraft(input);
    items.value = [item, ...items.value];
    return item;
  }

  function updateInspiration(id: string, patch: Partial<ChatInspiration>): boolean {
    const idx = items.value.findIndex((it) => it.id === id);
    if (idx < 0) return false;
    const updated = { ...items.value[idx]!, ...patch, id, updatedAt: Date.now() };
    items.value = items.value.map((it, i) => (i === idx ? updated : it));
    return true;
  }

  function deleteInspiration(id: string): boolean {
    const before = items.value.length;
    items.value = items.value.filter((it) => it.id !== id);
    return items.value.length < before;
  }

  function toggleFavorite(id: string) {
    const it = itemById(id);
    if (it) it.favorite = !it.favorite;
  }

  function togglePinned(id: string) {
    const it = itemById(id);
    if (it) it.pinned = !it.pinned;
  }

  function toggleArchived(id: string) {
    const it = itemById(id);
    if (it) it.archived = !it.archived;
  }

  function duplicateItem(id: string): ChatInspiration | null {
    const source = itemById(id);
    if (!source) return null;
    const copy = duplicateInspiration(source);
    items.value = [copy, ...items.value];
    return copy;
  }

  function copyPrompt(id: string): string | null {
    return itemById(id)?.prompt ?? null;
  }

  /* ---------- 从对话保存 ---------- */

  function saveFromMessage(messageId: string) {
    const chatStore = useChatStore();
    const message = chatStore.findMessage(messageId);
    if (!message) return;
    pendingSave.value = {
      messageId,
      sessionId: chatStore.activeSession?.id,
      draft: draftFromMessage({
        content: message.content,
        modelId: message.model,
        sessionId: chatStore.activeSession?.id,
      }),
    };
  }

  /** 弹窗确认保存（可再编辑预填内容） */
  function commitSave(input: InspirationDraftInput): ChatInspiration | null {
    const item = createInspiration(input);
    pendingSave.value = null;
    return item;
  }

  function cancelSave() {
    pendingSave.value = null;
  }

  /* ---------- 基于灵感创作 / 创建变体 ---------- */

  /**
   * 基于灵感创建 Chat 会话草稿：应用相关智能体 / 模型 / 模式上下文，
   * 预填 Composer 草稿；绝不自动发送。返回会话 id。
   */
  function createChatDraft(inspirationId: string): string | null {
    const it = itemById(inspirationId);
    if (!it) return null;
    const chatStore = useChatStore();
    chatStore.launchAgentSession({
      agentId: it.relatedAgentId ?? 'inspiration',
      agentName: '灵感',
      systemPrompt: '', // 会话级提示词由智能体决定；灵感本身不注入系统提示词
      modelId: it.relatedModelId ?? chatStore.activeModelId,
      mode: chatStore.prefs.outputMode,
      draft: it.prompt,
    });
    return chatStore.activeId;
  }

  /** 从智能体启动结果创建灵感（详情页「保存为灵感」入口） */
  function createFromAgent(input: {
    agentName: string;
    agentId: string;
    prompt: string;
    modelId?: string;
  }): ChatInspiration {
    return createInspiration(draftFromAgent(input));
  }

  /** 请求创建智能体变体（跳转智能体中心并预填表单） */
  function requestAgentVariant(inspirationId: string) {
    pendingAgentCreate.value = { inspirationId };
  }

  function clearAgentVariantRequest() {
    pendingAgentCreate.value = null;
  }

  /* ---------- 导入导出 ---------- */

  function importFromJson(
    text: string,
    strategy: InspirationImportStrategy,
  ): { ok: boolean; result?: InspirationImportResult; error?: string } {
    const parsed = parseInspirationImport(text);
    if ('error' in parsed) return { ok: false, error: parsed.error };
    const { items: incoming, preview } = parsed;
    if (incoming.length === 0) {
      return { ok: false, error: `没有可导入的条目（${preview.invalidCount} 条无效）` };
    }
    const { items: merged, result } = resolveInspirationImport(
      items.value,
      incoming,
      strategy,
    );
    items.value = merged;
    return { ok: true, result };
  }

  function exportSingle(id: string) {
    const it = itemById(id);
    if (!it) return;
    downloadTextFile(
      `${sanitizeFilename(it.title)}.json`,
      inspirationLibraryJson([it]),
      'application/json;charset=utf-8',
    );
  }

  function exportFiltered() {
    if (visibleItems.value.length === 0) {
      pushToast('当前筛选下没有可导出的灵感', 'warning');
      return;
    }
    downloadTextFile(
      '灵感-筛选结果.json',
      inspirationLibraryJson(visibleItems.value),
      'application/json;charset=utf-8',
    );
  }

  function exportAll() {
    if (items.value.length === 0) {
      pushToast('灵感库为空', 'warning');
      return;
    }
    downloadTextFile(
      '灵感库-全部.json',
      inspirationLibraryJson(items.value),
      'application/json;charset=utf-8',
    );
  }

  return {
    items,
    ui,
    recovered: recoveredFlag,
    pendingSave,
    pendingAgentCreate,
    visibleItems,
    allTags,
    activeCount,
    itemCount,
    itemById,
    setView,
    setSort,
    setQuickView,
    setFilters,
    clearFilters,
    createInspiration,
    updateInspiration,
    deleteInspiration,
    toggleFavorite,
    togglePinned,
    toggleArchived,
    duplicateItem,
    copyPrompt,
    saveFromMessage,
    commitSave,
    cancelSave,
    createChatDraft,
    createFromAgent,
    requestAgentVariant,
    clearAgentVariantRequest,
    importFromJson,
    exportSingle,
    exportFiltered,
    exportAll,
  };
});
