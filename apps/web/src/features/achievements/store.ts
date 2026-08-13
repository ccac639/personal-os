/**
 * 成果库 Store（Pinia）
 *
 * - 纯前端 mock：数据经 storage.ts 以版本化信封写入 localStorage。
 * - 支持新增/编辑/删除/置顶/归档/手动排序/批量操作/导入导出。
 * - 集合（Collection）：可创建/编辑/删除/排序，成果引用为有序 id 列表；
 *   删除成果时自动从集合移除引用（引用完整性）。
 * - 关系（Relations）：关联项目/工作流/前置/衍生仅存本地引用 ID，
 *   不修改其他模块 Store；删除成果时清理其他成果对它的前置/衍生引用。
 * - 筛选方案（SavedFilter）：命名保存当前筛选并可删除，随数据信封持久化。
 * - UI 偏好（视图/筛选/排序）独立持久化，损坏时只回退 UI。
 * - 写入失败：保留内存状态，置 persistError 供页面非阻塞提示。
 */
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { seedAchievements, seedCollections } from './mock';
import { sortAchievements } from './filters';
import {
  STORAGE_VERSION,
  buildExport,
  loadAchievementStorage,
  loadUiState,
  mergeImport,
  saveAchievementStorage,
  saveUiState,
  type ExportPayload,
  type ImportMode,
  type ImportPayload,
  type MergeOutcome,
} from './storage';
import type {
  Achievement,
  AchievementCollection,
  AchievementDraft,
  AchievementFilters,
  AchievementUiState,
  AchievementView,
  CollectionDraft,
  ExportScope,
  SavedFilter,
} from './types';
import { defaultUiState } from './types';

export { ACHIEVEMENT_STORAGE_KEY, ACHIEVEMENT_UI_STORAGE_KEY } from './storage';

function nowIso(): string {
  return new Date().toISOString();
}

export const useAchievementStore = defineStore('achievements', () => {
  const achievements = ref<Achievement[]>([]);
  /** 成果自增 id 基数（跨会话不重复） */
  const seq = ref(0);
  /** 集合列表 */
  const collections = ref<AchievementCollection[]>([]);
  /** 集合自增 id 基数 */
  const collectionSeq = ref(0);
  /** 保存的筛选方案 */
  const savedFilters = ref<SavedFilter[]>([]);
  /** 当前聚焦的集合（导航态，不持久化） */
  const activeCollectionId = ref<string | null>(null);
  /** UI 偏好（视图/筛选/排序），独立持久化 */
  const ui = ref<AchievementUiState>(defaultUiState());
  /** 批量选中（不持久化） */
  const selectedIds = ref<string[]>([]);
  /** 上次持久化是否失败（写入失败时内存状态保留） */
  const persistError = ref(false);

  /* ---------- 加载 / 持久化 ---------- */

  function load() {
    const data = loadAchievementStorage();
    if (data) {
      achievements.value = data.items;
      seq.value = data.seq;
      collections.value = data.collections;
      collectionSeq.value = data.collectionSeq;
      savedFilters.value = data.savedFilters;
      // 迁移入口：把规范化后的信封回写（旧版数组/缺失字段在此升级）
      persistItems();
    } else {
      const seeded = seedAchievements();
      achievements.value = seeded;
      seq.value = seeded.length;
      collections.value = seedCollections(seeded);
      collectionSeq.value = collections.value.length;
      savedFilters.value = [];
      persistItems();
    }
    ui.value = loadUiState();
  }

  function persistItems() {
    const ok = saveAchievementStorage({
      version: STORAGE_VERSION,
      seq: seq.value,
      collectionSeq: collectionSeq.value,
      items: achievements.value,
      collections: collections.value,
      savedFilters: savedFilters.value,
    });
    if (!ok) persistError.value = true;
    else persistError.value = false;
  }

  function persistUi() {
    saveUiState(ui.value);
  }

  function nextId(): string {
    seq.value += 1;
    return `ac-${seq.value}`;
  }

  function nextCollectionId(): string {
    collectionSeq.value += 1;
    return `col-${collectionSeq.value}`;
  }

  /* ---------- 单条增删改 ---------- */

  function get(id: string): Achievement | null {
    return achievements.value.find((a) => a.id === id) ?? null;
  }

  function add(draft: AchievementDraft): Achievement {
    const timestamp = nowIso();
    const maxOrder = achievements.value.reduce((m, a) => Math.max(m, a.order ?? 0), 0);
    const item: Achievement = {
      ...draft,
      id: nextId(),
      pinned: false,
      archived: false,
      order: maxOrder + 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    achievements.value = [item, ...achievements.value];
    persistItems();
    return item;
  }

  function update(id: string, patch: Partial<AchievementDraft>) {
    achievements.value = achievements.value.map((a) =>
      a.id === id ? { ...a, ...patch, updatedAt: nowIso() } : a,
    );
    persistItems();
  }

  /** 清理对被删 id 的引用：集合成员 + 其他成果的前置/衍生关系（引用完整性） */
  function stripReferences(deletedIds: Set<string>) {
    collections.value = collections.value.map((c) => {
      const next = c.achievementIds.filter((id) => !deletedIds.has(id));
      if (next.length === c.achievementIds.length) return c;
      return { ...c, achievementIds: next, updatedAt: nowIso() };
    });
    achievements.value = achievements.value.map((a) => {
      const pred = a.relations.predecessorIds.filter((id) => !deletedIds.has(id));
      const der = a.relations.derivedIds.filter((id) => !deletedIds.has(id));
      if (
        pred.length === a.relations.predecessorIds.length &&
        der.length === a.relations.derivedIds.length
      ) {
        return a;
      }
      return {
        ...a,
        relations: { ...a.relations, predecessorIds: pred, derivedIds: der },
        updatedAt: nowIso(),
      };
    });
  }

  function remove(id: string) {
    achievements.value = achievements.value.filter((a) => a.id !== id);
    selectedIds.value = selectedIds.value.filter((x) => x !== id);
    stripReferences(new Set([id]));
    persistItems();
  }

  function togglePin(id: string) {
    achievements.value = achievements.value.map((a) =>
      a.id === id ? { ...a, pinned: !a.pinned, updatedAt: nowIso() } : a,
    );
    persistItems();
  }

  function toggleArchive(id: string) {
    achievements.value = achievements.value.map((a) =>
      a.id === id ? { ...a, archived: !a.archived, updatedAt: nowIso() } : a,
    );
    persistItems();
  }

  /* ---------- 手动排序 ---------- */

  /** 在手动排序序列中上移/下移一位（不跨越置顶边界） */
  function move(id: string, dir: -1 | 1) {
    const sorted = sortAchievements(achievements.value, 'manual');
    const idx = sorted.findIndex((a) => a.id === id);
    if (idx < 0) return;
    const target = sorted[idx + dir];
    if (!target) return;
    const self = sorted[idx]!;
    if (self.pinned !== target.pinned) return; // 不跨越置顶/普通边界
    const selfOrder = self.order ?? 0;
    const targetOrder = target.order ?? 0;
    achievements.value = achievements.value.map((a) => {
      if (a.id === self.id) return { ...a, order: targetOrder };
      if (a.id === target.id) return { ...a, order: selfOrder };
      return a;
    });
    persistItems();
  }

  /* ---------- 集合 ---------- */

  function getCollection(id: string): AchievementCollection | null {
    return collections.value.find((c) => c.id === id) ?? null;
  }

  function addCollection(draft: CollectionDraft): AchievementCollection {
    const timestamp = nowIso();
    const col: AchievementCollection = {
      id: nextCollectionId(),
      name: draft.name.trim(),
      description: draft.description.trim(),
      color: draft.color,
      achievementIds: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    collections.value = [...collections.value, col];
    persistItems();
    return col;
  }

  function updateCollection(
    id: string,
    patch: Partial<CollectionDraft> | { achievementIds: string[] },
  ) {
    collections.value = collections.value.map((c) =>
      c.id === id ? { ...c, ...patch, updatedAt: nowIso() } : c,
    );
    persistItems();
  }

  function removeCollection(id: string) {
    collections.value = collections.value.filter((c) => c.id !== id);
    if (activeCollectionId.value === id) activeCollectionId.value = null;
    persistItems();
  }

  /** 批量加入集合（去重，保持已有顺序在前） */
  function addToCollection(colId: string, achievementIds: string[]) {
    collections.value = collections.value.map((c) => {
      if (c.id !== colId) return c;
      const set = new Set([...c.achievementIds, ...achievementIds]);
      return { ...c, achievementIds: [...set], updatedAt: nowIso() };
    });
    persistItems();
  }

  function removeFromCollection(colId: string, achievementId: string) {
    collections.value = collections.value.map((c) =>
      c.id === colId
        ? {
            ...c,
            achievementIds: c.achievementIds.filter((id) => id !== achievementId),
            updatedAt: nowIso(),
          }
        : c,
    );
    persistItems();
  }

  /** 集合内成果手动排序：上移/下移一位 */
  function moveCollectionItem(colId: string, achievementId: string, dir: -1 | 1) {
    const col = collections.value.find((c) => c.id === colId);
    if (!col) return;
    const idx = col.achievementIds.indexOf(achievementId);
    if (idx < 0) return;
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= col.achievementIds.length) return;
    const next = [...col.achievementIds];
    [next[idx], next[targetIdx]] = [next[targetIdx]!, next[idx]!];
    updateCollection(colId, { achievementIds: next });
  }

  function setActiveCollection(id: string | null) {
    activeCollectionId.value = id;
  }

  /* ---------- 筛选方案 ---------- */

  function saveFilter(name: string, filters: AchievementFilters): SavedFilter {
    const item: SavedFilter = {
      id: `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name.trim().slice(0, 40),
      filters: { ...filters },
      createdAt: nowIso(),
    };
    savedFilters.value = [...savedFilters.value, item];
    persistItems();
    return item;
  }

  function deleteSavedFilter(id: string) {
    savedFilters.value = savedFilters.value.filter((s) => s.id !== id);
    persistItems();
  }

  /** 编辑筛选方案：重命名和/或更新筛选快照（名称清洗；空名称保留原名；筛选取快照副本） */
  function updateSavedFilter(id: string, patch: { name?: string; filters?: AchievementFilters }) {
    savedFilters.value = savedFilters.value.map((s) => {
      if (s.id !== id) return s;
      const next: SavedFilter = { ...s, updatedAt: nowIso() };
      if (typeof patch.name === 'string') {
        const name = patch.name.trim().slice(0, 40);
        if (name) next.name = name;
      }
      if (patch.filters) next.filters = { ...patch.filters };
      return next;
    });
    persistItems();
  }

  /* ---------- 批量操作 ---------- */

  function batchSetPinned(ids: string[], pinned: boolean) {
    const set = new Set(ids);
    achievements.value = achievements.value.map((a) =>
      set.has(a.id) ? { ...a, pinned, updatedAt: nowIso() } : a,
    );
    persistItems();
  }

  function batchSetArchived(ids: string[], archived: boolean) {
    const set = new Set(ids);
    achievements.value = achievements.value.map((a) =>
      set.has(a.id) ? { ...a, archived, updatedAt: nowIso() } : a,
    );
    persistItems();
  }

  function batchDelete(ids: string[]) {
    const set = new Set(ids);
    achievements.value = achievements.value.filter((a) => !set.has(a.id));
    selectedIds.value = selectedIds.value.filter((x) => !set.has(x));
    stripReferences(set);
    persistItems();
  }

  /* ---------- 批量选择 ---------- */

  function toggleSelect(id: string) {
    selectedIds.value = selectedIds.value.includes(id)
      ? selectedIds.value.filter((x) => x !== id)
      : [...selectedIds.value, id];
  }

  function setSelection(ids: string[]) {
    selectedIds.value = [...new Set(ids)];
  }

  function clearSelection() {
    selectedIds.value = [];
  }

  /* ---------- UI 偏好 ---------- */

  function setView(view: AchievementView) {
    ui.value = { ...ui.value, view };
    persistUi();
  }

  function setFilters(filters: AchievementFilters) {
    ui.value = { ...ui.value, filters };
    persistUi();
  }

  /* ---------- 导入 / 导出 ---------- */

  /**
   * 按作用域导出：
   * - all：全库（成果 + 全部集合）
   * - single：单项（目标成果 + 空集合）
   * - collection：单个集合（集合 + 其引用的成果）
   */
  function exportJson(scope: ExportScope = 'all', targetId?: string): string {
    let items = achievements.value;
    let cols = collections.value;
    if (scope === 'single' && targetId) {
      const item = get(targetId);
      if (!item) return '';
      items = [item];
      cols = [];
    } else if (scope === 'collection' && targetId) {
      const col = getCollection(targetId);
      if (!col) return '';
      const colItems = col.achievementIds
        .map((id) => get(id))
        .filter((a): a is Achievement => a !== null);
      items = colItems;
      cols = [col];
    }
    const payload: ExportPayload = {
      version: STORAGE_VERSION,
      exportedAt: nowIso(),
      app: 'personal-os-achievements',
      items,
      collections: cols,
    };
    return buildExport(payload);
  }

  /** 导入后 store 与 localStorage 保持一致；返回合并结果（含集合与冲突统计） */
  function importItems(payload: ImportPayload, mode: ImportMode): MergeOutcome {
    const outcome = mergeImport(achievements.value, collections.value, payload, mode, (prefix) =>
      prefix === 'col' ? nextCollectionId() : nextId(),
    );
    achievements.value = outcome.items;
    collections.value = outcome.collections;
    seq.value = Math.max(seq.value, outcome.items.length);
    collectionSeq.value = Math.max(collectionSeq.value, outcome.collections.length);
    selectedIds.value = selectedIds.value.filter((id) => outcome.items.some((a) => a.id === id));
    // 若当前聚焦集合被覆盖/移除，回退到无集合态
    if (
      activeCollectionId.value &&
      !collections.value.some((c) => c.id === activeCollectionId.value)
    ) {
      activeCollectionId.value = null;
    }
    persistItems();
    return outcome;
  }

  // 实例化即加载（测试中 localStorage 清空后会回退到种子数据）
  load();

  return {
    achievements,
    seq,
    collections,
    collectionSeq,
    savedFilters,
    activeCollectionId,
    ui,
    selectedIds,
    persistError,
    get,
    getCollection,
    add,
    update,
    remove,
    togglePin,
    toggleArchive,
    move,
    addCollection,
    updateCollection,
    removeCollection,
    addToCollection,
    removeFromCollection,
    moveCollectionItem,
    setActiveCollection,
    saveFilter,
    deleteSavedFilter,
    updateSavedFilter,
    batchSetPinned,
    batchSetArchived,
    batchDelete,
    toggleSelect,
    setSelection,
    clearSelection,
    setView,
    setFilters,
    exportJson,
    importItems,
    persist: persistItems,
    load,
  };
});
