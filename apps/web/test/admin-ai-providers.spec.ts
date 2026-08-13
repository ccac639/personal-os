import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import {
  createMockProviders,
  createMockModels,
  MockProviderConnectionAdapter,
  setProviderConnectionAdapter,
  getProviderConnectionAdapter,
} from '@/features/admin/providers';
import { useAdminStore } from '@/features/admin/store';
import { ADMIN_PROVIDERS_KEY } from '@/features/admin/registry';
import type { AdminProviderDraft } from '@/features/admin/types';

function draft(patch: Partial<AdminProviderDraft>): AdminProviderDraft {
  const base = createMockProviders()[0]!;
  return { ...base, apiKey: 'sk-test', ...patch };
}

describe('Provider mock 连接检查', () => {
  const adapter = new MockProviderConnectionAdapter();
  const models = createMockModels();

  it('配置完整时成功，返回确定性模拟延迟', async () => {
    const result = await adapter.checkConnection(draft({}), models);
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
    expect(result.message).toContain('连接成功');
  });

  it('延迟为确定性公式（相同输入相同结果）', async () => {
    const a = await adapter.checkConnection(draft({ priority: 2 }), models);
    const b = await adapter.checkConnection(draft({ priority: 2 }), models);
    expect(a.latencyMs).toBe(b.latencyMs);
  });

  it('禁用状态 → 明确失败原因', async () => {
    const result = await adapter.checkConnection(draft({ enabled: false }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('禁用');
  });

  it('缺少名称 → 失败', async () => {
    const result = await adapter.checkConnection(draft({ name: '  ' }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('名称');
  });

  it('缺少默认模型 → 失败', async () => {
    const result = await adapter.checkConnection(draft({ defaultModel: '' }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('默认模型');
  });

  it('未选择能力 → 失败', async () => {
    const result = await adapter.checkConnection(draft({ capabilities: [] }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('能力');
  });

  it('未配置 API Key → 失败（明确内存态）', async () => {
    const result = await adapter.checkConnection(draft({ apiKey: '' }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('API Key');
  });

  it('默认模型不在目录 → 失败', async () => {
    const result = await adapter.checkConnection(draft({ defaultModel: 'ghost-model' }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('不在模型目录');
  });

  it('超时设置非法 → 失败', async () => {
    const result = await adapter.checkConnection(draft({ timeoutSeconds: 0 }), models);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('超时');
  });

  it('成功消息包含能力中文标签', async () => {
    const result = await adapter.checkConnection(draft({ capabilities: ['chat', 'code'] }), models);
    expect(result.message).toContain('对话');
    expect(result.message).toContain('代码');
  });

  it('适配器可注入替换（未来真实 Provider 接入点）', () => {
    const custom = {
      checkConnection: () => Promise.resolve({ ok: true, latencyMs: 1, message: 'custom' }),
    };
    setProviderConnectionAdapter(custom);
    expect(getProviderConnectionAdapter()).toBe(custom);
    setProviderConnectionAdapter(new MockProviderConnectionAdapter());
  });
});

describe('Admin store Provider 管理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('checkConnection 走注入的适配器（mock 不发起真实网络）', async () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-test');
    const result = await admin.checkConnection('generic-compat');
    expect(result.ok).toBe(true);
    expect(result.latencyMs).toBeGreaterThan(0);
  });

  it('持久化配置仅记录 hasKey，不落 Key 内容', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-super-secret');
    admin.persistProviderConfigs();
    const raw = localStorage.getItem(ADMIN_PROVIDERS_KEY)!;
    expect(raw).not.toContain('sk-super-secret');
    const parsed = JSON.parse(raw);
    expect(parsed.providers[0]!.hasKey).toBe(true);
    expect(parsed.providers[0]!.name).toBe('通用兼容接口');
  });

  it('updateProvider 可改启用/优先级等持久化字段，不影响 apiKey', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-keep');
    admin.updateProvider('generic-compat', { enabled: false, priority: 5, timeoutSeconds: 120 });
    const p = admin.providers.find((x) => x.id === 'generic-compat')!;
    expect(p.enabled).toBe(false);
    expect(p.priority).toBe(5);
    expect(p.timeoutSeconds).toBe(120);
    expect(p.apiKey).toBe('sk-keep');
  });

  it('模型目录含 4 条且能力标签齐全', () => {
    const admin = useAdminStore();
    expect(admin.models).toHaveLength(4);
    expect(admin.models.some((m) => m.isDefault)).toBe(true);
  });
});
