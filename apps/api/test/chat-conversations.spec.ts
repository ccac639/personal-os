import { describe, expect, it } from 'vitest';

import { ChatController } from '../src/modules/chat/chat.controller.js';
import { ConversationsService } from '../src/modules/chat/conversations.service.js';
import { FakeChatJobQueue } from '../src/modules/chat/chat-job-queue.js';
import { GenerationService } from '../src/modules/chat/generation.service.js';
import { MessagesService } from '../src/modules/chat/messages.service.js';

/* ---------- 内存 Model 假件 ---------- */

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

interface Chain {
  sort: (spec?: Record<string, 1 | -1>) => Chain;
  skip: (n: number) => Chain;
  limit: (n: number) => Chain;
  lean: () => Chain;
  exec: () => Promise<Array<Record<string, unknown>>>;
}

function applyUpdate(doc: Record<string, unknown>, update: Record<string, unknown>): void {
  for (const [op, fields] of Object.entries(update)) {
    if (op === '$set') {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) doc[k] = v;
    } else if (op === '$inc') {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        doc[k] = ((doc[k] as number) ?? 0) + (v as number);
      }
    } else if (op === '$push') {
      for (const [k, v] of Object.entries(fields as Record<string, unknown>)) {
        const arr = (doc[k] as unknown[] | undefined) ?? [];
        arr.push(v);
        doc[k] = arr;
      }
    }
  }
}

function createFakeModel() {
  const docs: Array<Record<string, unknown>> = [];
  let clock = Date.now();
  const chain = (arr: Array<Record<string, unknown>>): Chain => {
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
  const conversations = new ConversationsService(convModel as unknown as never);
  const messages = new MessagesService(msgModel as unknown as never, conversations);
  const generation = new GenerationService(
    runModel as unknown as never,
    msgModel as unknown as never,
    conversations,
    messages,
    new FakeChatJobQueue(),
  );
  const controller = new ChatController(conversations, messages, generation);
  return { convModel, msgModel, runModel, conversations, messages, generation, controller };
}

describe('Chat 会话服务', () => {
  it('创建会话：默认标题/模型设置/agentId', async () => {
    const { conversations } = setup();
    const conv = await conversations.create({});
    expect(conv.id).toMatch(/^conv_/);
    expect(conv.title).toBe('新对话');
    expect(conv.modelSettings.provider).toBe('siliconflow');
    expect(conv.modelSettings.model).toBe('Qwen/Qwen2.5-72B-Instruct');
    expect(conv.agentId).toBeNull();
    expect(conv.archived).toBe(false);
  });

  it('创建会话：自定义标题/系统提示词/模型设置', async () => {
    const { conversations } = setup();
    const conv = await conversations.create({
      title: '  代码评审  ',
      systemPrompt: '你是评审员',
      modelSettings: {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        temperature: 0.3,
        maxTokens: 300,
      },
      agentId: 'agt_1',
    });
    expect(conv.title).toBe('代码评审');
    expect(conv.systemPrompt).toBe('你是评审员');
    expect(conv.modelSettings.provider).toBe('anthropic');
    expect(conv.agentId).toBe('agt_1');
  });

  it('列表：默认排除已归档，支持固定/收藏/关键字/智能体过滤', async () => {
    const { conversations } = setup();
    await conversations.create({ title: 'Alpha' });
    await conversations.create({ title: 'Beta', agentId: 'agt_9' });
    const pinned = await conversations.create({ title: 'Pin' });
    await conversations.patchState(pinned.id, { pinned: true, favorite: true });
    const archived = await conversations.create({ title: 'Old' });
    await conversations.patchState(archived.id, { archived: true });

    const all = await conversations.list({});
    expect(all.total).toBe(3);
    expect(all.items[0]!.id).toBe(pinned.id); // 置顶优先

    const byQ = await conversations.list({ q: 'alpha' });
    expect(byQ.total).toBe(1);

    const byAgent = await conversations.list({ agentId: 'agt_9' });
    expect(byAgent.total).toBe(1);

    const archivedOnly = await conversations.list({ archived: true });
    expect(archivedOnly.total).toBe(1);

    const includeArchived = await conversations.list({ archived: null });
    expect(includeArchived.total).toBe(4);
  });

  it('更新：标题/系统提示词/模型设置合并', async () => {
    const { conversations } = setup();
    const conv = await conversations.create({});
    const updated = await conversations.update(conv.id, {
      title: '新标题',
      systemPrompt: 'p',
      modelSettings: { provider: 'google', model: 'gemini-2.0-flash' },
    });
    expect(updated.title).toBe('新标题');
    expect(updated.modelSettings.provider).toBe('google');
    expect(updated.modelSettings.maxTokens).toBe(500); // 未提供字段保留默认
  });

  it('状态切换：固定/归档/收藏', async () => {
    const { conversations } = setup();
    const conv = await conversations.create({});
    const patched = await conversations.patchState(conv.id, { pinned: true, favorite: true });
    expect(patched.pinned).toBe(true);
    expect(patched.favorite).toBe(true);

    const archived = await conversations.patchState(conv.id, { archived: true });
    expect(archived.archived).toBe(true);
  });

  it('删除：级联清理消息与生成任务（controller 编排），404 语义', async () => {
    const { conversations, messages, generation, msgModel, runModel, controller } = setup();
    const conv = await conversations.create({});
    const msg = await messages.append(conv.id, { role: 'user', content: 'hi' });
    await generation.generateFromMessage(conv.id, msg.id, {});
    expect(runModel.docs).toHaveLength(1);
    // DELETE /api/chat/conversations/:id = controller 编排：remove + removeAll(messages) + removeAll(runs)
    await controller.deleteConversation(conv.id);
    expect(msgModel.docs).toHaveLength(0);
    expect(runModel.docs).toHaveLength(0);
    await expect(conversations.get(conv.id)).rejects.toThrow('会话不存在');
    await expect(conversations.remove('conv_nope')).rejects.toThrow('会话不存在');
  });

  it('追加消息：自动标题 + lastMessageAt 更新', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    await messages.append(conv.id, {
      role: 'user',
      content: '帮我总结一下这段很长的文字内容，超过三十个字符会自动截断标题用',
    });
    const updated = await conversations.get(conv.id);
    expect(updated.title.startsWith('帮我总结一下这段很长的文字内容')).toBe(true);
  });
});

describe('Chat 消息服务', () => {
  it('追加：校验角色/长度/二进制拒绝', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    const msg = await messages.append(conv.id, { role: 'user', content: '你好' });
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('你好');
    expect(msg.status).toBe('completed');
    expect(msg.bookmarks).toEqual([]);

    await expect(
      messages.append(conv.id, { role: 'assistant', content: 'data:image/png;base64,AAAA' }),
    ).rejects.toThrow('二进制');
    await expect(
      messages.append(conv.id, { role: 'system', content: 'x'.repeat(30_000) }),
    ).rejects.toThrow();
    await expect(messages.append('conv_nope', { role: 'user', content: 'hi' })).rejects.toThrow(
      '会话不存在',
    );
  });

  it('分页读取：倒序 + 角色过滤 + 游标', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    for (let i = 0; i < 5; i += 1) {
      await messages.append(conv.id, { role: 'user', content: `q${i}` });
      await messages.append(conv.id, { role: 'assistant', content: `a${i}` });
    }
    const page1 = await messages.list(conv.id, { page: 1, pageSize: 3 });
    expect(page1.total).toBe(10);
    expect(page1.items).toHaveLength(3);
    expect(page1.items[0]!.content).toBe('a4'); // 倒序
    const page2 = await messages.list(conv.id, { page: 2, pageSize: 3 });
    expect(page2.items[0]!.content).toBe('q3'); // 交错倒序：a4,q4,a3,q3,...
    expect(page2.items[1]!.content).toBe('a2');
    const users = await messages.list(conv.id, { role: 'user' });
    expect(users.total).toBe(5);
  });

  it('引用与回复', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    const base = await messages.append(conv.id, { role: 'user', content: '原文' });
    const reply = await messages.append(conv.id, {
      role: 'user',
      content: '回复',
      replyTo: base.id,
      quote: { role: 'user', excerpt: '原文摘录' },
    });
    expect(reply.references.replyTo).toBe(base.id);
    expect(reply.references.quote).toEqual({
      messageId: base.id,
      role: 'user',
      excerpt: '原文摘录',
    });
  });

  it('编辑消息：内容更新 + editedAt + 清空生成信息', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    const msg = await messages.append(conv.id, { role: 'user', content: 'v1' });
    await messages.markMessageStatus(msg.id, 'pending');
    const edited = await messages.edit(msg.id, { content: 'v2' });
    expect(edited.content).toBe('v2');
    expect(edited.editedAt).not.toBeNull();
    expect(edited.genInfo).toEqual({});
  });

  it('书签：添加/列表/移除', async () => {
    const { conversations, messages } = setup();
    const conv = await conversations.create({});
    const m1 = await messages.append(conv.id, { role: 'user', content: '重点内容' });
    await messages.append(conv.id, { role: 'user', content: '普通内容' });

    const bookmarked = await messages.addBookmark(m1.id, { label: '重要', note: '后续处理' });
    expect(bookmarked.bookmarks).toHaveLength(1);
    expect(bookmarked.bookmarks[0]!.label).toBe('重要');

    const list = await messages.listBookmarks(conv.id);
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe(m1.id);

    const removed = await messages.removeBookmark(m1.id, bookmarked.bookmarks[0]!.id);
    expect(removed.bookmarks).toHaveLength(0);
    expect(await messages.listBookmarks(conv.id)).toHaveLength(0);
    await expect(messages.removeBookmark(m1.id, 'bmk_nope')).rejects.toThrow('书签不存在');
  });
});
