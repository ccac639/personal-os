/**
 * Agents 管理功能域 —— 类型与共享契约出口
 *
 * 契约类型统一来自 packages/types/src/agent.ts（与后端 AgentResponseDto 等对齐），
 * 经 services/agents.ts re-export 后在此统一出口，业务代码不直接依赖共享包路径。
 */
export type {
  AgentKind,
  AgentListQuery,
  AgentListResult,
  AgentProviderName,
  AgentRecord,
  CreateAgentPayload,
  UpdateAgentPayload,
} from '@/services/agents';

/** 列表页状态筛选 */
export type AgentStatusFilter = 'all' | 'enabled' | 'disabled';
