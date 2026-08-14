/**
 * Agents 管理功能域 —— 表单校验与载荷构建
 *
 * 字段上限与后端 DTO 对齐（apps/api/src/modules/agents/agents.dto.ts）：
 *   name ≤ 100、description ≤ 500、model ≤ 100、systemPrompt ≤ 4_000、provider ∈ 枚举。
 */
import type { AgentProviderName, CreateAgentPayload, UpdateAgentPayload } from '@/services/agents';

import type { AgentRecord } from './types';

/** 与后端 DTO 对齐的字段上限 */
export const AGENT_LIMITS = {
  NAME_MAX: 100,
  DESCRIPTION_MAX: 500,
  MODEL_MAX: 100,
  SYSTEM_PROMPT_MAX: 4_000,
} as const;

/** 提供方选项（与后端 AGENT_PROVIDERS 枚举一致） */
export const AGENT_PROVIDER_OPTIONS: ReadonlyArray<{ value: AgentProviderName; label: string }> = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'siliconflow', label: '硅基流动' },
] as const;

/** 默认模型（与后端 create 默认值 gpt-4o-mini 一致） */
export const DEFAULT_AGENT_MODEL = 'gpt-4o-mini';

/** 表单值（覆盖后端可编辑字段） */
export interface AgentFormValues {
  name: string;
  description: string;
  model: string;
  provider: AgentProviderName;
  systemPrompt: string;
  favorite: boolean;
  enabled: boolean;
}

export interface AgentFormErrors {
  name?: string;
  description?: string;
  model?: string;
  provider?: string;
  systemPrompt?: string;
}

/** 新建表单默认值 */
export function emptyAgentForm(): AgentFormValues {
  return {
    name: '',
    description: '',
    model: DEFAULT_AGENT_MODEL,
    provider: 'openai',
    systemPrompt: '',
    favorite: false,
    enabled: true,
  };
}

/** 表单校验（与后端 DTO 约束一致） */
export function validateAgentForm(values: AgentFormValues): AgentFormErrors {
  const errors: AgentFormErrors = {};

  const name = values.name.trim();
  if (!name) errors.name = '请输入智能体名称';
  else if (name.length > AGENT_LIMITS.NAME_MAX)
    errors.name = `名称不能超过 ${AGENT_LIMITS.NAME_MAX} 字`;

  if (values.description.trim().length > AGENT_LIMITS.DESCRIPTION_MAX) {
    errors.description = `描述不能超过 ${AGENT_LIMITS.DESCRIPTION_MAX} 字`;
  }

  const model = values.model.trim();
  if (!model) errors.model = '请输入模型名';
  else if (model.length > AGENT_LIMITS.MODEL_MAX)
    errors.model = `模型名不能超过 ${AGENT_LIMITS.MODEL_MAX} 字`;

  if (!AGENT_PROVIDER_OPTIONS.some((o) => o.value === values.provider)) {
    errors.provider = '请选择有效的模型提供方';
  }

  if (values.systemPrompt.trim().length > AGENT_LIMITS.SYSTEM_PROMPT_MAX) {
    errors.systemPrompt = `系统提示词不能超过 ${AGENT_LIMITS.SYSTEM_PROMPT_MAX} 字`;
  }

  return errors;
}

/** 表单 → 创建载荷（空可选字段不发送，走后端默认值） */
export function buildCreatePayload(values: AgentFormValues): CreateAgentPayload {
  const payload: CreateAgentPayload = {
    name: values.name.trim(),
    provider: values.provider,
    favorite: values.favorite,
  };
  const description = values.description.trim();
  if (description) payload.description = description;
  const model = values.model.trim();
  if (model) payload.model = model;
  const systemPrompt = values.systemPrompt.trim();
  if (systemPrompt) payload.systemPrompt = systemPrompt;
  return payload;
}

/** 表单 → 更新载荷（仅提交变更字段；收藏 / 启用始终跟随表单语义） */
export function buildUpdatePayload(
  values: AgentFormValues,
  original: AgentRecord,
): UpdateAgentPayload {
  const payload: UpdateAgentPayload = { favorite: values.favorite, enabled: values.enabled };

  const name = values.name.trim();
  if (name !== original.name) payload.name = name;

  const description = values.description.trim();
  if (description !== (original.description ?? '')) payload.description = description || undefined;

  const model = values.model.trim();
  if (model !== original.model) payload.model = model;

  if (values.provider !== original.provider) payload.provider = values.provider;

  const systemPrompt = values.systemPrompt.trim();
  if (systemPrompt !== (original.systemPrompt ?? ''))
    payload.systemPrompt = systemPrompt || undefined;

  return payload;
}
