/**
 * Agent 共享契约
 *
 * 事实来源：apps/api/src/modules/agents（controller + dto + service）。
 * 本文件与后端 AgentResponseDto / CreateAgentDto / UpdateAgentDto /
 * AgentQueryDto / AgentStartResultDto 对齐；创建与更新载荷不含 id、时间戳、
 * usageCount、lastUsedAt、ownerId 或 userId（单用户系统，无租户概念）。
 */

/** 模型提供方（与后端 AGENT_PROVIDERS 一致） */
export type AgentProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'siliconflow';

/** 智能体类型：builtin 内置模板 / personal 个人变体 */
export type AgentKind = 'builtin' | 'personal';

/** 后端 AgentResponseDto */
export interface Agent {
  id: string;
  name: string;
  description?: string;
  model: string;
  provider: AgentProvider;
  systemPrompt?: string;
  kind: AgentKind;
  builtinKey: string | null;
  favorite: boolean;
  hidden: boolean;
  enabled: boolean;
  usageCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 列表查询参数（AgentQueryDto）。
 * 分页字段 page / pageSize 与后端通用分页（Paginated）对齐。
 */
export interface AgentListQuery {
  kind?: AgentKind;
  includeHidden?: boolean;
  /** 名称 / 描述 / 系统提示词模糊匹配 */
  q?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 分页结果（与后端 Paginated<AgentResponseDto> 同构：items / total / page / pageSize）。
 * 仓库无通用分页类型，此处保持与后端 Paginated 完全一致的结构。
 */
export interface AgentListResult {
  items: Agent[];
  total: number;
  page: number;
  pageSize: number;
}

/** 创建参数（CreateAgentDto） */
export interface CreateAgentPayload {
  name: string;
  description?: string;
  model?: string;
  provider?: AgentProvider;
  systemPrompt?: string;
  favorite?: boolean;
}

/** 更新参数（UpdateAgentDto） */
export interface UpdateAgentPayload {
  name?: string;
  description?: string;
  model?: string;
  provider?: AgentProvider;
  systemPrompt?: string;
  favorite?: boolean;
  hidden?: boolean;
  enabled?: boolean;
}

/** 启动会话请求体（POST /agents/:id/start） */
export interface StartAgentPayload {
  /** 会话标题（可选） */
  title?: string;
}

/** 启动会话结果（AgentStartResultDto） */
export interface StartAgentResult {
  /** 启动后的智能体（usageCount / lastUsedAt 已更新） */
  agent: Agent;
  /** 新创建的会话 id */
  conversationId: string;
}
