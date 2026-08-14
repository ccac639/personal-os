import { describe, expect, it } from 'vitest';

import { ConversationsService } from '../src/modules/chat/conversations.service.js';
import { MessagesService } from '../src/modules/chat/messages.service.js';
import { GenerationService } from '../src/modules/chat/generation.service.js';
import { FakeChatJobQueue } from '../src/modules/chat/chat-job-queue.js';

/* ---------- 内存 Model 假件（与 chat-conversations.spec 同构） ---------- */

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
  const convModel = createFakeModel();
  const msgModel = createFakeModel();
  const runModel = createFakeModel();
  const queue = new FakeChatJobQueue();
  const conversations = new ConversationsService(convModel as unknown as never);
  const messages = new MessagesService(msgModel as unknown as never, conversations);
  const generation = new GenerationService(
    runModel as unknown as never,
    msgModel as unknown as never,
    conversations,
    messages,
    queue,
  );
  return { convModel, msgModel, runModel, queue, conversations, messages, generation };
}

async function seedConversation(
  messages: MessagesService,
  conversations: ConversationsService,
): Promise<{
  conv: Awaited<ReturnType<ConversationsService['create']>>;
  m1: Awaited<ReturnType<MessagesService['append']>>;
  a1: Awaited<ReturnType<MessagesService['append']>>;
  m2: Awaited<ReturnType<MessagesService['append']>>;
}> {
  const conv = await conversations.create({ systemPrompt: '你是测试助手' });
  const m1 = await messages.append(conv.id, { role: 'user', content: '第一问' });
  const a1 = await messages.append(conv.id, { role: 'assistant', content: '第一答' });
  const m2 = await messages.append(conv.id, { role: 'user', content: '第二问' });
  return { conv, m1, a1, m2 };
}

describe('Chat 生成任务服务（mock 入队）', () => {
  it('生成：创建 run + 入队负载（系统提示词与历史快照）', async () => {
    const { conversations, messages, generation, queue, msgModel, runModel } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);

    const run = await generation.generateFromMessage(conv.id, m2.id, {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(run.id).toMatch(/^run_/);
    expect(run.state).toBe('queued');
    expect(queue.enqueued).toHaveLength(1);
    const payload = queue.enqueued[0]!;
    expect(payload.runId).toBe(run.id);
    expect(payload.conversationId).toBe(conv.id);
    expect(payload.systemPrompt).toBe('你是测试助手');
    expect(payload.history.map((h) => h.content)).toEqual(['第一问', '第一答']);
    expect(payload.history).not.toContainEqual(expect.objectContaining({ content: '第二问' }));

    // 消息置为 pending，run 落库
    expect(msgModel.docs.find((d) => d.id === m2.id)!.status).toBe('pending');
    expect(runModel.docs.find((d) => d.id === run.id)!.state).toBe('queued');
  });

  it('生成：maxTokens 被钳制到上限', async () => {
    const { conversations, messages, generation, queue } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);
    await generation.generateFromMessage(conv.id, m2.id, {
      provider: 'mock',
      model: 'm',
      maxTokens: 99999,
    });
    expect(queue.enqueued[0]!.maxTokens).toBe(2000);
  });

  it('生成：入队失败 → run failed + 消息 failed（错误脱敏）', async () => {
    const { conversations, messages, generation, queue, msgModel } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);
    queue.failEnqueue = true;
    const run = await generation.generateFromMessage(conv.id, m2.id, {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    expect(run.state).toBe('failed');
    expect(String(run.meta!.error)).toContain('fake queue down');
    expect(msgModel.docs.find((d) => d.id === m2.id)!.status).toBe('failed');
  });

  it('取消：queued 任务取消成功并标记消息', async () => {
    const { conversations, messages, generation, queue, msgModel } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);
    const run = await generation.generateFromMessage(conv.id, m2.id, {
      provider: 'openai',
      model: 'gpt-4o-mini',
    });
    const cancelled = await generation.cancel(run.id);
    expect(cancelled.state).toBe('cancelled');
    expect(queue.isCancelled(run.id)).toBe(true);
    expect(msgModel.docs.find((d) => d.id === m2.id)!.status).toBe('cancelled');
  });

  it('ask：一步完成追加消息 + 生成', async () => {
    const { conversations, generation } = setup();
    const conv = await conversations.create({});
    const { userMessage, run } = await generation.ask(conv.id, '新问题', {
      provider: 'openai',
      model: 'm',
    });
    expect(userMessage.role).toBe('user');
    expect(userMessage.content).toBe('新问题');
    expect(run.state).toBe('queued');
  });

  it('regenerate：编辑重发', async () => {
    const { conversations, messages, generation, queue, msgModel } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);
    const run = await generation.regenerate(conv.id, m2.id, '改后的问题', {
      provider: 'openai',
      model: 'm',
    });
    expect(queue.enqueued).toHaveLength(1);
    expect(msgModel.docs.find((d) => d.id === m2.id)!.content).toBe('改后的问题');
    expect(run.state).toBe('queued');
  });

  it('校验：消息不属于会话 / 非 user 消息 → 400', async () => {
    const { conversations, messages, generation } = setup();
    const { conv, a1 } = await seedConversation(messages, conversations);
    const other = await conversations.create({});
    await expect(
      generation.generateFromMessage(other.id, a1.id, { provider: 'openai', model: 'm' }),
    ).rejects.toThrow();
    await expect(
      generation.generateFromMessage(conv.id, a1.id, { provider: 'openai', model: 'm' }),
    ).rejects.toThrow(/用户|user/);
  });

  it('查询 run 列表：按会话倒序分页', async () => {
    const { conversations, messages, generation } = setup();
    const { conv, m2 } = await seedConversation(messages, conversations);
    await generation.generateFromMessage(conv.id, m2.id, { provider: 'openai', model: 'm' });
    const list = await generation.listRuns(conv.id, {});
    expect(list.total).toBe(1);
    expect(list.items[0]!.conversationId).toBe(conv.id);
  });
});
