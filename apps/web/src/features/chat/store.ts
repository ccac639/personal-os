/**
 * Chat 功能域 —— Pinia store
 *
 * 职责：会话 CRUD、消息发送与流式输出（本地打字机模拟）、编辑重发、
 * 错误重试、模型库状态（筛选/搜索/收藏/当前模型）与创作控制台配置。
 * 持久化收敛到 storage.ts（zod 校验 + 版本号 + 安全回退），组件不得直接读写 localStorage。
 * 后续接入真实 LLM 时，仅需替换 ChatReplyService 实现，流式推进逻辑
 * （streamInto）可原样复用。
 */
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { budgetInfo, estimateSessionTokens } from './budget';
import {
  downloadTextFile,
  messageToMarkdown,
  sanitizeFilename,
  sessionToJson,
  sessionToMarkdown,
} from './export';
import {
  CHAT_MODELS,
  MODE_CATEGORY,
  categoryOf,
  modelById,
  recommendedModelForMode,
} from './models';
import { promptPresetName, systemPromptPresetById } from './presets';
import { getChatReplyService } from './service';
import {
  loadPreferences,
  loadSessions,
  savePreferences,
  saveSessions,
} from './storage';
import type {
  ChatMessage,
  ChatModelCategory,
  ChatOutputMode,
  ChatPreferences,
  ChatQuote,
  ChatReplyLength,
  ChatSession,
  ChatSessionStats,
  ChatSessionTimeFilter,
} from './types';
import { normalizeTitle, uid } from './utils';

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<ChatSession[]>(loadSessions());
  const activeId = ref<string | null>(sessions.value[0]?.id ?? null);
  const streamingMessageId = ref<string | null>(null);
  /** 正在编辑的消息 id（编辑并重新发送）；null 表示非编辑态 */
  const editingId = ref<string | null>(null);
  /** 引用回复目标（发送时附着到用户消息）；null 表示非引用态 */
  const quoteTarget = ref<ChatQuote | null>(null);

  const prefsResult = loadPreferences();
  const prefs = ref<ChatPreferences>(prefsResult.prefs);
  /** 偏好数据损坏被回退时提示 UI */
  const prefsRecovered = ref(prefsResult.recovered);

  let timer: ReturnType<typeof setInterval> | null = null;

  watch(
    sessions,
    (value) => {
      saveSessions(value);
    },
    { deep: true },
  );

  watch(
    prefs,
    (value) => {
      savePreferences(value);
    },
    { deep: true },
  );

  // 切换会话时清空引用态，避免跨会话残留
  watch(
    () => activeId.value,
    () => {
      quoteTarget.value = null;
    },
  );

  const activeSession = computed(
    () => sessions.value.find((s) => s.id === activeId.value) ?? null,
  );
  const isStreaming = computed(() => streamingMessageId.value !== null);

  /* ---------- 会话工作区：固定 / 归档 / 筛选 / 统计 ---------- */

  const DAY = 24 * 60 * 60 * 1000;

  const sessionModelFilter = computed(() => prefs.value.sessionModelFilter);
  const sessionTimeFilter = computed(() => prefs.value.sessionTimeFilter);
  const sessionBookmarkFilter = computed(
    () => prefs.value.sessionBookmarkFilter,
  );

  function inTimeWindow(ts: number, filter: ChatSessionTimeFilter): boolean {
    if (filter === 'all') return true;
    const span = filter === 'today' ? DAY : filter === 'week' ? 7 * DAY : 30 * DAY;
    return Date.now() - ts < span;
  }

  /** 默认可见会话：非归档 + 模型/时间/书签筛选，置顶优先、按更新时间倒序 */
  const visibleSessions = computed(() => {
    let list = sessions.value.filter((s) => !s.archived);
    const mf = prefs.value.sessionModelFilter;
    if (mf !== 'all') list = list.filter((s) => categoryOf(s.model) === mf);
    const tf = prefs.value.sessionTimeFilter;
    if (tf !== 'all') list = list.filter((s) => inTimeWindow(s.updatedAt, tf));
    if (prefs.value.sessionBookmarkFilter) {
      list = list.filter((s) => s.messages.some((m) => m.bookmarked));
    }
    return [...list].sort(
      (a, b) =>
        Number(b.pinned ?? false) - Number(a.pinned ?? false) ||
        b.updatedAt - a.updatedAt,
    );
  });

  /** 已归档会话（更新时间倒序） */
  const archivedSessions = computed(() =>
    [...sessions.value.filter((s) => s.archived)].sort(
      (a, b) => b.updatedAt - a.updatedAt,
    ),
  );

  function setSessionModelFilter(filter: ChatModelCategory | 'all') {
    prefs.value.sessionModelFilter = filter;
  }

  function setSessionTimeFilter(filter: ChatSessionTimeFilter) {
    prefs.value.sessionTimeFilter = filter;
  }

  function toggleSessionBookmarkFilter() {
    prefs.value.sessionBookmarkFilter = !prefs.value.sessionBookmarkFilter;
  }

  function togglePin(id: string) {
    const s = sessions.value.find((x) => x.id === id);
    if (s) s.pinned = !s.pinned;
  }

  function toggleArchive(id: string) {
    const s = sessions.value.find((x) => x.id === id);
    if (s) s.archived = !s.archived;
  }

  /** 批量删除：当前会话被删时回退到列表第一个 */
  function deleteSessions(ids: string[]) {
    if (ids.length === 0) return;
    stopStreaming();
    const set = new Set(ids);
    if (set.has(activeId.value ?? '')) activeId.value = null;
    sessions.value = sessions.value.filter((s) => !set.has(s.id));
    if (!activeId.value) activeId.value = sessions.value[0]?.id ?? null;
  }

  /** 会话统计快照（消息 / 轮次 / 书签 / 字符 / 估算 token） */
  function sessionStats(session: ChatSession | null): ChatSessionStats | null {
    if (!session) return null;
    const total = session.messages.length;
    const userMessages = session.messages.filter((m) => m.role === 'user').length;
    const bookmarks = session.messages.filter((m) => m.bookmarked).length;
    const chars = session.messages.reduce((n, m) => n + m.content.length, 0);
    return {
      total,
      userMessages,
      assistantMessages: total - userMessages,
      bookmarks,
      chars,
      estTokens: estimateSessionTokens(session),
    };
  }

  /** 上下文预算（面板 / 输入区提示） */
  function sessionBudget(session: ChatSession | null, modelId?: string) {
    return budgetInfo(session, modelId);
  }

  /* ---------- 输出模式 ↔ 模型能力联动 ---------- */

  /** 输出模式推荐模型（Composer 展示「推荐」，不强制切换） */
  const modeRecommendedModel = computed(() =>
    recommendedModelForMode(prefs.value.outputMode),
  );
  const modeCategory = computed(() => MODE_CATEGORY[prefs.value.outputMode]);

  /** 当前模型（全局偏好；新会话默认） */
  const currentModel = computed(() => prefs.value.currentModel);
  const currentModelInfo = computed(() => modelById(currentModel.value));

  /** 模型库：类别筛选 + 关键词搜索 + 仅看收藏 */
  const filteredModels = computed(() => {
    const q = prefs.value.modelQuery.trim().toLowerCase();
    return CHAT_MODELS.filter((m) => {
      if (prefs.value.modelFilter !== 'all' && m.category !== prefs.value.modelFilter) {
        return false;
      }
      if (prefs.value.showFavoritesOnly && !isFavorite(m.id)) return false;
      if (!q) return true;
      return (
        m.label.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q) ||
        m.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  });

  function isFavorite(modelId: string): boolean {
    return prefs.value.favorites.includes(modelId);
  }

  function findMessage(id: string): ChatMessage | null {
    for (const s of sessions.value) {
      const m = s.messages.find((x) => x.id === id);
      if (m) return m;
    }
    return null;
  }

  /** 会话中最后一条用户消息的索引；无则 -1 */
  function lastUserMessageIndex(session: ChatSession): number {
    for (let i = session.messages.length - 1; i >= 0; i -= 1) {
      if (session.messages[i]?.role === 'user') return i;
    }
    return -1;
  }

  /** 停止流式输出：保留已生成的部分内容 */
  function stopStreaming() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (streamingMessageId.value) {
      const msg = findMessage(streamingMessageId.value);
      if (msg) {
        msg.streaming = false;
        msg.content = msg.content.replace(/\s+$/, '');
      }
      streamingMessageId.value = null;
    }
  }

  /** 标记生成失败：清理流式态，保留占位消息供重试 */
  function markError(messageId: string) {
    stopStreaming();
    const msg = findMessage(messageId);
    if (msg) msg.error = true;
  }

  function createSession(model = prefs.value.currentModel): ChatSession {
    stopStreaming();
    const now = Date.now();
    const session: ChatSession = {
      id: uid(),
      title: '新对话',
      messages: [],
      model,
      createdAt: now,
      updatedAt: now,
    };
    sessions.value.unshift(session);
    activeId.value = session.id;
    return session;
  }

  function selectSession(id: string) {
    if (id === activeId.value) return;
    stopStreaming();
    activeId.value = id;
  }

  function deleteSession(id: string) {
    stopStreaming();
    const idx = sessions.value.findIndex((s) => s.id === id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
    if (activeId.value === id) {
      // 稳定选择最近的相邻会话：优先较新的相邻（删除前的前一个），
      // 否则较旧的相邻（删除前的后一个）；无会话时为 null（欢迎态）
      const target = sessions.value[Math.max(0, idx - 1)] ?? sessions.value[0] ?? null;
      activeId.value = target?.id ?? null;
    }
  }

  function renameSession(id: string, title: string) {
    const session = sessions.value.find((s) => s.id === id);
    if (session && title.trim()) {
      session.title = title.trim();
      session.updatedAt = Date.now();
    }
  }

  function clearSession(id: string) {
    stopStreaming();
    const session = sessions.value.find((s) => s.id === id);
    if (session) {
      session.messages = [];
      session.updatedAt = Date.now();
    }
  }

  function setModel(id: string, model: string) {
    const session = sessions.value.find((s) => s.id === id);
    if (session) session.model = model;
  }

  /* ---------- 模型库 / 创作控制台配置 ---------- */

  function setModelFilter(filter: ChatModelCategory | 'all') {
    prefs.value.modelFilter = filter;
  }

  function setModelQuery(query: string) {
    prefs.value.modelQuery = query;
  }

  function toggleShowFavoritesOnly() {
    prefs.value.showFavoritesOnly = !prefs.value.showFavoritesOnly;
  }

  function toggleFavorite(modelId: string) {
    const list = prefs.value.favorites;
    prefs.value.favorites = list.includes(modelId)
      ? list.filter((id) => id !== modelId)
      : [...list, modelId];
  }

  /** 切换当前模型：更新偏好与活跃会话的模型，不触碰消息 */
  function setCurrentModel(modelId: string) {
    if (!modelById(modelId)) return;
    prefs.value.currentModel = modelId;
    const session = activeSession.value;
    if (session) session.model = modelId;
  }

  function setOutputMode(mode: ChatOutputMode) {
    prefs.value.outputMode = mode;
  }

  function setReplyLength(length: ChatReplyLength) {
    prefs.value.replyLength = length;
  }

  function setSystemPromptEnabled(enabled: boolean) {
    prefs.value.systemPromptEnabled = enabled;
  }

  function setSidebarCollapsed(collapsed: boolean) {
    prefs.value.sidebarCollapsed = collapsed;
  }

  /* ---------- 会话级系统提示词 ---------- */

  const sessionSystemPrompt = computed(
    () => activeSession.value?.systemPrompt ?? null,
  );

  /** 应用预设：写入会话（presetId + 解析文本，导出自包含） */
  function setSessionSystemPrompt(presetId: string, text: string) {
    const s = activeSession.value;
    const t = text.trim();
    if (!s || !t) return;
    s.systemPrompt = { presetId, text: t };
    s.updatedAt = Date.now();
  }

  function setSessionCustomPrompt(text: string) {
    setSessionSystemPrompt('custom', text);
  }

  function clearSessionSystemPrompt() {
    const s = activeSession.value;
    if (s) {
      delete s.systemPrompt;
      s.updatedAt = Date.now();
    }
  }

  /** 恢复默认：重置为内置「通用协作」预设 */
  function restoreDefaultSystemPrompt() {
    const def = systemPromptPresetById('general-collab');
    if (!def) return;
    setSessionSystemPrompt(def.id, def.text);
  }

  /* ---------- 消息书签 / 引用回复 ---------- */

  function toggleBookmark(messageId: string) {
    const m = findMessage(messageId);
    if (m) m.bookmarked = !m.bookmarked;
  }

  /** 进入引用回复态：快照被引用消息（纯文本，不携带附件） */
  function beginQuote(messageId: string) {
    const m = findMessage(messageId);
    if (!m) return;
    quoteTarget.value = { id: m.id, role: m.role, content: m.content };
  }

  function clearQuote() {
    quoteTarget.value = null;
  }

  /** 最近使用的模型（当前会话模型优先，其次全局偏好） */
  const activeModelId = computed(
    () => activeSession.value?.model ?? prefs.value.currentModel,
  );

  /* ---------- 消息流 ---------- */

  /** 打字机式推进：每 16ms 追加 1-3 个字符，输出完整后自动收尾 */
  function streamInto(messageId: string, full: string) {
    stopStreaming();
    streamingMessageId.value = messageId;
    const msg = findMessage(messageId);
    if (!msg) return;
    msg.streaming = true;
    let i = 0;
    timer = setInterval(() => {
      i = Math.min(full.length, i + 1 + Math.floor(Math.random() * 3));
      msg.content = full.slice(0, i);
      if (i >= full.length) {
        msg.streaming = false;
        streamingMessageId.value = null;
        if (timer) {
          clearInterval(timer);
          timer = null;
        }
      }
    }, 16);
  }

  /** 启动一轮回复：同步声明流式态，service 返回完整文本后打字机推进 */
  function runExchange(assistantId: string, prompt: string) {
    streamingMessageId.value = assistantId;
    const session = activeSession.value;
    const modelId = session?.model ?? prefs.value.currentModel;
    void getChatReplyService()
      .generateReply(prompt, {
        mode: prefs.value.outputMode,
        model: modelId,
        replyLength: prefs.value.replyLength,
        systemPrompt: session?.systemPrompt?.text,
        presetName: session?.systemPrompt
          ? promptPresetName(session.systemPrompt.presetId)
          : undefined,
      })
      .then((full) => streamInto(assistantId, full))
      .catch(() => markError(assistantId));
  }

  /** 追加用户消息 + 助手占位，未命名会话自动生成标题，随后开始流式输出 */
  function pushExchange(
    session: ChatSession,
    content: string,
    quote?: ChatQuote,
  ) {
    const now = Date.now();
    const userMsg: ChatMessage = {
      id: uid(),
      role: 'user',
      content,
      createdAt: now,
      model: session.model,
      quote,
    };
    const assistantMsg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      createdAt: now + 1,
      model: session.model,
      streaming: true,
    };
    session.messages.push(userMsg, assistantMsg);
    if (session.title === '新对话') {
      session.title = normalizeTitle(content);
    }
    session.updatedAt = now;
    runExchange(assistantMsg.id, content);
  }

  /** 发送消息：新建会话（如无）并开始一轮问答；自动消费引用态 */
  function sendMessage(text: string, quote?: ChatQuote) {
    const content = text.trim();
    if (!content) return;
    stopStreaming();
    let session = activeSession.value;
    if (!session) session = createSession();
    const resolvedQuote = quote ?? quoteTarget.value ?? undefined;
    quoteTarget.value = null;
    pushExchange(session, content, resolvedQuote);
  }

  /** 编辑并重新发送：仅允许最近一条用户消息，删除其后的上下文后重发 */
  function editAndResend(
    messageId: string,
    text: string,
    quote?: ChatQuote,
  ) {
    const content = text.trim();
    if (!content) return;
    const session = activeSession.value;
    if (!session) return;
    const idx = session.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = session.messages[idx];
    if (!msg || msg.role !== 'user') return;
    if (idx !== lastUserMessageIndex(session)) return;

    // 优先级：显式引用 > 原消息引用快照 > 当前引用态；随后清空引用态
    const resolvedQuote = quote ?? msg.quote ?? quoteTarget.value ?? undefined;
    quoteTarget.value = null;
    stopStreaming();
    session.messages = session.messages.slice(0, idx);
    session.updatedAt = Date.now();
    pushExchange(session, content, resolvedQuote);
  }

  /** 进入编辑态（仅最近一条用户消息） */
  function startEdit(messageId: string) {
    const session = activeSession.value;
    if (!session) return;
    const idx = session.messages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const msg = session.messages[idx];
    if (!msg || msg.role !== 'user') return;
    if (idx !== lastUserMessageIndex(session)) return;
    stopStreaming();
    editingId.value = messageId;
  }

  /** 取消编辑态 */
  function cancelEdit() {
    editingId.value = null;
  }

  /** 重新生成 / 重试：截断到目标助手消息之前，用同一条用户输入重新输出 */
  function regenerate(assistantId: string) {
    const session = activeSession.value;
    if (!session) return;
    const idx = session.messages.findIndex((m) => m.id === assistantId);
    if (idx < 0) return;

    let prompt: string | null = null;
    for (let j = idx - 1; j >= 0; j -= 1) {
      const m = session.messages[j];
      if (m && m.role === 'user') {
        prompt = m.content;
        break;
      }
    }
    if (prompt === null) return;

    stopStreaming();
    session.messages = session.messages.slice(0, idx);
    const msg: ChatMessage = {
      id: uid(),
      role: 'assistant',
      content: '',
      createdAt: Date.now(),
      model: session.model,
      streaming: true,
    };
    session.messages.push(msg);
    session.updatedAt = Date.now();
    runExchange(msg.id, prompt);
  }

  /* ---------- 导出 ---------- */

  /** 单条消息导出 Markdown（当前会话内查找） */
  function exportMessage(messageId: string) {
    const session = activeSession.value;
    if (!session) return;
    const msg = session.messages.find((m) => m.id === messageId);
    if (!msg) return;
    downloadTextFile(
      `${sanitizeFilename(session.title)}-${msg.role === 'user' ? '用户' : '助手'}-${msg.id.slice(-6)}.md`,
      messageToMarkdown(msg),
    );
  }

  function exportActiveSessionMarkdown() {
    const s = activeSession.value;
    if (!s) return;
    downloadTextFile(`${sanitizeFilename(s.title)}.md`, sessionToMarkdown(s));
  }

  function exportActiveSessionJson() {
    const s = activeSession.value;
    if (!s) return;
    downloadTextFile(
      `${sanitizeFilename(s.title)}.json`,
      sessionToJson(s),
      'application/json;charset=utf-8',
    );
  }

  return {
    sessions,
    activeId,
    activeSession,
    isStreaming,
    streamingMessageId,
    editingId,
    quoteTarget,
    prefs,
    prefsRecovered,
    currentModel,
    currentModelInfo,
    activeModelId,
    modeRecommendedModel,
    modeCategory,
    filteredModels,
    categoryOf,
    isFavorite,
    visibleSessions,
    archivedSessions,
    sessionModelFilter,
    sessionTimeFilter,
    sessionBookmarkFilter,
    sessionSystemPrompt,
    createSession,
    selectSession,
    deleteSession,
    deleteSessions,
    renameSession,
    clearSession,
    setModel,
    togglePin,
    toggleArchive,
    setSessionModelFilter,
    setSessionTimeFilter,
    toggleSessionBookmarkFilter,
    sessionStats,
    sessionBudget,
    setModelFilter,
    setModelQuery,
    toggleShowFavoritesOnly,
    toggleFavorite,
    setCurrentModel,
    setOutputMode,
    setReplyLength,
    setSystemPromptEnabled,
    setSidebarCollapsed,
    setSessionSystemPrompt,
    setSessionCustomPrompt,
    clearSessionSystemPrompt,
    restoreDefaultSystemPrompt,
    toggleBookmark,
    beginQuote,
    clearQuote,
    sendMessage,
    editAndResend,
    startEdit,
    cancelEdit,
    regenerate,
    stopStreaming,
    exportMessage,
    exportActiveSessionMarkdown,
    exportActiveSessionJson,
  };
});
