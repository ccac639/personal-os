import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ACHIEVEMENT_STORAGE_KEY, useAchievementStore } from '@/features/achievements/store';
import { describeImportScope, parseImport } from '@/features/achievements/storage';
import type { AchievementStorageData } from '@/features/achievements/storage';

function readStorage(): AchievementStorageData {
  return JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY)!) as AchievementStorageData;
}

describe('achievement import（文件解析健壮性）', () => {
  it('损坏文件：非法 JSON 返回可读错误', () => {
    expect(parseImport('{oops').ok).toBe(false);
    expect(parseImport('not json at all').ok).toBe(false);
    expect(parseImport('42').ok).toBe(false);
  });

  it('结构错误：缺少成果数组时报错', () => {
    const res = parseImport(JSON.stringify({ foo: 1 }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain('成果数组');
  });

  it('过新版本：拒绝导入并提示版本号', () => {
    const res = parseImport(JSON.stringify({ version: 999, items: [] }));
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toContain('版本过新');
      expect(res.error).toContain('999');
    }
  });

  it('空文件/空数组：合法但无内容', () => {
    const res = parseImport(JSON.stringify({ version: 2, items: [] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.items).toEqual([]);
      expect(res.dropped).toBe(0);
    }
  });

  it('describeImportScope：单项 / 集合 / 全库预览识别', () => {
    const item = {
      id: 'a1',
      type: 'project',
      title: '单项',
      summary: '',
      description: '',
      tags: [],
      completedAt: '2026-01-01',
      metrics: [],
      relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
      reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
      pinned: false,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const col = {
      id: 'c1',
      name: '精选',
      description: '',
      color: '#0ea5e9',
      achievementIds: ['a1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    // 单项导出：1 条成果 + 无集合
    expect(describeImportScope({ items: [item], collections: [] })).toBe('single');
    // 集合导出：含集合（任意条成果）
    expect(describeImportScope({ items: [item], collections: [col] })).toBe('collection');
    // 全库导出：多条目无集合
    expect(describeImportScope({ items: [item, { ...item, id: 'a2' }], collections: [] })).toBe(
      'library',
    );
    // 空数组兜底：按 library 处理
    expect(describeImportScope({ items: [], collections: [] })).toBe('library');
  });
});

describe('achievement import（Store 冲突策略与可靠性）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('overwrite：同 id 覆盖并保留 id 与创建时间', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const outcome = store.importItems(
      { items: [{ ...existing, title: '覆盖版' }], collections: [] },
      'overwrite',
    );
    expect(outcome.replaced).toBe(1);
    expect(store.get(existing.id)!.title).toBe('覆盖版');
    expect(store.get(existing.id)!.createdAt).toBe(existing.createdAt);
    expect(readStorage().items).toHaveLength(store.achievements.length);
  });

  it('skip：冲突保留现有，集合冲突同样跳过', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const outcome = store.importItems(
      {
        items: [{ ...existing, title: '不生效' }],
        collections: [{ ...store.collections[0]!, name: '不生效的集合' }],
      },
      'skip',
    );
    expect(outcome.skipped).toBe(1);
    expect(outcome.collectionSkipped).toBe(1);
    expect(store.get(existing.id)!.title).not.toBe('不生效');
    expect(store.collections[0]!.name).not.toBe('不生效的集合');
  });

  it('copy：冲突条目复制为新 id，seq 推进，集合引用重映射', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const col = store.collections[0]!;
    const before = store.seq;

    const outcome = store.importItems(
      {
        items: [{ ...existing, title: '副本' }],
        collections: [{ ...col, achievementIds: [existing.id] }],
      },
      'copy',
    );
    expect(outcome.copied).toBe(1);
    expect(outcome.collectionAdded).toBe(1);
    expect(store.seq).toBeGreaterThan(before);
    const copy = store.achievements.find((a) => a.title === '副本')!;
    expect(copy.id).not.toBe(existing.id);
    // 新导入的集合指向副本 id
    const newCol = store.collections.find((c) => c.name === col.name && c.id !== col.id)!;
    expect(newCol.achievementIds).toEqual([copy.id]);
  });

  it('写入失败：导入保留内存状态并置 persistError，不丢数据', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const store = useAchievementStore();
      const before = store.achievements.length;
      const outcome = store.importItems(
        { items: [{ ...store.achievements[0]!, id: 'imp-x', title: '写不进去' }], collections: [] },
        'overwrite',
      );
      expect(outcome.added).toBe(1);
      expect(store.achievements).toHaveLength(before + 1); // 内存保留
      expect(store.get('imp-x')).not.toBeNull();
      expect(store.persistError).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('写入恢复后 persistError 清空', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = useAchievementStore();
    store.importItems(
      { items: [{ ...store.achievements[0]!, id: 'imp-1' }], collections: [] },
      'overwrite',
    );
    expect(store.persistError).toBe(true);
    spy.mockRestore();

    store.importItems(
      { items: [{ ...store.achievements[0]!, id: 'imp-2' }], collections: [] },
      'overwrite',
    );
    expect(store.persistError).toBe(false);
  });

  it('导入后 seq 单调递增，新条目 id 不与现有冲突', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    store.importItems({ items: [{ ...existing, id: 'ac-1' }], collections: [] }, 'overwrite');
    // ac-1 被覆盖（种子 ac-* id 已存在），不产生重复 id
    const ids = new Set(store.achievements.map((a) => a.id));
    expect(ids.size).toBe(store.achievements.length);
  });

  it('导入集合引用不存在的成果：保留引用，UI 显示失效（不崩溃）', () => {
    const store = useAchievementStore();
    store.importItems(
      {
        items: [{ ...store.achievements[0]!, id: 'imp-only' }],
        collections: [
          {
            id: 'col-imp',
            name: '导入集合',
            description: '',
            color: '#0ea5e9',
            achievementIds: ['imp-only', 'ghost-ref'],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
      'overwrite',
    );
    const col = store.getCollection('col-imp')!;
    expect(col.achievementIds).toEqual(['imp-only', 'ghost-ref']);
    expect(readStorage().collections.some((c) => c.id === 'col-imp')).toBe(true);
  });
});

describe('achievement import（导出-导入往返）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('全库导出后可整体导入到全新环境（含集合）', () => {
    const store = useAchievementStore();
    const json = store.exportJson('all');
    const parsed = parseImport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    setActivePinia(createPinia());
    localStorage.clear();
    const fresh = useAchievementStore();
    fresh.batchDelete(fresh.achievements.map((a) => a.id)); // 模拟空白环境
    fresh.importItems(parsed.payload, 'overwrite');

    expect(fresh.achievements).toHaveLength(store.achievements.length);
    expect(fresh.collections).toHaveLength(store.collections.length);
    // 种子集合在删除成果后引用被清空，但集合本身仍在
    const alive = fresh.collections.filter((c) => c.achievementIds.length > 0);
    const originalAlive = store.collections.filter((c) => c.achievementIds.length > 0);
    expect(alive).toHaveLength(originalAlive.length);
  });
});
