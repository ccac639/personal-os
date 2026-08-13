/**
 * Chat 功能域 —— 智能体持久化仓库
 *
 * - key：personal-os.chat.agents.v1（版本信封 { version, custom, states }）
 * - 内置智能体为代码常量不落盘；只存个人变体（custom）与内置智能体的
 *   状态覆盖（states：收藏 / 隐藏 / 使用记录）
 * - zod 结构校验：损坏 / 版本不符安全回退为空，并返回 recovered 标志供 UI 提示
 * - 写入失败不阻塞 UI；绝不保存 API Key / Token / 附件二进制
 */
import { z } from 'zod';

import type { ChatAgent } from './agent-types';

export const AGENT_STORAGE_KEY = 'personal-os.chat.agents.v1';
const AGENT_STORAGE_VERSION = 1;

const agentInputFieldSchema = z.object({
  key: z.string(),
  label: z.string(),
  type: z.enum(['text', 'textarea', 'select', 'tags', 'switch']),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  help: z.string().optional(),
  options: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .optional(),
  defaultValue: z.union([z.string(), z.boolean(), z.array(z.string())]).optional(),
});

const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  category: z.enum(['writing', 'code', 'planning', 'research', 'vision', 'efficiency']),
  icon: z.string(),
  color: z.string(),
  tags: z.array(z.string()),
  systemPrompt: z.string(),
  recommendedModelId: z.string(),
  recommendedMode: z.enum(['chat', 'writing', 'code', 'image']),
  starterPrompts: z.array(z.string()),
  inputFields: z.array(agentInputFieldSchema),
  builtin: z.literal(false).optional(),
  favorite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  lastUsedAt: z.number().nullable().optional(),
  usageCount: z.number().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const agentStateSchema = z.object({
  favorite: z.boolean().optional(),
  hidden: z.boolean().optional(),
  lastUsedAt: z.number().nullable().optional(),
  usageCount: z.number().optional(),
});

const agentEnvelopeSchema = z.object({
  version: z.literal(AGENT_STORAGE_VERSION),
  custom: z.array(agentSchema),
  states: z.record(z.string(), agentStateSchema).optional(),
});

export interface AgentLibraryLoadResult {
  /** 个人变体 */
  custom: ChatAgent[];
  /** 内置智能体状态覆盖 */
  states: Record<string, { favorite?: boolean; hidden?: boolean; lastUsedAt?: number | null; usageCount?: number }>;
  /** 数据损坏被回退时置 true */
  recovered: boolean;
}

export function loadAgentLibrary(): AgentLibraryLoadResult {
  try {
    const raw = localStorage.getItem(AGENT_STORAGE_KEY);
    if (!raw) return { custom: [], states: {}, recovered: false };
    const parsed: unknown = JSON.parse(raw);
    const result = agentEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      clearAgentLibrary();
      return { custom: [], states: {}, recovered: true };
    }
    return {
      custom: result.data.custom.map(normalizeStoredAgent),
      states: result.data.states ?? {},
      recovered: false,
    };
  } catch {
    clearAgentLibrary();
    return { custom: [], states: {}, recovered: true };
  }
}

/** 补全可选字段默认值（结构校验通过但缺字段的旧数据向前兼容） */
function normalizeStoredAgent(a: {
  id: string;
  name: string;
  description: string;
  category: ChatAgent['category'];
  icon: string;
  color: string;
  tags: string[];
  systemPrompt: string;
  recommendedModelId: string;
  recommendedMode: ChatAgent['recommendedMode'];
  starterPrompts: string[];
  inputFields: ChatAgent['inputFields'];
  builtin?: boolean;
  favorite?: boolean;
  hidden?: boolean;
  lastUsedAt?: number | null;
  usageCount?: number;
  createdAt: number;
  updatedAt: number;
}): ChatAgent {
  return {
    ...a,
    builtin: false,
    favorite: a.favorite ?? false,
    hidden: a.hidden ?? false,
    lastUsedAt: a.lastUsedAt ?? null,
    usageCount: a.usageCount ?? 0,
  };
}

export function saveAgentLibrary(
  custom: ChatAgent[],
  states: Record<string, { favorite?: boolean; hidden?: boolean; lastUsedAt?: number | null; usageCount?: number }>,
): void {
  try {
    const payload = {
      version: AGENT_STORAGE_VERSION,
      custom: custom.map((a) => ({ ...a, builtin: false })),
      states,
    };
    localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 写入失败（隐私模式 / 配额满）不阻塞 UI
  }
}

export function clearAgentLibrary(): void {
  try {
    localStorage.removeItem(AGENT_STORAGE_KEY);
  } catch {
    // 忽略
  }
}

/* ---------- 迁移工具（导出便于测试） ---------- */

/**
 * 旧版信封迁移：v0（无版本号的裸数组或对象）→ v1。
 * 返回 null 表示无法识别。
 */
export function migrateAgentEnvelopeV0(input: unknown): {
  custom: ChatAgent[];
  states: Record<string, never>;
} | null {
  if (Array.isArray(input)) {
    const valid = input.filter((x): x is ChatAgent => {
      if (typeof x !== 'object' || x === null) return false;
      const o = x as Record<string, unknown>;
      return typeof o.id === 'string' && typeof o.name === 'string' && typeof o.systemPrompt === 'string';
    });
    return { custom: valid.map(normalizeStoredAgent), states: {} };
  }
  return null;
}
