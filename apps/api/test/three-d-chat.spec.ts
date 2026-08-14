import { describe, expect, it } from 'vitest';

import { ThreeDService } from '../src/modules/three-d/three-d.service.js';
import { THREE_D_TEMPLATES } from '../src/modules/three-d/three-d-templates.js';

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
      for (const [op, fields] of Object.entries(update)) {
        if (op === '$set') {
          for (const [k, v] of Object.entries(fields as Record<string, unknown>)) doc[k] = v;
        }
      }
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
  const model = createFakeModel();
  const threeD = new ThreeDService(model as unknown as never);
  return { model, threeD };
}

describe('3D 项目服务', () => {
  it('模板列表：3 个内置模板', () => {
    const { threeD } = setup();
    expect(threeD.templates()).toHaveLength(3);
    expect(THREE_D_TEMPLATES.map((t) => t.id)).toEqual([
      'tpl_blank',
      'tpl_character-showcase',
      'tpl_storyboard',
    ]);
  });

  it('创建空白项目', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: '我的场景' });
    expect(project.id).toMatch(/^d3p_/);
    expect(project.template).toBe('blank');
    expect(project.assetCount).toBe(0);
    expect(project.characterCount).toBe(0);
  });

  it('按模板实例化：资产树生成全新 id 且 parentId 重映射', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: '角色展示', template: 'character-showcase' });
    expect(project.assetCount).toBe(5);
    expect(project.characterCount).toBe(1);
    expect(project.shotCount).toBe(1);

    const { assets, tree } = await threeD.getTree(project.id);
    expect(tree).toHaveLength(3); // 三个根：角色资产 / 主光 / 展示镜头
    const root = tree.find((n) => n.name === '角色资产')!;
    expect(root.children).toHaveLength(2);
    // 全部 id 为新生成且唯一
    const ids = assets.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.startsWith('ast_'))).toBe(true);
    // 子节点 parentId 指向新 id 而非模板 id
    expect(root.children.every((c) => c.parentId === root.id)).toBe(true);
  });

  it('资产增删改：父节点校验与 404', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: 'p' });
    await expect(
      threeD.addAsset(project.id, { name: 'x', kind: 'mesh', parentId: 'ast_nope' }),
    ).rejects.toThrow('资产节点不存在');

    const root = await threeD.addAsset(project.id, { name: '根', kind: 'folder' });
    const child = await threeD.addAsset(project.id, {
      name: '子',
      kind: 'mesh',
      parentId: root.id,
    });
    expect(child.parentId).toBe(root.id);

    const renamed = await threeD.updateAsset(project.id, child.id, { name: '子改名' });
    expect(renamed.name).toBe('子改名');

    // 有子节点时拒绝删除
    await expect(threeD.removeAsset(project.id, root.id)).rejects.toThrow('存在子节点');
    await threeD.removeAsset(project.id, child.id);
    await threeD.removeAsset(project.id, root.id);
  });

  it('循环 parentId 检测', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: 'p' });
    const a = await threeD.addAsset(project.id, { name: 'A', kind: 'folder' });
    const b = await threeD.addAsset(project.id, { name: 'B', kind: 'folder', parentId: a.id });

    // A 挂到 B 下 → 环
    await expect(threeD.moveAsset(project.id, a.id, { parentId: b.id })).rejects.toThrow(
      '循环引用',
    );
    // B 挂到自身 → 拒绝
    await expect(threeD.moveAsset(project.id, b.id, { parentId: b.id })).rejects.toThrow('自身');
  });

  it('元数据白名单：二进制/对象值被拒绝', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: 'p' });
    await expect(
      threeD.addAsset(project.id, {
        name: 'bad',
        kind: 'mesh',
        meta: { url: 'data:image/png;base64,AAAA' },
      }),
    ).rejects.toThrow();
    await expect(
      threeD.addAsset(project.id, { name: 'bad2', kind: 'mesh', meta: { nested: { a: 1 } } }),
    ).rejects.toThrow();
  });

  it('角色/区域/分镜 CRUD', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: 'p' });

    const chr = await threeD.addCharacter(project.id, {
      name: '主角',
      role: 'protagonist',
      appearance: { style: 'stylized' },
    });
    expect(chr.id).toMatch(/^chr_/);
    await threeD.updateCharacter(project.id, chr.id, { name: '主角改' });

    const region = await threeD.addRegion(project.id, { name: '森林', description: '入口区域' });
    expect(region.id).toMatch(/^reg_/);

    const shot = await threeD.addShot(project.id, {
      name: '开场',
      sequence: 1,
      durationSeconds: 5,
    });
    expect(shot.id).toMatch(/^shot_/);
    await threeD.updateShot(project.id, shot.id, { sequence: 2 });

    await threeD.removeShot(project.id, shot.id);
    await threeD.removeRegion(project.id, region.id);
    await threeD.removeCharacter(project.id, chr.id);
    await expect(threeD.removeCharacter(project.id, chr.id)).rejects.toThrow('角色不存在');
  });

  it('生成简报：写入/覆盖/清除', async () => {
    const { threeD } = setup();
    const project = await threeD.create({ name: 'p' });
    const brief = await threeD.upsertBrief(project.id, {
      prompt: '低多边形小镇',
      style: 'low-poly',
    });
    expect(brief.prompt).toBe('低多边形小镇');
    expect(brief.quality).toBe('standard');

    const brief2 = await threeD.upsertBrief(project.id, { prompt: '改', quality: 'high' });
    expect(brief2.quality).toBe('high');

    await threeD.clearBrief(project.id);
  });

  it('列表过滤与删除', async () => {
    const { threeD } = setup();
    const p1 = await threeD.create({ name: '场景A', tags: ['游戏'] });
    const p2 = await threeD.create({ name: '场景B', template: 'storyboard' });
    await threeD.update(p2.id, { favorite: true });

    expect((await threeD.list({ q: '场景' })).total).toBe(2);
    expect((await threeD.list({ tag: '游戏' })).total).toBe(1);
    expect((await threeD.list({ template: 'storyboard' })).total).toBe(1);
    expect((await threeD.list({ favorite: true })).total).toBe(1);

    await threeD.remove(p1.id);
    await expect(threeD.get(p1.id)).rejects.toThrow('3D 项目不存在');
  });

  it('数据安全：项目名/描述拒绝外链与二进制', async () => {
    const { threeD } = setup();
    await expect(threeD.create({ name: 'https://evil.example/x' })).rejects.toThrow('二进制');
    await expect(
      threeD.create({ name: 'ok', description: 'data:application/octet-stream;base64,AAAA' }),
    ).rejects.toThrow('二进制');
  });
});
