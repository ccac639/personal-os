/**
 * Chat 功能域 —— 智能体 Pinia store
 *
 * 职责：个人智能体目录（搜索 / 分类 / 收藏 / 最近使用 / 使用次数排序）、
 * 内置与个人变体管理（创建 / 编辑 / 复制 / 删除 / 隐藏）、
 * 启动智能体（构建输入上下文 → 创建新会话 → 记录使用）。
 * 持久化收敛到 agent-storage.ts，组件不得直接读写 localStorage。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import {
  BUILTIN_AGENTS,
  buildAgentLaunchPrompt,
  deriveAgentVariant,
  filterAgents,
  sortAgents,
} from './agents';
import { loadAgentLibrary, saveAgentLibrary } from './agent-storage';
import { useChatStore } from './store';
import type {
  AgentFilters,
  AgentLaunchInputs,
  AgentSortKey,
  ChatAgent,
} from './agent-types';

export const useAgentsStore = defineStore('chat-agents', () => {
  const { custom: initialCustom, states: initialStates, recovered } =
    loadAgentLibrary();

  /** 个人变体 */
  const custom = ref<ChatAgent[]>(initialCustom);
  /** 内置智能体的状态覆盖（收藏 / 隐藏 / 使用记录） */
  const states = ref(initialStates);
  const recoveredFlag = ref(recovered);

  /** UI 筛选（不持久化） */
  const filters = ref<AgentFilters>({
    keyword: '',
    category: 'all',
    favoritesOnly: false,
  });
  const sortBy = ref<AgentSortKey>('default');

  /** 表单预填（从消息 / 灵感创建变体时导航到智能体中心并打开表单） */
  const pendingPrefill = ref<{
    source: 'message' | 'inspiration';
    title: string;
    prompt: string;
    relatedId?: string;
  } | null>(null);

  watch(
    [custom, states],
    ([c, s]) => {
      saveAgentLibrary(c, s);
    },
    { deep: true },
  );

  /** 合并后的完整目录：内置 + 个人变体 + 状态覆盖 */
  const agents = computed<ChatAgent[]>(() => {
    const builtins = BUILTIN_AGENTS.map((b) => {
      const st = states.value[b.id];
      if (!st) return b;
      return {
        ...b,
        favorite: st.favorite ?? b.favorite,
        hidden: st.hidden ?? b.hidden,
        lastUsedAt: st.lastUsedAt ?? b.lastUsedAt,
        usageCount: st.usageCount ?? b.usageCount,
      };
    });
    return [...builtins, ...custom.value];
  });

  const visibleAgents = computed(() =>
    sortAgents(filterAgents(agents.value, filters.value), sortBy.value),
  );

  const activeFilterCount = computed(() => {
    let n = 0;
    if (filters.value.keyword.trim()) n += 1;
    if (filters.value.category !== 'all') n += 1;
    if (filters.value.favoritesOnly) n += 1;
    return n;
  });

  function agentById(id: string): ChatAgent | undefined {
    return agents.value.find((a) => a.id === id);
  }

  function setKeyword(keyword: string) {
    filters.value.keyword = keyword;
  }

  function setCategory(category: AgentFilters['category']) {
    filters.value.category = category;
  }

  function toggleFavoritesOnly() {
    filters.value.favoritesOnly = !filters.value.favoritesOnly;
  }

  function setSortBy(by: AgentSortKey) {
    sortBy.value = by;
  }

  function clearFilters() {
    filters.value = { keyword: '', category: 'all', favoritesOnly: false };
    sortBy.value = 'default';
  }

  /** 收藏切换（内置 / 变体通用） */
  function toggleFavorite(id: string) {
    const a = agentById(id);
    if (!a) return;
    if (a.builtin) {
      const st = states.value[id] ?? {};
      states.value[id] = { ...st, favorite: !(st.favorite ?? a.favorite) };
    } else {
      const target = custom.value.find((x) => x.id === id);
      if (target) target.favorite = !target.favorite;
    }
  }

  /** 隐藏切换（仅内置；隐藏后不再出现在目录） */
  function toggleHidden(id: string) {
    const a = agentById(id);
    if (!a || !a.builtin) return;
    const st = states.value[id] ?? {};
    states.value[id] = { ...st, hidden: !(st.hidden ?? a.hidden) };
  }

  /** 记录使用（内置 / 变体通用） */
  function recordUsage(id: string) {
    const a = agentById(id);
    if (!a) return;
    if (a.builtin) {
      const st = states.value[id] ?? {};
      states.value[id] = {
        ...st,
        lastUsedAt: Date.now(),
        usageCount: (st.usageCount ?? a.usageCount) + 1,
      };
    } else {
      const target = custom.value.find((x) => x.id === id);
      if (target) {
        target.lastUsedAt = Date.now();
        target.usageCount += 1;
        target.updatedAt = Date.now();
      }
    }
  }

  /* ---------- 个人变体 CRUD ---------- */

  /** 创建个人变体（从空表单或复制来源）；返回新智能体或 null */
  function createVariant(data: Partial<ChatAgent>): ChatAgent | null {
    const base = data.id ? agentById(data.id) : undefined;
    const variant = deriveAgentVariant(base ?? emptyBase(), data);
    custom.value = [...custom.value, variant];
    return variant;
  }

  function emptyBase(): ChatAgent {
    const now = Date.now();
    return {
      id: '',
      name: '',
      description: '',
      category: 'writing',
      icon: 'pen-line',
      color: 'var(--chat-rose)',
      tags: [],
      systemPrompt: '',
      recommendedModelId: 'general-reasoning',
      recommendedMode: 'chat',
      starterPrompts: [],
      inputFields: [],
      builtin: false,
      favorite: false,
      hidden: false,
      lastUsedAt: null,
      usageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** 更新个人变体；内置或不存在返回 false */
  function updateVariant(id: string, data: Partial<ChatAgent>): boolean {
    const idx = custom.value.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    const updated = { ...custom.value[idx]!, ...data, id, builtin: false, updatedAt: Date.now() };
    custom.value = custom.value.map((a, i) => (i === idx ? updated : a));
    return true;
  }

  /** 复制为个人变体（任意来源均可）；返回新变体或 null */
  function duplicateAgent(id: string): ChatAgent | null {
    const a = agentById(id);
    if (!a) return null;
    return createVariant(a);
  }

  /** 删除个人变体；内置不可删除返回 false */
  function deleteVariant(id: string): boolean {
    const a = agentById(id);
    if (!a || a.builtin) return false;
    custom.value = custom.value.filter((x) => x.id !== id);
    return true;
  }

  /* ---------- 启动智能体 ---------- */

  /**
   * 启动智能体：校验输入 → 创建新会话（继承推荐模型 / 模式 / 系统提示词 /
   * 草稿）→ 记录使用。初始内容不自动发送。
   * 返回是否成功；失败（必填缺失）返回 false 并置错误信息。
   */
  function launchAgent(
    id: string,
    inputs: AgentLaunchInputs,
  ): { ok: boolean; sessionId?: string; error?: string } {
    const agent = agentById(id);
    if (!agent) return { ok: false, error: '智能体不存在' };
    const prompt = buildAgentLaunchPrompt(agent, inputs);
    if (prompt === null) return { ok: false, error: '请填写必填项' };

    const chatStore = useChatStore();
    chatStore.launchAgentSession({
      agentId: agent.id,
      agentName: agent.name,
      systemPrompt: agent.systemPrompt,
      modelId: agent.recommendedModelId,
      mode: agent.recommendedMode,
      draft: prompt,
    });
    recordUsage(id);
    return { ok: true, sessionId: chatStore.activeId ?? undefined };
  }

  /* ---------- 预填（从消息 / 灵感创建变体） ---------- */

  function prefillFromMessage(messageId: string, content: string, sessionId: string) {
    pendingPrefill.value = {
      source: 'message',
      title: normalizeVariantTitle(content),
      prompt: content,
      relatedId: sessionId,
    };
  }

  function prefillFromInspiration(inspirationId: string, title: string, prompt: string) {
    pendingPrefill.value = {
      source: 'inspiration',
      title: normalizeVariantTitle(title),
      prompt,
      relatedId: inspirationId,
    };
  }

  function clearPrefill() {
    pendingPrefill.value = null;
  }

  return {
    agents,
    custom,
    states,
    recovered: recoveredFlag,
    filters,
    sortBy,
    pendingPrefill,
    visibleAgents,
    activeFilterCount,
    agentById,
    setKeyword,
    setCategory,
    toggleFavoritesOnly,
    setSortBy,
    clearFilters,
    toggleFavorite,
    toggleHidden,
    recordUsage,
    createVariant,
    updateVariant,
    duplicateAgent,
    deleteVariant,
    launchAgent,
    prefillFromMessage,
    prefillFromInspiration,
    clearPrefill,
  };
});

/** 从消息 / 灵感内容生成变体名（首行截断） */
function normalizeVariantTitle(input: string): string {
  const firstLine = input.split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 18) || '新智能体';
}
