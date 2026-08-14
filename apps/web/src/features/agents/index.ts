/**
 * Agents 管理功能域统一出口
 */
export { default as AgentCard } from './agent-card.vue';
export { default as AgentDetailDrawer } from './agent-detail-drawer.vue';
export { default as AgentFormDialog } from './agent-form-dialog.vue';

export { useAgentAdminStore, AGENT_PAGE_SIZE } from './store';
export type { AgentUpdateMode } from './store';
export { toAgentErrorInfo, requestIdSuffix } from './errors';
export type { AgentErrorInfo } from './errors';
export {
  AGENT_LIMITS,
  AGENT_PROVIDER_OPTIONS,
  DEFAULT_AGENT_MODEL,
  buildCreatePayload,
  buildUpdatePayload,
  emptyAgentForm,
  validateAgentForm,
} from './validation';
export type { AgentFormErrors, AgentFormValues } from './validation';
export {
  AGENT_KIND_LABELS,
  AGENT_PROVIDER_LABELS,
  AGENT_STATUS_OPTIONS,
  formatDateTime,
  formatRelativeTime,
} from './meta';
export type {
  AgentKind,
  AgentListQuery,
  AgentListResult,
  AgentProviderName,
  AgentRecord,
  AgentStatusFilter,
  CreateAgentPayload,
  UpdateAgentPayload,
} from './types';
