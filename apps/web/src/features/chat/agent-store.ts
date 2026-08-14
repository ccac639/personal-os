/**
 * Chat 功能域 —— 智能体 Pinia store（后端数据源）
 *
 * 数据源：apps/api /agents（唯一主数据源），经 services/agents.ts 的 agentsApi 访问；
 * 不直接依赖 Agents 管理页 Pinia store。
 *
 * - 列表：加载中 / 空 / 失败（含 requestId）/ 重试；
 * - 变更：收藏 / 隐藏 / 创建 / 编辑 / 复制 / 删除（真实后端契约）；
 * - 启动：POST /agents/:id/start → { agent, conversationId } →
 *   以 conversationId 为会话 id 创建本地会话并导航；成功后刷新列表，
 *   usageCount / lastUsedAt 由服务端更新后回读；
 * - 防重复：launchingIds / togglingIds / deletingIds / saving 通道；
 * - 失败：保留服务端 code / statusCode / requestId（经 toAgentErrorInfo）。
 *
 * 展示适配：后端记录不含 category / icon / color / tags / starterPrompts /
 * inputFields / recommendedMode 等前端展示字段，由 {@link toChatAgent}
 * 派生稳定默认值；这些字段仅用于展示与启动草稿构建，不写回后端。
 *
 * 旧 localStorage 目录（agent-storage.ts）不再消费主数据；文件与既有数据
 * 保留不删（避免数据损失），列为后续清理项。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { agentsApi } from '@/services/agents';
import type { AgentRecord, CreateAgentPayload, UpdateAgentPayload } from '@/services/agents';

import { toAgentErrorInfo } from '@/features/agents/errors';
import type { AgentErrorInfo } from '@/features/agents/errors';

import { buildAgentLaunchPrompt, filterAgents, sortAgents } from './agents';
import { useChatStore } from './store';
import { CHAT_MODELS } from './models';
import type {
  AgentCategory,
  AgentFilters,
  AgentLaunchInputs,
  AgentSortKey,
  ChatAgent,
} from './agent-types';

/** 单页拉取上限（后端 pageSize max 100） */
export const AGENT_LIST_PAGE_SIZE = 100;

/** 类别展示元数据（与 chat/agents.ts 的 AGENT_CATEGORIES / ICON_MAP 对齐） */
const CATEGORY_ICON: Record<AgentCategory, string> = {
  writing: 'pen-line',
  code: 'code-2',
  planning: 'list-todo',
  research: 'library',
  vision: 'image',
  efficiency: 'zap',
};

const CATEGORY_COLOR: Record<AgentCategory, string> = {
  writing: 'var(--chat-rose)',
  code: 'var(--chat-teal)',
  planning: 'var(--chat-cyan)',
  research: 'var(--chat-mono)',
  vision: 'var(--chat-orange)',
  efficiency: 'var(--chat-cyan)',
};

/** 名称 / 描述关键词 → 展示类别（后端无类别字段，仅用于展示） */
const CATEGORY_RULES: ReadonlyArray<[AgentCategory, RegExp]> = [
  ['writing', /润色|写作|文案|文章|邮件|文笔|编辑|成稿/],
  ['code', /代码|评审|重构|调试|编程|审查|类型/],
  ['planning', /规划|计划|项目|排期|拆解|里程碑/],
  ['research', /研究|整理|灵感|资料|调研|提炼|总结/],
  ['vision', /视觉|图像|图片|绘画|画/],
] as const;

function presentCategory(record: AgentRecord): AgentCategory {
  const text = `${record.name} ${record.description ?? ''}`;
  for (const [category, rule] of CATEGORY_RULES) {
    if (rule.test(text)) return category;
  }
  return 'efficiency';
}

/** 后端 model 字符串 → 前端 CHAT_MODELS id（匹配不到回退默认） */
export function modelIdFor(model: string): string {
  return CHAT_MODELS.some((m) => m.id === model) ? model : 'general-reasoning';
}

/**
 * 后端记录 → Chat 展示模型（纯函数）。
 * 真实数据（名称/简介/提示词/收藏/隐藏/启用/使用记录）来自后端；
 * 展示字段（类别/图标/颜色/标签/示例任务/输入字段/输出模式）派生默认值。
 */
export function toChatAgent(record: AgentRecord): ChatAgent {
  const category = presentCategory(record);
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? '',
    category,
    icon: CATEGORY_ICON[category],
    color: CATEGORY_COLOR[category],
    tags: [],
    systemPrompt: record.systemPrompt ?? '',
    recommendedModelId: modelIdFor(record.model),
    recommendedMode: 'chat',
    starterPrompts: [],
    inputFields: [],
    builtin: record.kind === 'builtin',
    favorite: record.favorite,
    hidden: record.hidden,
    lastUsedAt: record.lastUsedAt ? new Date(record.lastUsedAt).getTime() : null,
    usageCount: record.usageCount,
    createdAt: new Date(record.createdAt).getTime(),
    updatedAt: new Date(record.updatedAt).getTime(),
  };
}

/** 表单数据 → 后端创建载荷（不含 id / 时间戳 / usageCount / ownerId / userId） */
function toCreatePayload(data: Partial<ChatAgent>): CreateAgentPayload {
  return {
    name: data.name?.trim() || '未命名智能体',
    description: data.description?.trim() || undefined,
    // model / provider 不传：后端使用默认值（gpt-4o-mini / openai），
    // 避免把前端 CHAT_MODELS 的 mock id 写入后端契约。
    systemPrompt: data.systemPrompt?.trim() || undefined,
    favorite: data.favorite ?? false,
  };
}

/** 表单数据 → 后端更新载荷（仅提交实际变化的字段） */
function toUpdatePayload(data: Partial<ChatAgent>, current: ChatAgent): UpdateAgentPayload {
  const payload: UpdateAgentPayload = {};
  if (data.name !== undefined && data.name.trim() !== current.name) payload.name = data.name.trim();
  if (data.description !== undefined && data.description.trim() !== current.description) {
    payload.description = data.description.trim();
  }
  if (data.systemPrompt !== undefined && data.systemPrompt.trim() !== current.systemPrompt) {
    payload.systemPrompt = data.systemPrompt.trim();
  }
  return payload;
}

export const useAgentsStore = defineStore('chat-agents', () => {
  /* ---------- 列表状态（后端数据源） ---------- */
  const records = ref<AgentRecord[]>([]);
  const total = ref(0);
  const listLoading = ref(false);
  const loaded = ref(false);
  const listError = ref<AgentErrorInfo | null>(null);

  /* ---------- UI 筛选（不持久化） ---------- */
  const filters = ref<AgentFilters>({ keyword: '', category: 'all', favoritesOnly: false });
  const sortBy = ref<AgentSortKey>('default');

  /* ---------- 变更 pending 通道 ---------- */
  const launchingIds = ref<string[]>([]);
  const togglingIds = ref<string[]>([]);
  const deletingIds = ref<string[]>([]);
  const saving = ref(false);
  const actionError = ref<AgentErrorInfo | null>(null);

  /** 表单预填（从消息 / 灵感创建变体时导航到智能体中心并打开表单） */
  const pendingPrefill = ref<{
    source: 'message' | 'inspiration';
    title: string;
    prompt: string;
    relatedId?: string;
  } | null>(null);

  /* ---------- 派生 ---------- */
  const agents = computed<ChatAgent[]>(() => records.value.map(toChatAgent));

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

  /* ---------- 列表加载 / 重试 ---------- */

  async function fetchAgents(): Promise<void> {
    listLoading.value = true;
    listError.value = null;
    try {
      const res = await agentsApi.list({ pageSize: AGENT_LIST_PAGE_SIZE });
      records.value = res.items;
      total.value = res.total;
      loaded.value = true;
    } catch (err) {
      loaded.value = true;
      listError.value = toAgentErrorInfo(err, '加载智能体列表失败，请稍后再试');
    } finally {
      listLoading.value = false;
    }
  }

  function retry(): Promise<void> {
    return fetchAgents();
  }

  /* ---------- 筛选（UI 状态） ---------- */

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

  /* ---------- 变更（真实后端） ---------- */

  function upsertRecord(updated: AgentRecord): void {
    const idx = records.value.findIndex((r) => r.id === updated.id);
    if (idx >= 0) records.value[idx] = updated;
    else records.value = [...records.value, updated];
  }

  function setActionError(err: unknown, fallback: string): void {
    actionError.value = toAgentErrorInfo(err, fallback);
  }

  function clearActionError(): void {
    actionError.value = null;
  }

  /** 收藏切换（内置 / 个人通用）；返回是否成功 */
  async function toggleFavorite(id: string): Promise<boolean> {
    const a = agentById(id);
    if (!a || togglingIds.value.includes(id)) return false;
    togglingIds.value = [...togglingIds.value, id];
    try {
      const updated = await agentsApi.update(id, { favorite: !a.favorite });
      upsertRecord(updated);
      return true;
    } catch (err) {
      setActionError(err, '收藏操作失败，请稍后再试');
      return false;
    } finally {
      togglingIds.value = togglingIds.value.filter((x) => x !== id);
    }
  }

  /** 隐藏切换（仅内置；后端禁止删除内置）；返回是否成功 */
  async function toggleHidden(id: string): Promise<boolean> {
    const a = agentById(id);
    if (!a || !a.builtin || togglingIds.value.includes(id)) return false;
    togglingIds.value = [...togglingIds.value, id];
    try {
      const updated = await agentsApi.update(id, { hidden: !a.hidden });
      upsertRecord(updated);
      return true;
    } catch (err) {
      setActionError(err, '隐藏操作失败，请稍后再试');
      return false;
    } finally {
      togglingIds.value = togglingIds.value.filter((x) => x !== id);
    }
  }

  /** 创建个人智能体（后端）；返回新记录或 null */
  async function createAgent(data: Partial<ChatAgent>): Promise<AgentRecord | null> {
    if (saving.value) return null;
    saving.value = true;
    try {
      const created = await agentsApi.create(toCreatePayload(data));
      records.value = [...records.value, created];
      return created;
    } catch (err) {
      setActionError(err, '创建智能体失败，请稍后再试');
      return null;
    } finally {
      saving.value = false;
    }
  }

  /** 更新个人智能体（后端）；返回是否成功 */
  async function updateAgent(id: string, data: Partial<ChatAgent>): Promise<boolean> {
    const a = agentById(id);
    if (!a || a.builtin || saving.value) return false;
    saving.value = true;
    try {
      const updated = await agentsApi.update(id, toUpdatePayload(data, a));
      upsertRecord(updated);
      return true;
    } catch (err) {
      setActionError(err, '保存修改失败，请稍后再试');
      return false;
    } finally {
      saving.value = false;
    }
  }

  /** 复制任意智能体为个人变体（后端）；返回新记录或 null */
  async function duplicateAgent(id: string): Promise<AgentRecord | null> {
    const a = agentById(id);
    if (!a) return null;
    return createAgent({
      name: `${a.name}（变体）`,
      description: a.description,
      systemPrompt: a.systemPrompt,
    });
  }

  /** 删除个人智能体（后端）；内置不可删除返回 false */
  async function deleteAgent(id: string): Promise<boolean> {
    const a = agentById(id);
    if (!a || a.builtin || deletingIds.value.includes(id)) return false;
    deletingIds.value = [...deletingIds.value, id];
    try {
      await agentsApi.remove(id);
      records.value = records.value.filter((r) => r.id !== id);
      return true;
    } catch (err) {
      setActionError(err, '删除失败，请稍后再试');
      return false;
    } finally {
      deletingIds.value = deletingIds.value.filter((x) => x !== id);
    }
  }

  /* ---------- 启动智能体（后端会话） ---------- */

  /**
   * 启动智能体：校验输入 → POST /agents/:id/start → 以返回的 conversationId
   * 创建本地会话（继承系统提示词 / 推荐模型 / 草稿）→ 刷新列表（usageCount /
   * lastUsedAt 更新）。防重复：同一智能体启动中拒绝再次点击。
   * 失败保留服务端 code / statusCode / requestId。
   */
  async function launchAgent(
    id: string,
    inputs: AgentLaunchInputs,
  ): Promise<
    { ok: true; sessionId: string } | { ok: false; error: string; info?: AgentErrorInfo }
  > {
    const agent = agentById(id);
    if (!agent) return { ok: false, error: '智能体不存在' };
    const prompt = buildAgentLaunchPrompt(agent, inputs);
    if (prompt === null) return { ok: false, error: '请填写必填项' };
    if (launchingIds.value.includes(id)) return { ok: false, error: '正在启动，请稍候' };

    launchingIds.value = [...launchingIds.value, id];
    try {
      const result = await agentsApi.start(id, { title: agent.name });
      const chatStore = useChatStore();
      chatStore.launchAgentSession({
        id: result.conversationId,
        agentId: agent.id,
        agentName: agent.name,
        systemPrompt: agent.systemPrompt,
        modelId: agent.recommendedModelId,
        mode: agent.recommendedMode,
        draft: prompt,
      });
      // 刷新列表：usageCount / lastUsedAt 由服务端更新后回读
      await fetchAgents();
      return { ok: true, sessionId: result.conversationId };
    } catch (err) {
      const info = toAgentErrorInfo(err, '启动智能体失败，请稍后再试');
      actionError.value = info;
      return { ok: false, error: info.message, info };
    } finally {
      launchingIds.value = launchingIds.value.filter((x) => x !== id);
    }
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

  // 首次使用时自动加载（Pinia setup store 创建时执行一次）
  void fetchAgents();

  return {
    records,
    total,
    listLoading,
    loaded,
    listError,
    agents,
    visibleAgents,
    activeFilterCount,
    filters,
    sortBy,
    pendingPrefill,
    launchingIds,
    togglingIds,
    deletingIds,
    saving,
    actionError,
    agentById,
    fetchAgents,
    retry,
    setKeyword,
    setCategory,
    toggleFavoritesOnly,
    setSortBy,
    clearFilters,
    toggleFavorite,
    toggleHidden,
    createAgent,
    updateAgent,
    duplicateAgent,
    deleteAgent,
    launchAgent,
    prefillFromMessage,
    prefillFromInspiration,
    clearPrefill,
    clearActionError,
  };
});

/** 从消息 / 灵感内容生成变体名（首行截断） */
function normalizeVariantTitle(input: string): string {
  const firstLine = input.split('\n')[0]?.trim() ?? '';
  return firstLine.slice(0, 18) || '新智能体';
}
