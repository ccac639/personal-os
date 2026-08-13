/**
 * 项目知识 —— Pinia store（独立边界）
 *
 * 三类条目（决策 / 问题 / 参考）本地持久化（knowledge-persistence）。
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { loadKnowledgeData, saveKnowledgeData } from './knowledge-persistence';
import {
  uid,
  type DecisionStatus,
  type IssueStatus,
  type KnowledgeEntry,
  type KnowledgeType,
} from './knowledge';

export const useKnowledgeStore = defineStore('knowledge', () => {
  const initial = loadKnowledgeData();
  const entries = ref<KnowledgeEntry[]>(initial.data);
  const storageWarning = ref<string | null>(initial.notice);

  watch(
    entries,
    () => {
      const saved = saveKnowledgeData(entries.value);
      if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    },
    { deep: true, flush: 'sync' },
  );

  function entriesOf(projectId: string): KnowledgeEntry[] {
    return entries.value
      .filter((e) => e.projectId === projectId)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }

  function entryById(id: string): KnowledgeEntry | null {
    return entries.value.find((e) => e.id === id) ?? null;
  }

  function createEntry(input: {
    projectId: string;
    type: KnowledgeType;
    title: string;
    body: string;
    tags: string[];
    taskIds?: string[];
    milestoneIds?: string[];
    decisionStatus?: DecisionStatus;
    issueStatus?: IssueStatus;
  }): KnowledgeEntry {
    const now = new Date().toISOString();
    const entry: KnowledgeEntry = {
      id: uid('kn-'),
      projectId: input.projectId,
      type: input.type,
      title: input.title.trim(),
      body: input.body.trim(),
      tags: [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))],
      taskIds: [...new Set(input.taskIds ?? [])],
      milestoneIds: [...new Set(input.milestoneIds ?? [])],
      decisionStatus: input.type === 'decision' ? (input.decisionStatus ?? 'pending') : undefined,
      issueStatus: input.type === 'issue' ? (input.issueStatus ?? 'open') : undefined,
      createdAt: now,
      updatedAt: now,
    };
    entries.value.push(entry);
    return entry;
  }

  function updateEntry(id: string, patch: Partial<KnowledgeEntry>): boolean {
    const e = entryById(id);
    if (!e) return false;
    if (patch.title !== undefined) e.title = patch.title.trim();
    if (patch.body !== undefined) e.body = patch.body.trim();
    if (patch.tags !== undefined)
      e.tags = [...new Set(patch.tags.map((t) => t.trim()).filter(Boolean))];
    if (patch.taskIds !== undefined) e.taskIds = [...new Set(patch.taskIds)];
    if (patch.milestoneIds !== undefined) e.milestoneIds = [...new Set(patch.milestoneIds)];
    if (patch.type === 'decision' && patch.decisionStatus !== undefined)
      e.decisionStatus = patch.decisionStatus;
    if (patch.type === 'issue' && patch.issueStatus !== undefined)
      e.issueStatus = patch.issueStatus;
    if (patch.issueStatus !== undefined && e.type === 'issue') e.issueStatus = patch.issueStatus;
    if (patch.decisionStatus !== undefined && e.type === 'decision')
      e.decisionStatus = patch.decisionStatus;
    e.updatedAt = new Date().toISOString();
    return true;
  }

  function deleteEntry(id: string): void {
    entries.value = entries.value.filter((e) => e.id !== id);
  }

  function deleteByProject(projectId: string): void {
    entries.value = entries.value.filter((e) => e.projectId !== projectId);
  }

  function dismissStorageWarning(): void {
    storageWarning.value = null;
  }

  return {
    entries,
    storageWarning,
    entriesOf,
    entryById,
    createEntry,
    updateEntry,
    deleteEntry,
    deleteByProject,
    dismissStorageWarning,
  };
});
