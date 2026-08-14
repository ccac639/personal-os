/**
 * Agents 管理功能域 —— Pinia store
 *
 * 职责：
 * - 列表加载（服务端分页 + q 模糊匹配）、客户端状态筛选（启用 / 停用 / 收藏）；
 * - 创建 / 编辑 / 删除 / 收藏 / 启用切换，全部对接真实后端（services/agents）；
 * - 清晰的 pending 通道防重复提交：
 *     saving        —— 创建 / 编辑表单提交中（全局，表单级）
 *     togglingIds   —— 收藏 / 启用等行级切换中
 *     deletingIds   —— 行级删除中
 * - API 失败统一转 {@link AgentErrorInfo}，保留服务端 requestId。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { agentsApi } from '@/services/agents';
import type { AgentRecord, CreateAgentPayload, UpdateAgentPayload } from '@/services/agents';

import { toAgentErrorInfo } from './errors';
import type { AgentErrorInfo } from './errors';
import type { AgentStatusFilter } from './types';

/** 单页拉取上限（后端 pageSize max 100；个人 OS 规模一次性加载足够） */
export const AGENT_PAGE_SIZE = 100;

/** 更新通道：表单提交 / 行级切换 */
export type AgentUpdateMode = 'form' | 'toggle';

export const useAgentAdminStore = defineStore('agents', () => {
  /* ---------- 列表状态 ---------- */
  const items = ref<AgentRecord[]>([]);
  const total = ref(0);
  const page = ref(1);
  const pageSize = ref(AGENT_PAGE_SIZE);
  /** 首次加载是否完成（区分「加载中」与「加载失败」） */
  const loaded = ref(false);
  const listLoading = ref(false);
  const listError = ref<AgentErrorInfo | null>(null);

  /* ---------- UI 筛选 ---------- */
  const keyword = ref('');
  const statusFilter = ref<AgentStatusFilter>('all');
  const favoritesOnly = ref(false);

  /* ---------- 变更 pending 状态 ---------- */
  const saving = ref(false);
  const togglingIds = ref<string[]>([]);
  const deletingIds = ref<string[]>([]);
  const actionError = ref<AgentErrorInfo | null>(null);

  /* ---------- 派生 ---------- */
  const visibleAgents = computed(() => {
    let list = items.value;
    if (statusFilter.value === 'enabled') list = list.filter((a) => a.enabled);
    else if (statusFilter.value === 'disabled') list = list.filter((a) => !a.enabled);
    if (favoritesOnly.value) list = list.filter((a) => a.favorite);
    return list;
  });

  const activeFilterCount = computed(
    () => (statusFilter.value === 'all' ? 0 : 1) + (favoritesOnly.value ? 1 : 0),
  );

  /* ---------- 工具 ---------- */
  function agentById(id: string): AgentRecord | undefined {
    return items.value.find((a) => a.id === id);
  }

  function patchItem(record: AgentRecord): void {
    const idx = items.value.findIndex((a) => a.id === record.id);
    if (idx >= 0) items.value[idx] = record;
  }

  function dropItem(id: string): void {
    items.value = items.value.filter((a) => a.id !== id);
    total.value = Math.max(0, total.value - 1);
  }

  /* ---------- 列表加载 ---------- */
  async function fetchList(): Promise<void> {
    if (listLoading.value) return;
    listLoading.value = true;
    listError.value = null;
    try {
      const res = await agentsApi.list({
        q: keyword.value.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
      });
      items.value = res.items;
      total.value = res.total;
      page.value = res.page;
      pageSize.value = res.pageSize;
      loaded.value = true;
    } catch (err) {
      listError.value = toAgentErrorInfo(err, '加载智能体列表失败');
    } finally {
      listLoading.value = false;
    }
  }

  /* ---------- 筛选 ---------- */
  function setKeyword(q: string): void {
    keyword.value = q;
    page.value = 1;
  }

  function setStatusFilter(filter: AgentStatusFilter): void {
    statusFilter.value = filter;
  }

  function toggleFavoritesOnly(): void {
    favoritesOnly.value = !favoritesOnly.value;
  }

  function clearFilters(): void {
    keyword.value = '';
    statusFilter.value = 'all';
    favoritesOnly.value = false;
    page.value = 1;
  }

  /* ---------- 变更操作 ---------- */

  /** 创建（表单提交通道；提交中再次调用直接返回 null） */
  async function createAgent(payload: CreateAgentPayload): Promise<AgentRecord | null> {
    if (saving.value) return null;
    saving.value = true;
    actionError.value = null;
    try {
      const created = await agentsApi.create(payload);
      // 以服务端排序（收藏 / 使用次数 / 更新时间）为准刷新列表
      await fetchList();
      return created;
    } catch (err) {
      actionError.value = toAgentErrorInfo(err, '创建智能体失败');
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** 更新（form：表单提交；toggle：行级切换），各自防重复提交 */
  async function updateAgent(
    id: string,
    payload: UpdateAgentPayload,
    mode: AgentUpdateMode = 'form',
  ): Promise<AgentRecord | null> {
    if (mode === 'form') {
      if (saving.value) return null;
      saving.value = true;
    } else {
      if (togglingIds.value.includes(id)) return null;
      togglingIds.value = [...togglingIds.value, id];
    }
    actionError.value = null;
    try {
      const updated = await agentsApi.update(id, payload);
      patchItem(updated);
      return updated;
    } catch (err) {
      actionError.value = toAgentErrorInfo(err, '保存失败');
      return null;
    } finally {
      if (mode === 'form') {
        saving.value = false;
      } else {
        togglingIds.value = togglingIds.value.filter((x) => x !== id);
      }
    }
  }

  /** 删除（行级 pending；内置模板后端返回 400 时以错误提示呈现） */
  async function removeAgent(id: string): Promise<boolean> {
    if (deletingIds.value.includes(id)) return false;
    deletingIds.value = [...deletingIds.value, id];
    actionError.value = null;
    try {
      await agentsApi.remove(id);
      dropItem(id);
      return true;
    } catch (err) {
      actionError.value = toAgentErrorInfo(err, '删除失败');
      return false;
    } finally {
      deletingIds.value = deletingIds.value.filter((x) => x !== id);
    }
  }

  /** 收藏切换（行级 pending） */
  async function toggleFavorite(id: string): Promise<boolean> {
    const agent = agentById(id);
    if (!agent) return false;
    return (await updateAgent(id, { favorite: !agent.favorite }, 'toggle')) !== null;
  }

  /** 启用 / 停用切换（行级 pending） */
  async function setEnabled(id: string, enabled: boolean): Promise<boolean> {
    return (await updateAgent(id, { enabled }, 'toggle')) !== null;
  }

  function clearActionError(): void {
    actionError.value = null;
  }

  return {
    items,
    total,
    page,
    pageSize,
    loaded,
    listLoading,
    listError,
    keyword,
    statusFilter,
    favoritesOnly,
    saving,
    togglingIds,
    deletingIds,
    actionError,
    visibleAgents,
    activeFilterCount,
    agentById,
    fetchList,
    setKeyword,
    setStatusFilter,
    toggleFavoritesOnly,
    clearFilters,
    createAgent,
    updateAgent,
    removeAgent,
    toggleFavorite,
    setEnabled,
    clearActionError,
  };
});
