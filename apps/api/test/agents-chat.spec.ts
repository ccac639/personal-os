import { describe, expect, it } from 'vitest';

import { AgentsService } from '../src/modules/agents/agents.service.js';
import { ConversationsService } from '../src/modules/chat/conversations.service.js';
import { BUILTIN_AGENTS } from '../src/modules/agents/builtin-agents.js';

/* ---------- 内存 Model 假件（与 chat spec 同构） ---------- */

function getPath(doc: Record<string, unknown>, key: string): unknown {
  if (key.includes('.')) {
    return key.split('.').reduce<unknown>((acc, k) => {
      if (acc === null || acc === undefined) return undefined;
      return (acc as Record<string, unknown>)[k];
    }, doc);
  }
  return doc[key];
}

function matchDoc(doc: Record<string, unknown>, filter: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(filter)) {
    if (key === '$or') {
      if (!(cond as Record<string, unknown>[]).some((c) => matchDoc(doc, c))) return false;
      continue;
    }
    if (key === '$and') {
      if (!(cond as Record<string, unknown>[]).every((c) => matchDoc(doc, c))) return false;
      continue;
    }
    const value = getPath(doc, key);
    if (
      cond !== null &&
      typeof cond === 'object' &&
      !(cond instanceof RegExp) &&
      !Array.isArray(cond)
    ) {
      const op = cond as Record<string, unknown>;
      if ('$ne' in op && value === op['$ne']) return false;
      if ('$lt' in op && !((value as number) < (op['$lt'] as number))) return false;
      if ('$gt' in op && !((value as number) > (op['$gt'] as number))) return false;
      if ('$exists' in op && (value === undefined) === !!op['$exists']) return false;
      if ('$in' in op && !(op['$in'] as unknown[]).includes(value)) return false;
      continue;
    }
    if (cond instanceof RegExp) {
      if (!cond.test(String(value ?? ''))) return false;
      continue;
    }
    if (Array.isArray(value)) {
      if (!value.includes(cond)) return false;
      continue;
    }
    if (value !== cond) return false;
  }
  return true;
}

function applyUpdate(doc: Record<string, unknown>, update: Record<string, unknown>): void {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) doc[k] = v;
    } else if (op === '$inc') {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        doc[k] = ((doc[k] as number) ?? 0) + (v as number);
      }
    }
  }
}

function createFakeModel() {
  const docs: Array<Record<string, unknown>> = [];
  let clock = Date.now();
  const chain = (arr: Array<Record<string, unknown>>) => {
    let current = arr;
    return {
      sort: (spec?: Record<string, 1 | -1>) => {
        if (spec) {
          const entries = Object.entries(spec);
          current = [...current].sort((a, b) => {
            for (const [k, dir] of entries) {
              const av = a[k];
              const bv = b[k];
              if (av === bv) continue;
              const cmp = av === undefined ? -1 : bv === undefined ? 1 : av < bv ? -1 : 1;
              return cmp * dir;
            }
            return 0;
          });
        }
        return chain(current);
      },
      skip: (n: number) => {
        current = current.slice(n);
        return chain(current);
      },
      limit: (n: number) => {
        current = current.slice(0, n);
        return chain(current);
      },
      lean: () => chain(current),
      exec: async () => current.map((d) => ({ ...d })),
    };
  };
  return {
    docs,
    async create(data: Record<string, unknown>) {
      clock += 1;
      const doc: Record<string, unknown> = {
        ...data,
        createdAt: data.createdAt ?? new Date(clock),
        updatedAt: data.updatedAt ?? new Date(clock),
        save: async () => doc,
      };
      docs.push(doc);
      return doc;
    },
    findOne(filter: Record<string, unknown>) {
      const found = docs.find((d) => matchDoc(d, filter)) ?? null;
      return { exec: async () => found };
    },
    find(filter: Record<string, unknown>) {
      return chain(docs.filter((d) => matchDoc(d, filter)));
    },
    countDocuments(filter: Record<string, unknown>) {
      return { exec: async () => docs.filter((d) => matchDoc(d, filter)).length };
    },
    updateOne(filter: Record<string, unknown>, update: Record<string, unknown>) {
      const doc = docs.find((d) => matchDoc(d, filter));
      if (!doc) return { exec: async () => ({ modifiedCount: 0 }) };
      applyUpdate(doc, update);
      return { exec: async () => ({ modifiedCount: 1 }) };
    },
    deleteOne(filter: Record<string, unknown>) {
      const idx = docs.findIndex((d) => matchDoc(d, filter));
      if (idx < 0) return { exec: async () => ({ deletedCount: 0 }) };
      docs.splice(idx, 1);
      return { exec: async () => ({ deletedCount: 1 }) };
    },
    deleteMany(filter: Record<string, unknown>) {
      const before = docs.length;
      for (let i = docs.length - 1; i >= 0; i -= 1) {
        if (matchDoc(docs[i]!, filter)) docs.splice(i, 1);
      }
      return { exec: async () => ({ deletedCount: before - docs.length }) };
    },
  };
}

function setup() {
  const agentModel = createFakeModel();
  const convModel = createFakeModel();
  const conversations = new ConversationsService(convModel as unknown as never);
  const agents = new AgentsService(agentModel as unknown as never, conversations);
  return { agentModel, convModel, conversations, agents };
}

describe('智能体服务', () => {
  it('内置模板：4 个种子，系统归属', () => {
    expect(BUILTIN_AGENTS).toHaveLength(4);
    expect(BUILTIN_AGENTS.map((a) => a.builtinKey)).toContain('general-assistant');
    expect(BUILTIN_AGENTS[0]!.systemPrompt.length).toBeGreaterThan(0);
  });

  it('个人变体：创建与默认字段', async () => {
    const { agents } = setup();
    const agent = await agents.create({
      name: '我的评审员',
      model: 'gpt-4o-mini',
      provider: 'openai',
    });
    expect(agent.id).toMatch(/^agt_/);
    expect(agent.kind).toBe('personal');
    expect(agent.usageCount).toBe(0);
    expect(agent.hidden).toBe(false);
    expect(agent.favorite).toBe(false);
  });

  it('从内置模板派生个人变体', async () => {
    const { agents } = setup();
    const derived = await agents.deriveFromBuiltin('code-reviewer', { name: '我的评审' });
    expect(derived.kind).toBe('personal');
    expect(derived.name).toBe('我的评审');
    expect(derived.builtinKey).toBe('code-reviewer');
    expect(derived.systemPrompt.length).toBeGreaterThan(0);

    await expect(agents.deriveFromBuiltin('nope')).rejects.toThrow('模板不存在');
  });

  it('收藏/隐藏/最近使用', async () => {
    const { agents } = setup();
    const a1 = await agents.create({ name: 'A', model: 'm', provider: 'openai' });
    const a2 = await agents.create({ name: 'B', model: 'm', provider: 'openai' });

    const fav = await agents.update(a1.id, { favorite: true });
    expect(fav.favorite).toBe(true);

    // 启动会话会更新最近使用
    await agents.startConversation(a1.id);
    const used = await agents.get(a1.id);
    expect(used.usageCount).toBe(1);
    expect(used.lastUsedAt).not.toBeNull();

    const hidden = await agents.update(a2.id, { hidden: true });
    expect(hidden.hidden).toBe(true);

    const recent = await agents.recent(5);
    expect(recent[0]!.id).toBe(a1.id); // 最近使用优先
  });

  it('启动智能体创建会话：模型设置与系统提示词透传', async () => {
    const { agents, conversations } = setup();
    const agent = await agents.create({
      name: '写作助手',
      model: 'gpt-4o-mini',
      provider: 'openai',
      systemPrompt: '你是润色专家',
    });
    // 契约：startConversation 返回 { agent, conversationId }（AgentStartResultDto）
    const { conversationId } = await agents.startConversation(agent.id, undefined, '润色任务');
    expect(conversationId).toMatch(/^conv_/);
    const conv = await conversations.get(conversationId);
    expect(conv.agentId).toBe(agent.id);
    expect(conv.systemPrompt).toBe('你是润色专家');
    expect(conv.modelSettings.provider).toBe('openai');
    expect(conv.title).toBe('润色任务');

    // 使用次数 +1
    const used = await agents.get(agent.id);
    expect(used.usageCount).toBe(1);

    // 隐藏的智能体不可启动
    await agents.update(agent.id, { hidden: true });
    await expect(agents.startConversation(agent.id)).rejects.toThrow();
  });

  it('列表：默认排除隐藏，支持关键字/收藏过滤', async () => {
    const { agents } = setup();
    await agents.create({ name: 'Alpha', model: 'm', provider: 'openai' });
    const beta = await agents.create({ name: 'Beta', model: 'm', provider: 'openai' });
    await agents.update(beta.id, { favorite: true });

    const all = await agents.list({});
    // 列表 = 4 个内置模板（SYSTEM_OWNER）+ 2 个个人变体
    expect(all.total).toBe(6);

    const byQ = await agents.list({ q: 'alpha' });
    expect(byQ.total).toBe(1);

    const favs = await agents.list({ favorite: true });
    expect(favs.total).toBe(1);
    expect(favs.items[0]!.id).toBe(beta.id);
  });

  it('删除与 404 语义', async () => {
    const { agents } = setup();
    const agent = await agents.create({ name: 'X', model: 'm', provider: 'openai' });
    await agents.remove(agent.id);
    await expect(agents.get(agent.id)).rejects.toThrow('智能体不存在');
    await expect(agents.remove('agt_nope')).rejects.toThrow('智能体不存在');
  });
});
