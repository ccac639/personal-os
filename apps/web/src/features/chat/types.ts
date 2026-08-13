/**
 * Chat 功能域类型定义
 */

export type ChatRole = 'user' | 'assistant';

/** 模型类别：对话 / 代码 / 图像 / 创作 */
export type ChatModelCategory = 'chat' | 'code' | 'image' | 'creative';

/** 创作控制台输出模式 */
export type ChatOutputMode = 'chat' | 'writing' | 'code' | 'image';

/** 回复长度档位 */
export type ChatReplyLength = 'short' | 'standard' | 'detailed';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  /** 生成该消息时使用的模型 */
  model?: string;
  /** 是否仍在流式输出中 */
  streaming?: boolean;
  /** 生成失败（service 异常），UI 提供重试 */
  error?: boolean;
  /** 消息书签（会话内筛选与导出标记） */
  bookmarked?: boolean;
  /** 引用回复：发送时附带的被引用消息快照（纯文本，无二进制） */
  quote?: ChatQuote;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  model: string;
  createdAt: number;
  updatedAt: number;
  /** 固定（置顶显示） */
  pinned?: boolean;
  /** 归档（默认列表隐藏，可恢复） */
  archived?: boolean;
  /** 会话级系统提示词（预设 id + 解析后的文本，导出自包含） */
  systemPrompt?: ChatSessionSystemPrompt;
  /** 来源智能体名称（自包含，导出不依赖目录） */
  agentName?: string;
}

/** 引用消息快照 */
export interface ChatQuote {
  id: string;
  role: ChatRole;
  content: string;
}

/** 会话级系统提示词（presetId 为 'custom' 表示自定义文本） */
export interface ChatSessionSystemPrompt {
  presetId: string;
  text: string;
}

/** 系统提示词预设（内置常量或用户自定义持久化） */
export interface ChatSystemPromptPreset {
  id: string;
  name: string;
  description: string;
  text: string;
  /** 内置预设不落盘；自定义预设持久化到 localStorage */
  builtin: boolean;
}

/**
 * 模型目录条目（前端 mock，不调用 API）
 * label 同时兼容既有模型选择 UI 的展示名
 */
export interface ChatModelOption {
  id: string;
  /** 展示名（中性名称，如「通用推理」） */
  label: string;
  /** 提供方（本地/远端的中性描述） */
  provider: string;
  category: ChatModelCategory;
  /** 一句简介 */
  description: string;
  /** 能力标签 */
  tags: string[];
  /** 上下文长度或能力说明 */
  context: string;
  /** 语义色标识（映射到主题内定义的 --chat-* 变量） */
  color: string;
  /** 默认收藏 */
  favorite: boolean;
  /** 是否可用 */
  available: boolean;
  /** 副标题（兼容既有模型选择弹层的 hint 字段） */
  hint: string;
}

/** 空态欢迎页的建议提问 */
export interface ChatSuggestion {
  id: string;
  title: string;
  description: string;
  prompt: string;
}

/**
 * 本地偏好（模型库 + 创作控制台状态），持久化于独立 key。
 * 仅存 UI 状态；绝不存 API Key、图片二进制、完整文件内容。
 */
export interface ChatPreferences {
  /** 模型类别筛选：'all' 或具体类别 */
  modelFilter: ChatModelCategory | 'all';
  /** 模型关键词搜索 */
  modelQuery: string;
  /** 仅看收藏 */
  showFavoritesOnly: boolean;
  /** 用户收藏的模型 id（模型目录的 favorite 为默认值） */
  favorites: string[];
  /** 全局当前模型（新会话默认模型） */
  currentModel: string;
  /** 输出模式 */
  outputMode: ChatOutputMode;
  /** 回复长度 */
  replyLength: ChatReplyLength;
  /** 是否启用系统提示词（文本本身不持久化，避免敏感信息落盘） */
  systemPromptEnabled: boolean;
  /** 模型侧栏是否折叠（桌面） */
  sidebarCollapsed: boolean;
  /** 会话筛选：按模型类别 */
  sessionModelFilter: ChatModelCategory | 'all';
  /** 会话筛选：按最近时间窗口 */
  sessionTimeFilter: ChatSessionTimeFilter;
  /** 会话筛选：仅含书签消息的会话 */
  sessionBookmarkFilter: boolean;
}

/** 会话时间筛选窗口 */
export type ChatSessionTimeFilter = 'all' | 'today' | 'week' | 'month';

/** 附件草稿（仅内存，绝不写入 localStorage） */
export interface ChatAttachmentDraft {
  id: string;
  name: string;
  type: string;
  size: number;
  /** blob 预览 URL（内存态） */
  url: string;
}

/** 附件校验错误 */
export interface ChatDraftValidationError {
  code: 'type' | 'size' | 'count';
  message: string;
  fileName?: string;
}

/** 会话统计快照 */
export interface ChatSessionStats {
  /** 消息总数 */
  total: number;
  userMessages: number;
  assistantMessages: number;
  /** 书签消息数 */
  bookmarks: number;
  /** 消息总字符数 */
  chars: number;
  /** 本地估算 token（启发式，非真实 tokenizer） */
  estTokens: number;
}

/** 生成结果操作（本地 action payload，未来可注入真实模块回调） */
export type ChatActionKind =
  | 'add-task'
  | 'save-artifact'
  | 'workflow-draft'
  | 'save-inspiration'
  | 'create-agent-variant';

export interface ChatResultAction {
  kind: ChatActionKind;
  /** 来源消息 */
  messageId: string;
  /** 结果内容摘要（本地 payload，不包含二进制） */
  content: string;
  createdAt: number;
}
