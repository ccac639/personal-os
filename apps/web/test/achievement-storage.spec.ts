import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_STORAGE_KEY,
  ACHIEVEMENT_UI_STORAGE_KEY,
  STORAGE_VERSION,
  buildExport,
  loadAchievementStorage,
  loadUiState,
  mergeImport,
  normalizeStorage,
  parseImport,
  sanitizeCollection,
  sanitizeItem,
  sanitizeSavedFilter,
  sanitizeUiState,
} from '@/features/achievements/storage';
import { SEED_ACHIEVEMENTS } from '@/features/achievements/mock';
import { emptyFilters } from '@/features/achievements/types';
import type {
  Achievement,
  AchievementCollection,
  AchievementUiState,
} from '@/features/achievements/types';

function baseItem(overrides: Partial<Achievement> = {}): Achievement {
  return {
    ...SEED_ACHIEVEMENTS[0]!,
    ...overrides,
  };
}

function col(overrides: Partial<AchievementCollection> = {}): AchievementCollection {
  return {
    id: 'col-test',
    name: '测试集合',
    description: '说明',
    color: '#6366f1',
    achievementIds: ['ac-1'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('achievement storage（版本化信封与迁移）', () => {
  it('normalizeStorage：旧版纯数组迁移为 v2 信封（补齐集合/筛选方案）', () => {
    const data = normalizeStorage(SEED_ACHIEVEMENTS.slice(0, 3));
    expect(data).not.toBeNull();
    expect(data!.version).toBe(STORAGE_VERSION);
    expect(data!.items).toHaveLength(3);
    expect(data!.seq).toBeGreaterThanOrEqual(3);
    expect(data!.collections).toEqual([]);
    expect(data!.savedFilters).toEqual([]);
    expect(data!.collectionSeq).toBeGreaterThanOrEqual(0);
  });

  it('normalizeStorage：v1 信封（仅 items）自动补齐 v2 字段', () => {
    const legacy = [{ id: 'l1', type: 'project', title: '旧条目', completedAt: '2026-01-02' }];
    const data = normalizeStorage({ version: 1, seq: 10, items: legacy });
    expect(data).not.toBeNull();
    expect(data!.version).toBe(STORAGE_VERSION);
    expect(data!.items).toHaveLength(1);
    expect(data!.collections).toEqual([]);
    // 旧条目补 relations / reuse 默认值
    expect(data!.items[0]!.relations).toEqual({
      projectIds: [],
      workflowIds: [],
      predecessorIds: [],
      derivedIds: [],
    });
    expect(data!.items[0]!.reuse.checklist).toEqual([]);
  });

  it('normalizeStorage：v2 信封原样通过，seq 缺失时回退', () => {
    const data = normalizeStorage({ version: 2, items: SEED_ACHIEVEMENTS.slice(0, 2) });
    expect(data!.seq).toBe(2);
    expect(data!.collections).toEqual([]);
  });

  it('normalizeStorage：未来版本拒绝加载', () => {
    expect(normalizeStorage({ version: 999, items: [] })).toBeNull();
  });

  it('normalizeStorage：非对象/非数组返回 null', () => {
    expect(normalizeStorage('oops')).toBeNull();
    expect(normalizeStorage(42)).toBeNull();
    expect(normalizeStorage(null)).toBeNull();
  });

  it('loadAchievementStorage：损坏 JSON 返回 null，合法数据返回信封', () => {
    localStorage.clear();
    expect(loadAchievementStorage()).toBeNull();

    localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, '{broken');
    expect(loadAchievementStorage()).toBeNull();

    localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(SEED_ACHIEVEMENTS.slice(0, 1)));
    const data = loadAchievementStorage();
    expect(data!.items).toHaveLength(1);
  });

  it('sanitizeItem：字段缺失补默认值，非法链接置空，非法日期丢弃', () => {
    const ok = sanitizeItem({ id: 'x1', type: 'code', title: 'T', completedAt: '2026-01-02' }, 0);
    expect(ok).not.toBeNull();
    expect(ok!.title).toBe('T');
    expect(ok!.summary).toBe('');
    expect(ok!.pinned).toBe(false);
    expect(ok!.link).toBeUndefined();
    expect(ok!.relations).toEqual({
      projectIds: [],
      workflowIds: [],
      predecessorIds: [],
      derivedIds: [],
    });

    const withLink = sanitizeItem({ ...ok, link: 'javascript:alert(1)' }, 0);
    expect(withLink!.link).toBeUndefined();

    const badDate = sanitizeItem({ id: 'x2', type: 'code', completedAt: '2026-02-30' }, 0);
    expect(badDate).toBeNull();

    const unknownType = sanitizeItem({ id: 'x3', type: 'hack', completedAt: '2026-01-02' }, 0);
    expect(unknownType).toBeNull();
  });

  it('sanitizeItem：关系与复用包清洗（去重、非法链接丢弃、文本截断）', () => {
    const item = sanitizeItem(
      {
        id: 'x4',
        type: 'project',
        title: 'T',
        completedAt: '2026-01-02',
        relations: {
          projectIds: ['p-1', 'p-1', '  ', 42],
          workflowIds: ['wf-1'],
          predecessorIds: ['ac-1'],
          derivedIds: ['ac-2'],
        },
        reuse: {
          links: [
            { label: '文档', url: 'https://example.com' },
            { label: '坏链接', url: 'javascript:alert(1)' },
            { label: '', url: 'https://example.com/2' },
          ],
          usageGuide: '指南',
          checklist: ['一项', '一项', '  '],
          retrospective: '复盘',
          templateSnippet: 'code',
        },
      },
      0,
    )!;
    expect(item.relations.projectIds).toEqual(['p-1']);
    expect(item.relations.workflowIds).toEqual(['wf-1']);
    expect(item.reuse.links).toEqual([{ label: '文档', url: 'https://example.com' }]);
    expect(item.reuse.checklist).toEqual(['一项']);
    expect(item.reuse.usageGuide).toBe('指南');
  });

  it('sanitizeCollection：名称缺失丢弃，非法封面色回退默认，id 去重', () => {
    expect(sanitizeCollection({ name: '', color: '#zzz' }, 0)).toBeNull();
    const ok = sanitizeCollection(
      { name: ' 精选 ', color: 'javascript:x', achievementIds: ['a', 'a', 'b'] },
      0,
    )!;
    expect(ok.name).toBe('精选');
    expect(ok.color).toBe('#6366f1');
    expect(ok.achievementIds).toEqual(['a', 'b']);
    expect(ok.id).toBe('imported-col-1');
  });

  it('sanitizeSavedFilter：名称缺失丢弃，筛选字段清洗', () => {
    expect(sanitizeSavedFilter({ name: '' }, 0)).toBeNull();
    const ok = sanitizeSavedFilter(
      {
        name: ' 我的方案 ',
        filters: { keyword: 'vue', year: 2026, month: 7, titleQuery: '发布' },
      },
      0,
    )!;
    expect(ok.name).toBe('我的方案');
    expect(ok.filters.keyword).toBe('vue');
    expect(ok.filters.year).toBe(2026);
    expect(ok.filters.month).toBe(7);
    expect(ok.filters.titleQuery).toBe('发布');
    expect(ok.filters.types).toEqual([]);
  });
});

describe('achievement storage（UI 状态清洗）', () => {
  it('sanitizeUiState：非法字段回退默认，合法字段保留', () => {
    const good: AchievementUiState = {
      view: 'list',
      filters: {
        keyword: 'vue',
        types: ['project'],
        year: 2026,
        month: 8,
        tags: ['vue'],
        archived: 'all',
        sort: 'updated',
        titleQuery: '发布',
        descQuery: '',
        projectQuery: 'Personal OS',
      },
    };
    expect(sanitizeUiState(good)).toEqual(good);

    const bad = sanitizeUiState({
      view: 'hack',
      filters: { year: 'x', month: 13, types: ['nope'] },
    });
    expect(bad.view).toBe('card');
    expect(bad.filters).toEqual(emptyFilters());
  });

  it('loadUiState：无数据/损坏时回退默认', () => {
    localStorage.clear();
    expect(loadUiState()).toEqual({ view: 'card', filters: emptyFilters() });

    localStorage.setItem(ACHIEVEMENT_UI_STORAGE_KEY, 'not json');
    expect(loadUiState()).toEqual({ view: 'card', filters: emptyFilters() });
  });
});

describe('achievement storage（导入导出与合并）', () => {
  it('parseImport：非法 JSON / 结构错误 / 版本过新均报错', () => {
    expect(parseImport('{oops').ok).toBe(false);
    expect(parseImport('{"foo":1}').ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 99, items: [] })).ok).toBe(false);
    expect(parseImport(JSON.stringify({ version: 2, items: [] })).ok).toBe(true);
  });

  it('parseImport：旧版本文件（v1/纯数组）允许导入并升级清洗', () => {
    const res = parseImport(JSON.stringify({ version: 1, items: [baseItem({ id: 'old-1' })] }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.items.map((a) => a.id)).toEqual(['old-1']);
      expect(res.payload.collections).toEqual([]);
    }
    const arr = parseImport(JSON.stringify([baseItem({ id: 'arr-1' })]));
    expect(arr.ok).toBe(true);
  });

  it('parseImport：清洗并统计跳过数，解析集合', () => {
    const raw = {
      version: 2,
      items: [baseItem({ id: 'imp-1' }), baseItem({ id: 'imp-2', completedAt: 'bad-date' })],
      collections: [col({ id: 'imp-col' })],
    };
    const res = parseImport(JSON.stringify(raw));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.payload.items.map((a) => a.id)).toEqual(['imp-1']);
      expect(res.dropped).toBe(1);
      expect(res.payload.collections).toEqual([expect.objectContaining({ id: 'imp-col' })]);
    }
  });

  it('buildExport：包含版本号与应用标识，可回读 items 与 collections', () => {
    const json = buildExport({
      version: STORAGE_VERSION,
      exportedAt: '2026-01-01T00:00:00.000Z',
      app: 'personal-os-achievements',
      items: SEED_ACHIEVEMENTS.slice(0, 2),
      collections: [col()],
    });
    const parsed = JSON.parse(json) as {
      version: number;
      items: Achievement[];
      collections: AchievementCollection[];
    };
    expect(parsed.version).toBe(STORAGE_VERSION);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.collections).toHaveLength(1);
  });

  it('mergeImport：overwrite 同 id 覆盖、新 id 追加；集合同策略', () => {
    const current = [baseItem({ id: 'a' }), baseItem({ id: 'b' })];
    const currentCols = [col({ id: 'c1' })];
    const incoming = {
      items: [baseItem({ id: 'a', title: '覆盖' }), baseItem({ id: 'c', title: '新增' })],
      collections: [col({ id: 'c1', name: '覆盖后的集合' }), col({ id: 'c2' })],
    };

    const merged = mergeImport(current, currentCols, incoming, 'overwrite');
    expect(merged.added).toBe(1);
    expect(merged.replaced).toBe(1);
    expect(merged.items.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(merged.items[0]!.title).toBe('覆盖');
    expect(merged.items[0]!.createdAt).toBe(current[0]!.createdAt); // 保留创建时间
    expect(merged.items[1]!.title).toBe(current[1]!.title); // 未被覆盖
    expect(merged.collectionReplaced).toBe(1);
    expect(merged.collectionAdded).toBe(1);
    expect(merged.collections.find((c) => c.id === 'c1')!.name).toBe('覆盖后的集合');
    expect(merged.collections.find((c) => c.id === 'c1')!.createdAt).toBe(
      '2026-01-01T00:00:00.000Z',
    );
    // 入参不可变
    expect(current).toHaveLength(2);
    expect(currentCols).toHaveLength(1);
  });

  it('mergeImport：skip 保留现有、丢弃冲突；copy 分配新 id 并重映射集合引用', () => {
    const current = [baseItem({ id: 'a', title: '现有' })];
    const currentCols = [col({ id: 'col-1', achievementIds: ['a'] })];
    const incoming = {
      items: [baseItem({ id: 'a', title: '导入的 A' }), baseItem({ id: 'b', title: 'B' })],
      collections: [col({ id: 'col-1', achievementIds: ['a', 'b'] })],
    };
    let counter = 0;
    const idFactory = () => {
      counter += 1;
      return `new-${counter}`;
    };

    const skipped = mergeImport(current, currentCols, incoming, 'skip', idFactory);
    expect(skipped.skipped).toBe(1);
    expect(skipped.added).toBe(1);
    expect(skipped.items.map((a) => a.id)).toEqual(['a', 'b']);
    expect(skipped.items[0]!.title).toBe('现有');
    expect(skipped.collectionSkipped).toBe(1);
    expect(skipped.collections.find((c) => c.id === 'col-1')!.achievementIds).toEqual(['a']); // 现有集合保留

    const copied = mergeImport(current, [], incoming, 'copy', idFactory);
    expect(copied.copied).toBe(1);
    expect(copied.added).toBe(1);
    const newA = copied.items.find((x) => x.id === 'new-1')!;
    expect(newA.title).toBe('导入的 A');
    expect(copied.items.find((x) => x.id === 'a')!.title).toBe('现有');
    // 集合引用重映射：a → new-1，b 保持
    expect(copied.collections[0]!.achievementIds).toEqual(['new-1', 'b']);
  });
});
