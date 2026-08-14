import { describe, expect, it } from 'vitest';

import { InspirationsService } from '../src/modules/inspiration/inspiration.service.js';
import { ConversationsService } from '../src/modules/chat/conversations.service.js';
import { MessagesService } from '../src/modules/chat/messages.service.js';

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
  const insModel = createFakeModel();
  const msgModel = createFakeModel();
  const convModel = createFakeModel();
  const conversations = new ConversationsService(convModel as unknown as never);
  const messages = new MessagesService(msgModel as unknown as never, conversations);
  const inspirations = new InspirationsService(insModel as unknown as never, messages);
  return { insModel, msgModel, convModel, conversations, messages, inspirations };
}

describe('灵感库服务', () => {
  it('创建：默认分类/来源', async () => {
    const { inspirations } = setup();
    const ins = await inspirations.create({ title: '想法', content: '内容' });
    expect(ins.id).toMatch(/^ins_/);
    expect(ins.category).toBe('未分类');
    expect(ins.source).toBe('manual');
  });

  it('CRUD 与状态切换', async () => {
    const { inspirations } = setup();
    const ins = await inspirations.create({
      title: 'T',
      content: 'C',
      category: '产品',
      tags: ['AI'],
    });

    const updated = await inspirations.update(ins.id, { title: 'T2', content: 'C2' });
    expect(updated.title).toBe('T2');

    const patched = await inspirations.patchState(ins.id, { favorite: true, pinned: true });
    expect(patched.favorite).toBe(true);
    expect(patched.pinned).toBe(true);

    const archived = await inspirations.patchState(ins.id, { archived: true });
    expect(archived.archived).toBe(true);

    await inspirations.remove(ins.id);
    await expect(inspirations.get(ins.id)).rejects.toThrow('灵感不存在');
  });

  it('筛选：分类/标签/来源/收藏/关键字', async () => {
    const { inspirations } = setup();
    await inspirations.create({
      title: '产品灵感',
      content: '关于产品的写作想法',
      category: '产品',
      tags: ['AI'],
    });
    await inspirations.create({
      title: '写作灵感',
      content: '写作方向',
      category: '写作',
      tags: ['文学'],
      source: 'chat',
    });
    const fav = await inspirations.create({ title: '置顶灵感', content: '重点', category: '产品' });
    await inspirations.patchState(fav.id, { favorite: true, pinned: true });

    expect((await inspirations.list({ category: '产品' })).total).toBe(2);
    expect((await inspirations.list({ tag: '文学' })).total).toBe(1);
    expect((await inspirations.list({ source: 'chat' })).total).toBe(1);
    expect((await inspirations.list({ favorite: true })).total).toBe(1);
    expect((await inspirations.list({ q: '写作' })).total).toBe(2);
    const pinnedList = await inspirations.list({});
    expect(pinnedList.items[0]!.id).toBe(fav.id); // 置顶优先
  });

  it('从消息保存：来源与归属回填', async () => {
    const { conversations, messages, inspirations } = setup();
    const conv = await conversations.create({});
    const msg = await messages.append(conv.id, {
      role: 'assistant',
      content: '这条灵感值得记录：用 AI 整理每日笔记',
    });
    const ins = await inspirations.saveFromMessage(conv.id, msg.id, { title: '每日笔记整理' });
    expect(ins.source).toBe('chat');
    expect(ins.sourceMessageId).toBe(msg.id);
    expect(ins.sourceConversationId).toBe(conv.id);
    expect(ins.title).toBe('每日笔记整理');

    // 跨会话消息 → 400
    const other = await conversations.create({});
    await expect(inspirations.saveFromMessage(other.id, msg.id, {})).rejects.toThrow(
      '消息不属于该会话',
    );
  });

  it('导入：skip 策略按 id 与指纹去重', async () => {
    const { inspirations } = setup();
    await inspirations.create({ title: '已有', content: '内容A' });

    const result = await inspirations.importItems({
      duplicatePolicy: 'skip',
      items: [
        { title: '新1', content: '内容B' },
        { title: '新2', content: '内容C' },
        { title: '已有', content: '内容A' }, // 指纹重复
      ],
    });
    expect(result).toMatchObject({ imported: 2, skipped: 1, failed: 0 });

    // 带已有 id 的条目按 id 判重
    const second = await inspirations.importItems({
      duplicatePolicy: 'skip',
      items: [{ title: '新2', content: '内容C', id: 'ins_dup' }],
    });
    expect(second.imported).toBe(1);
    const third = await inspirations.importItems({
      duplicatePolicy: 'skip',
      items: [{ title: '新2', content: '内容C', id: 'ins_dup' }],
    });
    expect(third.skipped).toBe(1);
  });

  it('导入：overwrite 覆盖既有内容（按 id 判重）', async () => {
    const { inspirations, insModel } = setup();
    const existing = await inspirations.create({ title: '旧标题', content: '旧内容' });
    const result = await inspirations.importItems({
      duplicatePolicy: 'overwrite',
      items: [{ title: '新标题', content: '新内容', id: existing.id }],
    });
    expect(result).toMatchObject({ overwritten: 1, imported: 0 });
    const doc = insModel.docs[0]!;
    expect(doc.title).toBe('新标题');
    expect(doc.content).toBe('新内容');
  });

  it('导入：keep-both 保留两条', async () => {
    const { inspirations, insModel } = setup();
    await inspirations.create({ title: '重复标题', content: '重复内容' });
    const result = await inspirations.importItems({
      duplicatePolicy: 'keep-both',
      items: [{ title: '重复标题', content: '重复内容' }],
    });
    expect(result.imported).toBe(1);
    expect(insModel.docs).toHaveLength(2);
  });

  it('导入：dryRun 不落库 + 非法条目计数', async () => {
    const { inspirations, insModel } = setup();
    const result = await inspirations.importItems({
      duplicatePolicy: 'skip',
      dryRun: true,
      items: [
        { title: '合法', content: '内容' },
        { title: '', content: '缺标题' },
        { title: '缺内容', content: '' },
      ],
    });
    expect(result).toMatchObject({ imported: 1, failed: 2 });
    expect(result.errors).toHaveLength(2);
    expect(insModel.docs).toHaveLength(0);
  });

  it('导出：与导入条目同构', async () => {
    const { inspirations } = setup();
    await inspirations.create({
      title: 'T',
      content: 'C',
      category: '写作',
      tags: ['a'],
      source: 'chat',
    });
    const items = await inspirations.exportItems({});
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: 'T', content: 'C', category: '写作', tags: ['a'] });
  });

  it('数据安全：拒绝二进制内容', async () => {
    const { inspirations } = setup();
    await expect(
      inspirations.create({ title: 'bad', content: 'data:image/png;base64,AAAA' }),
    ).rejects.toThrow('二进制');
    await expect(
      inspirations.create({ title: 'bad2', content: 'https://example.com/x.png' }),
    ).rejects.toThrow('二进制');
  });
});
