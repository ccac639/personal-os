/**
 * Admin 功能域 —— AI 配置中心（仅前端配置与未来服务适配边界）
 *
 * - 不进行真实网络连接：Provider 目录为本地模拟（通用兼容接口 / 文本模型 / 视觉模型）。
 * - 连接检查为 deterministic mock：校验配置完整性，返回模拟延迟与错误原因。
 * - 为未来真实 Provider 保留 {@link ProviderConnectionAdapter} 接口；
 *   不触碰 Chat 的真实 service 实现。
 * - 安全边界：API Key 仅存在于调用方持有的会话内存态（store），
 *   本模块只做校验与「是否已配置」判断，绝不持久化、绝不进入导出/诊断。
 */
import type {
  AdminModelEntry,
  AdminProvider,
  AdminProviderDraft,
  ConnectionCheckResult,
  ProviderCapability,
} from './types';

export const PROVIDER_CAPABILITY_LABELS: Record<ProviderCapability, string> = {
  chat: '对话',
  writing: '写作',
  code: '代码',
  vision: '视觉提示词',
};

/** 本地模拟 Provider 目录（不持久化，每次进入会话重新创建） */
export function createMockProviders(): AdminProvider[] {
  return [
    {
      id: 'generic-compat',
      name: '通用兼容接口',
      enabled: true,
      defaultModel: 'compat-chat',
      capabilities: ['chat', 'writing'],
      priority: 1,
      timeoutSeconds: 30,
      hasKey: false,
    },
    {
      id: 'text-model',
      name: '文本模型',
      enabled: true,
      defaultModel: 'text-pro',
      capabilities: ['chat', 'writing', 'code'],
      priority: 2,
      timeoutSeconds: 60,
      hasKey: false,
    },
    {
      id: 'vision-model',
      name: '视觉模型',
      enabled: false,
      defaultModel: 'vision-pro',
      capabilities: ['vision'],
      priority: 3,
      timeoutSeconds: 60,
      hasKey: false,
    },
  ];
}

/** 本地模拟模型目录 */
export function createMockModels(): AdminModelEntry[] {
  return [
    {
      id: 'compat-chat',
      name: '兼容对话',
      providerId: 'generic-compat',
      modes: ['chat', 'writing'],
      context: '128K 上下文',
      isDefault: true,
    },
    {
      id: 'text-pro',
      name: '文本增强',
      providerId: 'text-model',
      modes: ['chat', 'writing', 'code'],
      context: '256K 上下文',
      isDefault: true,
    },
    {
      id: 'text-lite',
      name: '文本轻量',
      providerId: 'text-model',
      modes: ['chat'],
      context: '64K 上下文',
      isDefault: false,
    },
    {
      id: 'vision-pro',
      name: '视觉理解',
      providerId: 'vision-model',
      modes: ['vision'],
      context: '128K 上下文',
      isDefault: true,
    },
  ];
}

/* ---------------- 敏感字段剔除 ---------------- */

const SENSITIVE_FIELD_RE = /(api[-_]?key|token|secret|password|authorization|credential)/i;

/** 深拷贝并剔除敏感字段（备份 / 导出 / 诊断共用，绝不外泄 Key 内容） */
export function stripSensitiveFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => stripSensitiveFields(v));
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_FIELD_RE.test(k)) continue;
      out[k] = stripSensitiveFields(v);
    }
    return out;
  }
  return value;
}

/* ---------------- Provider 持久化适配（仅 hasKey 布尔） ---------------- */

/** 把内存态 draft 转成可持久化配置：剥离 apiKey，只保留 hasKey 布尔 */
export function toPersistedProvider(draft: AdminProviderDraft): AdminProvider {
  const { apiKey, ...rest } = draft;
  void apiKey;
  return { ...rest, hasKey: Boolean(draft.apiKey) };
}

/** 把持久化配置转成会话内存态（apiKey 为空串，等待用户输入） */
export function toMemoryProvider(p: AdminProvider): AdminProviderDraft {
  return { ...p, apiKey: '' };
}

/* ---------------- 连接检查（deterministic mock） ---------------- */

export interface ProviderConnectionAdapter {
  /** 校验配置完整性并返回模拟结果；不发起真实网络请求 */
  checkConnection(
    provider: AdminProviderDraft,
    models: AdminModelEntry[],
  ): Promise<ConnectionCheckResult>;
}

/** 确定性 mock 实现：固定延迟公式 + 明确的失败原因 */
export class MockProviderConnectionAdapter implements ProviderConnectionAdapter {
  checkConnection(
    provider: AdminProviderDraft,
    models: AdminModelEntry[],
  ): Promise<ConnectionCheckResult> {
    const latencyMs = 38 + ((provider.priority % 5) + 1) * 11;

    if (!provider.enabled) {
      return Promise.resolve({
        ok: false,
        latencyMs: 0,
        message: `「${provider.name || '未命名 Provider'}」处于禁用状态，请先启用`,
      });
    }
    if (!provider.name.trim()) {
      return Promise.resolve({ ok: false, latencyMs: 0, message: '缺少 Provider 名称' });
    }
    if (provider.timeoutSeconds <= 0) {
      return Promise.resolve({ ok: false, latencyMs: 0, message: '超时设置必须大于 0 秒' });
    }
    if (!provider.defaultModel.trim()) {
      return Promise.resolve({ ok: false, latencyMs: 0, message: '未选择默认模型' });
    }
    if (provider.capabilities.length === 0) {
      return Promise.resolve({ ok: false, latencyMs: 0, message: '未选择任何模型能力' });
    }
    if (!provider.apiKey.trim()) {
      return Promise.resolve({
        ok: false,
        latencyMs: 0,
        message: '未配置 API Key（仅本次会话内存）',
      });
    }
    const modelExists = models.some((m) => m.id === provider.defaultModel);
    if (!modelExists) {
      return Promise.resolve({
        ok: false,
        latencyMs: 0,
        message: `默认模型「${provider.defaultModel}」不在模型目录中`,
      });
    }
    return Promise.resolve({
      ok: true,
      latencyMs,
      message: `连接成功（模拟延迟 ${latencyMs}ms）：${provider.capabilities
        .map((c) => PROVIDER_CAPABILITY_LABELS[c])
        .join(' / ')}`,
    });
  }
}

let adapter: ProviderConnectionAdapter = new MockProviderConnectionAdapter();

/** 替换连接检查实现（未来真实 Provider 接入点；测试注入用） */
export function setProviderConnectionAdapter(next: ProviderConnectionAdapter): void {
  adapter = next;
}

export function getProviderConnectionAdapter(): ProviderConnectionAdapter {
  return adapter;
}
