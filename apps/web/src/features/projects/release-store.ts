/**
 * 发布管理 —— Pinia store（独立边界）
 *
 * 检查单草稿 / 发布记录 / 个人模板，独立持久化（releases-persistence）。
 * 检查单完成 → 生成发布记录并写入项目活动流；发布记录供复盘视图消费。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { useProjectStore } from './store';
import {
  loadReleaseTemplates,
  loadReleasesData,
  saveReleasesData,
  saveReleaseTemplates,
} from './releases-persistence';
import {
  BUILTIN_RELEASE_TEMPLATES,
  createReleaseTemplate,
  deleteReleaseTemplate,
  recordFromChecklist,
  type ReleaseChecklist,
  type ReleaseRecord,
  type ReleaseTemplate,
} from './releases';

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const useReleaseStore = defineStore('releases', () => {
  const initial = loadReleasesData();
  const checklists = ref<ReleaseChecklist[]>(initial.data.checklists);
  const records = ref<ReleaseRecord[]>(initial.data.records);
  const customTemplates = ref<ReleaseTemplate[]>(loadReleaseTemplates());
  const storageWarning = ref<string | null>(initial.notice);

  const projectStore = useProjectStore();

  watch(
    [checklists, records],
    () => {
      const saved = saveReleasesData({ checklists: checklists.value, records: records.value });
      if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    },
    { deep: true, flush: 'sync' },
  );
  watch(
    customTemplates,
    () => {
      const saved = saveReleaseTemplates(customTemplates.value);
      if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    },
    { deep: true, flush: 'sync' },
  );

  const allTemplates = computed<ReleaseTemplate[]>(() => [
    ...customTemplates.value,
    ...BUILTIN_RELEASE_TEMPLATES,
  ]);

  function checklistsOf(projectId: string): ReleaseChecklist[] {
    return checklists.value
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  function recordsOf(projectId: string): ReleaseRecord[] {
    return records.value
      .filter((r) => r.projectId === projectId)
      .sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
  }

  function checklistById(id: string): ReleaseChecklist | null {
    return checklists.value.find((c) => c.id === id) ?? null;
  }

  /** 新建 / 更新检查单草稿（编辑由组件直接改字段后调用；id 可选用于更新） */
  function saveChecklist(
    input: Omit<ReleaseChecklist, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
  ): ReleaseChecklist {
    const now = new Date().toISOString();
    const existing = checklistById(input.id ?? '');
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
      return existing;
    }
    const checklist: ReleaseChecklist = {
      ...input,
      id: uid('rel-'),
      createdAt: now,
      updatedAt: now,
    };
    checklists.value.push(checklist);
    projectStore.addActivity(
      checklist.projectId,
      'release',
      '创建发布检查单',
      `${checklist.version} ${checklist.title}`,
    );
    return checklist;
  }

  /** 勾选检查项 */
  function toggleItem(checklistId: string, itemId: string): void {
    const c = checklistById(checklistId);
    if (!c) return;
    const item = c.items.find((i) => i.id === itemId);
    if (item) {
      item.done = !item.done;
      c.updatedAt = new Date().toISOString();
    }
  }

  /** 检查单完成 → 生成发布记录（不可再编辑），从草稿列表移除 */
  function completeChecklist(checklistId: string, releaseDate: string): ReleaseRecord | null {
    const c = checklistById(checklistId);
    if (!c || c.status !== 'draft') return null;
    const record = recordFromChecklist(c, releaseDate);
    records.value.push(record);
    checklists.value = checklists.value.filter((x) => x.id !== checklistId);
    projectStore.addActivity(
      c.projectId,
      'release',
      '完成发布',
      `${record.version} ${record.title}`,
    );
    return record;
  }

  function deleteChecklist(id: string): void {
    checklists.value = checklists.value.filter((c) => c.id !== id);
  }

  function deleteRecord(id: string): void {
    records.value = records.value.filter((r) => r.id !== id);
  }

  function addTemplate(input: { name: string; items: string[] }): ReleaseTemplate | null {
    const result = createReleaseTemplate(customTemplates.value, input);
    customTemplates.value = result.list;
    return result.template;
  }

  function removeTemplate(id: string): boolean {
    const result = deleteReleaseTemplate(customTemplates.value, id);
    if (!result.removed) return false;
    customTemplates.value = result.list;
    return true;
  }

  function dismissStorageWarning(): void {
    storageWarning.value = null;
  }

  return {
    checklists,
    records,
    customTemplates,
    allTemplates,
    storageWarning,
    checklistsOf,
    recordsOf,
    checklistById,
    saveChecklist,
    toggleItem,
    completeChecklist,
    deleteChecklist,
    deleteRecord,
    addTemplate,
    removeTemplate,
    dismissStorageWarning,
  };
});
