import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAgentsStore } from '@/features/chat/agent-store';
import { AGENT_STORAGE_KEY, migrateAgentEnvelopeV0 } from '@/features/chat/agent-storage';
import {
  AGENT_CATEGORIES,
  BUILTIN_AGENTS,
  buildAgentLaunchPrompt,
  deriveAgentVariant,
  initialAgentInputs,
  validateAgentForm,
} from '@/features/chat/agents';
import { useChatStore } from '@/features/chat/store';
import type { AgentLaunchInputs } from '@/features/chat/agent-types';

describe('智能体：目录与纯函数', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('内置目录：六个类别、至少六个内置、id 唯一、无第三方品牌', () => {
    expect(AGENT_CATEGORIES).toHaveLength(6);
    expect(BUILTIN_AGENTS.length).toBeGreaterThanOrEqual(6);
    const ids = new Set(BUILTIN_AGENTS.map((a) => a.id));
    expect(ids.size).toBe(BUILTIN_AGENTS.length);
    const names = BUILTIN_AGENTS.map((a) => a.name).join(' ');
    expect(names).not.toMatch(/gpt|claude|deepseek|glm|llama|gemini/i);
    expect(BUILTIN_AGENTS.every((a) => a.builtin)).toBe(true);
  });

  it('搜索：命中名称 / 简介 / 标签', () => {
    const store = useAgentsStore();
    store.setKeyword('润色');
    expect(store.visibleAgents.length).toBeGreaterThan(0);
    expect(store.visibleAgents.every((a) => a.name.includes('润色') || a.description.includes('润色') || a.tags.includes('润色'))).toBe(true);
  });

  it('类别筛选：只显示该类别', () => {
    const store = useAgentsStore();
    store.setCategory('code');
    expect(store.visibleAgents.length).toBeGreaterThan(0);
    expect(store.visibleAgents.every((a) => a.category === 'code')).toBe(true);
  });

  it('只看收藏', () => {
    const store = useAgentsStore();
    store.setCategory('all');
    store.toggleFavoritesOnly();
    expect(store.visibleAgents.length).toBeGreaterThan(0);
    expect(store.visibleAgents.every((a) => a.favorite)).toBe(true);
  });

  it('排序：最近使用（lastUsedAt 降序）', () => {
    const store = useAgentsStore();
    store.recordUsage(BUILTIN_AGENTS[1]!.id);
    store.recordUsage(BUILTIN_AGENTS[0]!.id);
    store.setSortBy('recent');
    const first = store.visibleAgents[0]!;
    expect(first.id).toBe(BUILTIN_AGENTS[0]!.id);
    expect((first.lastUsedAt ?? 0)).toBeGreaterThanOrEqual(store.visibleAgents[1]!.lastUsedAt ?? 0);
  });

  it('排序：使用次数降序', () => {
    const store = useAgentsStore();
    store.recordUsage(BUILTIN_AGENTS[2]!.id);
    store.recordUsage(BUILTIN_AGENTS[2]!.id);
    store.recordUsage(BUILTIN_AGENTS[2]!.id);
    store.recordUsage(BUILTIN_AGENTS[3]!.id);
    store.setSortBy('usage');
    expect(store.visibleAgents[0]!.id).toBe(BUILTIN_AGENTS[2]!.id);
    expect(store.visibleAgents[0]!.usageCount).toBe(3);
  });

  it('纯函数：启动输入构建（填充字段 / 缺必填 null / 无字段回退示例任务）', () => {
    const agent = BUILTIN_AGENTS[0]!; // 文章润色：draft 必填 + tone
    expect(buildAgentLaunchPrompt(agent, { draft: ' 一段草稿 ', tone: 'formal' })).toContain('一段草稿');
    expect(buildAgentLaunchPrompt(agent, {})).toBeNull();
    const noField = { ...agent, inputFields: [] };
    expect(buildAgentLaunchPrompt(noField, {})).toBe(agent.starterPrompts[0]);
  });

  it('纯函数：初始输入值带默认值', () => {
    const values = initialAgentInputs(BUILTIN_AGENTS[0]!);
    expect(values.tone).toBe('formal');
  });

  it('纯函数：表单校验', () => {
    expect(validateAgentForm({ name: '', description: 'x', systemPrompt: 'y', recommendedModelId: 'z' }).name).toBeDefined();
    expect(validateAgentForm({ name: 'n', description: 'd', systemPrompt: 's', recommendedModelId: 'r' })).toEqual({});
  });

  it('纯函数：派生变体为 builtin=false、新 id、计数清零', () => {
    const v = deriveAgentVariant(BUILTIN_AGENTS[0]!, { name: '我的润色' });
    expect(v.builtin).toBe(false);
    expect(v.id).not.toBe(BUILTIN_AGENTS[0]!.id);
    expect(v.usageCount).toBe(0);
    expect(v.name).toBe('我的润色');
  });
});

describe('智能体：个人变体 CRUD 与内置保护', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('内置智能体不可删除', () => {
    const store = useAgentsStore();
    const before = store.agents.length;
    expect(store.deleteVariant(BUILTIN_AGENTS[0]!.id)).toBe(false);
    expect(store.agents.length).toBe(before);
  });

  it('创建个人变体并持久化', async () => {
    const store = useAgentsStore();
    const created = store.createVariant({
      name: '我的智能体',
      description: '测试',
      systemPrompt: '你是一个测试助手',
      recommendedModelId: 'general-reasoning',
    });
    expect(created).not.toBeNull();
    expect(store.agents.some((a) => a.id === created!.id && a.builtin === false)).toBe(true);
    await vi.waitFor(() => {
      const raw = localStorage.getItem(AGENT_STORAGE_KEY);
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!).custom.some((a: { id: string }) => a.id === created!.id)).toBe(true);
    });
  });

  it('编辑个人变体；内置不可编辑', () => {
    const store = useAgentsStore();
    const created = store.createVariant({ name: 'A', systemPrompt: 'p', recommendedModelId: 'general-reasoning' })!;
    expect(store.updateVariant(created.id, { name: 'B' })).toBe(true);
    expect(store.agentById(created.id)?.name).toBe('B');
    expect(store.updateVariant(BUILTIN_AGENTS[0]!.id, { name: 'x' })).toBe(false);
  });

  it('复制任意智能体为个人变体', () => {
    const store = useAgentsStore();
    const copy = store.duplicateAgent(BUILTIN_AGENTS[1]!.id);
    expect(copy).not.toBeNull();
    expect(copy!.builtin).toBe(false);
    expect(copy!.id).not.toBe(BUILTIN_AGENTS[1]!.id);
    expect(copy!.systemPrompt).toBe(BUILTIN_AGENTS[1]!.systemPrompt);
  });

  it('删除个人变体', () => {
    const store = useAgentsStore();
    const created = store.createVariant({ name: 'A', systemPrompt: 'p', recommendedModelId: 'general-reasoning' })!;
    expect(store.deleteVariant(created.id)).toBe(true);
    expect(store.agentById(created.id)).toBeUndefined();
  });

  it('隐藏内置智能体：从目录消失且可恢复', () => {
    const store = useAgentsStore();
    const id = BUILTIN_AGENTS[0]!.id;
    store.toggleHidden(id);
    expect(store.visibleAgents.some((a) => a.id === id)).toBe(false);
    store.toggleHidden(id);
    expect(store.visibleAgents.some((a) => a.id === id)).toBe(true);
  });
});

describe('智能体：启动联动', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('启动智能体：新会话继承模型 / 模式 / 系统提示词 / 草稿，且不自动发送', () => {
    const store = useAgentsStore();
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    const agent = BUILTIN_AGENTS[4]!; // 视觉提示词：idea 必填
    const inputs: AgentLaunchInputs = { idea: '深夜书房', style: 'realistic', ratio: '1:1' };
    const result = store.launchAgent(agent.id, inputs);
    expect(result.ok).toBe(true);
    const session = chat.activeSession!;
    expect(session.model).toBe(agent.recommendedModelId);
    expect(session.systemPrompt?.text).toBe(agent.systemPrompt);
    expect(session.systemPrompt?.presetId).toBe(`agent:${agent.id}`);
    expect(session.agentName).toBe(agent.name);
    expect(chat.prefs.outputMode).toBe(agent.recommendedMode);
    expect(chat.composerDraft).toContain('深夜书房');
    expect(session.messages).toHaveLength(0); // 初始内容不自动发送
  });

  it('启动智能体：记录最近使用与使用次数', () => {
    const store = useAgentsStore();
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    const agent = BUILTIN_AGENTS[4]!;
    store.launchAgent(agent.id, { idea: 'x', style: 'realistic', ratio: '1:1' });
    const updated = store.agentById(agent.id)!;
    expect(updated.usageCount).toBe(1);
    expect(updated.lastUsedAt).not.toBeNull();
  });

  it('启动智能体：必填缺失返回错误且不创建会话', () => {
    const store = useAgentsStore();
    const chat = useChatStore();
    const before = chat.sessions.length;
    const result = store.launchAgent(BUILTIN_AGENTS[4]!.id, {});
    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
    expect(chat.sessions.length).toBe(before);
  });

  it('mock 回复携带智能体上下文（署名含智能体名）', async () => {
    const store = useAgentsStore();
    const chat = useChatStore();
    chat.deleteSession(chat.activeId!);
    const agent = BUILTIN_AGENTS[0]!;
    store.launchAgent(agent.id, { draft: '一段草稿', tone: 'formal' });
    chat.sendMessage('开始吧');
    const msg = chat.activeSession!.messages[1]!;
    await vi.waitFor(
      () => {
        expect(msg.streaming).toBe(false);
      },
      { timeout: 20000, interval: 100 },
    );
    expect(msg.content).toContain(agent.name);
  });
});

describe('智能体：持久化可靠性', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('损坏数据回退为空库并标记 recovered', () => {
    localStorage.setItem(AGENT_STORAGE_KEY, '{broken json');
    const store = useAgentsStore();
    expect(store.recovered).toBe(true);
    expect(store.custom.length).toBe(0);
    expect(localStorage.getItem(AGENT_STORAGE_KEY)).toBeNull();
  });

  it('版本不符回退为空库', () => {
    localStorage.setItem(AGENT_STORAGE_KEY, JSON.stringify({ version: 99, custom: [] }));
    const store = useAgentsStore();
    expect(store.recovered).toBe(true);
  });

  it('写入失败不崩溃（配额异常）', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = useAgentsStore();
    expect(() => store.toggleFavorite(BUILTIN_AGENTS[0]!.id)).not.toThrow();
    expect(store.agentById(BUILTIN_AGENTS[0]!.id)?.favorite).toBe(false);
    await vi.waitFor(() => expect(spy).toHaveBeenCalled());
    spy.mockRestore();
  });

  it('v0 裸数组迁移为 custom 列表', () => {
    const migrated = migrateAgentEnvelopeV0([
      { id: 'a1', name: '旧智能体', systemPrompt: 'p', description: 'd' },
      { id: 1, name: '非法' },
    ]);
    expect(migrated).not.toBeNull();
    expect(migrated!.custom).toHaveLength(1);
    expect(migrated!.custom[0]!.builtin).toBe(false);
  });
});

describe('智能体：从消息预填变体', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useRealTimers();
  });

  it('prefillFromMessage 设置预填状态', () => {
    const store = useAgentsStore();
    store.prefillFromMessage('m1', '帮我写一段润色示例', 's1');
    expect(store.pendingPrefill).toMatchObject({ source: 'message', relatedId: 's1' });
    expect(store.pendingPrefill?.title).toContain('帮我写一段润色示例');
    store.clearPrefill();
    expect(store.pendingPrefill).toBeNull();
  });

  it('收藏状态持久化到内置状态覆盖', async () => {
    const store = useAgentsStore();
    const target = BUILTIN_AGENTS.find((a) => !a.favorite)!;
    const id = target.id;
    store.toggleFavorite(id);
    expect(store.agentById(id)?.favorite).toBe(true);
    await vi.waitFor(() => {
      const raw = JSON.parse(localStorage.getItem(AGENT_STORAGE_KEY)!);
      expect(raw.states[id].favorite).toBe(true);
    });
    // 重新创建 store（新 pinia）仍保留
    setActivePinia(createPinia());
    const store2 = useAgentsStore();
    expect(store2.agentById(id)?.favorite).toBe(true);
  });
});
