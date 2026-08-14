/**
 * Agents 管理 —— 表单校验 / 载荷构建 / 错误归一化 / 共享类型适配 测试
 */
import { describe, expect, it } from 'vitest';

import { AgentApiError, AGENT_PROVIDERS } from '@/services/agents';
import type { AgentRecord } from '@/services/agents';

import { toAgentErrorInfo, requestIdSuffix } from '@/features/agents/errors';
import {
  AGENT_LIMITS,
  AGENT_PROVIDER_OPTIONS,
  DEFAULT_AGENT_MODEL,
  buildCreatePayload,
  buildUpdatePayload,
  emptyAgentForm,
  validateAgentForm,
} from '@/features/agents/validation';
import type { AgentFormValues } from '@/features/agents/validation';

function form(overrides: Partial<AgentFormValues> = {}): AgentFormValues {
  return {
    name: '测试助手',
    description: '一句简介',
    model: 'gpt-4o-mini',
    provider: 'openai',
    systemPrompt: '你是测试助手',
    favorite: false,
    enabled: true,
    ...overrides,
  };
}

function record(overrides: Partial<AgentRecord> = {}): AgentRecord {
  return {
    id: 'agt_1',
    name: '测试助手',
    description: '一句简介',
    model: 'gpt-4o-mini',
    provider: 'openai',
    systemPrompt: '你是测试助手',
    kind: 'personal',
    builtinKey: null,
    favorite: false,
    hidden: false,
    enabled: true,
    usageCount: 3,
    lastUsedAt: null,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateAgentForm：覆盖后端字段约束', () => {
  it('合法表单：无错误', () => {
    expect(validateAgentForm(form())).toEqual({});
  });

  it('名称：必填 + 去除首尾空白 + 上限 100', () => {
    expect(validateAgentForm(form({ name: '   ' })).name).toBe('请输入智能体名称');
    expect(validateAgentForm(form({ name: '' })).name).toBe('请输入智能体名称');
    expect(validateAgentForm(form({ name: 'x'.repeat(101) })).name).toContain('100');
    expect(validateAgentForm(form({ name: ' 测试助手 ' }))).toEqual({});
  });

  it('描述：可选但上限 500', () => {
    expect(validateAgentForm(form({ description: 'x'.repeat(501) })).description).toContain('500');
    expect(validateAgentForm(form({ description: '' }))).toEqual({});
  });

  it('模型：必填 + 上限 100', () => {
    expect(validateAgentForm(form({ model: '  ' })).model).toBe('请输入模型名');
    expect(validateAgentForm(form({ model: 'x'.repeat(101) })).model).toContain('100');
  });

  it('提供方：必须是后端枚举之一', () => {
    expect(validateAgentForm(form({ provider: 'siliconflow' }))).toEqual({});
    // 非法提供方（运行时脏数据）
    expect(validateAgentForm(form({ provider: 'unknown-provider' as never })).provider).toBe(
      '请选择有效的模型提供方',
    );
  });

  it('系统提示词：上限 4000（对齐后端 maxLength 4_000）', () => {
    expect(validateAgentForm(form({ systemPrompt: 'x'.repeat(4_001) })).systemPrompt).toContain(
      '4000',
    );
    expect(validateAgentForm(form({ systemPrompt: 'x'.repeat(4_000) }))).toEqual({});
  });

  it('提供方选项与后端枚举一致（含 siliconflow）', () => {
    expect(AGENT_PROVIDER_OPTIONS.map((o) => o.value)).toEqual([
      'openai',
      'anthropic',
      'google',
      'openrouter',
      'siliconflow',
    ]);
  });
});

describe('载荷构建', () => {
  it('emptyAgentForm：默认模型与后端 create 默认一致', () => {
    const empty = emptyAgentForm();
    expect(empty.model).toBe(DEFAULT_AGENT_MODEL);
    expect(empty.provider).toBe('openai');
    expect(empty.enabled).toBe(true);
    expect(empty.favorite).toBe(false);
  });

  it('buildCreatePayload：去除空白、空可选字段不发送', () => {
    const payload = buildCreatePayload(
      form({ name: ' 助手 ', description: ' ', systemPrompt: ' 提示 ', model: ' gpt-4o ' }),
    );
    expect(payload).toEqual({
      name: '助手',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: '提示',
      favorite: false,
    });
    // description 为空时不携带
    expect('description' in payload).toBe(false);
  });

  it('buildUpdatePayload：仅提交变更字段，收藏/启用始终跟随', () => {
    const original = record();
    const payload = buildUpdatePayload(form({ name: '新名字', enabled: false }), original);
    expect(payload).toEqual({
      name: '新名字',
      favorite: false,
      enabled: false,
    });
  });

  it('buildUpdatePayload：清空描述/提示词时提交 undefined 以删除旧值', () => {
    const original = record({ description: '旧描述', systemPrompt: '旧提示' });
    const payload = buildUpdatePayload(form({ description: '', systemPrompt: '' }), original);
    expect(payload.description).toBeUndefined();
    expect(payload.systemPrompt).toBeUndefined();
    expect('description' in payload).toBe(true);
    expect('systemPrompt' in payload).toBe(true);
  });

  it('buildUpdatePayload：未改动字段不提交', () => {
    const original = record();
    expect(buildUpdatePayload(form(), original)).toEqual({ favorite: false, enabled: true });
  });
});

describe('toAgentErrorInfo：API 失败 → 用户可读 + requestId 保留', () => {
  it('优先使用服务端中文 message 并保留 requestId', () => {
    const info = toAgentErrorInfo(
      new AgentApiError('内置模板不可删除，可改为隐藏', {
        statusCode: 400,
        code: 'BAD_REQUEST',
        requestId: 'rid-abc',
      }),
      '兜底',
    );
    expect(info).toEqual({
      message: '内置模板不可删除，可改为隐藏',
      statusCode: 400,
      code: 'BAD_REQUEST',
      requestId: 'rid-abc',
    });
  });

  it('服务端 message 为空时按状态码兜底', () => {
    const info = toAgentErrorInfo(new AgentApiError('', { statusCode: 500 }), '兜底');
    expect(info.message).toBe('服务暂时不可用，请稍后再试');
  });

  it('未知名异常：使用调用方兜底文案', () => {
    expect(toAgentErrorInfo(new Error('boom'), '加载智能体列表失败').message).toBe(
      '加载智能体列表失败',
    );
  });

  it('requestIdSuffix：有 rid 才追加', () => {
    expect(requestIdSuffix({ message: 'x', requestId: 'rid-1' })).toBe('（requestId: rid-1）');
    expect(requestIdSuffix({ message: 'x' })).toBe('');
    expect(requestIdSuffix(null)).toBe('');
  });
});

describe('共享契约：services/agents 与 packages/types 对齐', () => {
  it('AGENT_PROVIDERS 含后端全部提供方（含 siliconflow）', () => {
    expect(AGENT_PROVIDERS).toEqual(['openai', 'anthropic', 'google', 'openrouter', 'siliconflow']);
  });

  it('AgentRecord 兼容后端契约字段（kind / favorite / usageCount 可直接读取）', () => {
    const source: AgentRecord = record({
      kind: 'builtin',
      builtinKey: 'general-assistant',
      favorite: true,
      usageCount: 7,
    });
    expect(source.id).toBe('agt_1');
    expect(source.name).toBe('测试助手');
    expect(source.kind).toBe('builtin');
    expect(source.builtinKey).toBe('general-assistant');
    expect(source.favorite).toBe(true);
    expect(source.usageCount).toBe(7);
  });
});

describe('字段上限常量对齐后端 DTO', () => {
  it('AGENT_LIMITS 与后端 DTO 一致', () => {
    expect(AGENT_LIMITS).toEqual({
      NAME_MAX: 100,
      DESCRIPTION_MAX: 500,
      MODEL_MAX: 100,
      SYSTEM_PROMPT_MAX: 4_000,
    });
  });
});
