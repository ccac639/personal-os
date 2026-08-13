import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  ACHIEVEMENT_STORAGE_KEY,
  ACHIEVEMENT_UI_STORAGE_KEY,
  useAchievementStore,
} from '@/features/achievements/store';
import { SEED_ACHIEVEMENTS } from '@/features/achievements/mock';
import { sortAchievements } from '@/features/achievements/filters';
import type { AchievementDraft } from '@/features/achievements/types';
import type { AchievementStorageData } from '@/features/achievements/storage';

function draft(overrides: Partial<AchievementDraft> = {}): AchievementDraft {
  return {
    type: 'project',
    title: '测试成果',
    summary: '摘要',
    description: '描述',
    tags: ['vue'],
    completedAt: '2026-08-13',
    metrics: [{ label: '指标', value: '1' }],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    ...overrides,
  };
}

function readStorage(): AchievementStorageData {
  return JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY)!) as AchievementStorageData;
}

describe('achievement store（持久化与增删改）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('首次加载：localStorage 为空时播种示例数据', () => {
    const store = useAchievementStore();
    expect(store.achievements.length).toBe(SEED_ACHIEVEMENTS.length);
    expect(store.achievements.some((a) => a.pinned)).toBe(true);
    expect(store.achievements.some((a) => a.archived)).toBe(true);
  });

  it('新增：置于列表首位，默认未置顶未归档，并写入 localStorage', () => {
    const store = useAchievementStore();
    const before = store.achievements.length;
    const created = store.add(draft({ title: '新成果' }));

    expect(store.achievements).toHaveLength(before + 1);
    expect(store.achievements[0]!.id).toBe(created.id);
    expect(created.pinned).toBe(false);
    expect(created.archived).toBe(false);
    expect(created.completedAt).toBe('2026-08-13');

    const raw = localStorage.getItem(ACHIEVEMENT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const data = readStorage();
    expect(data.version).toBe(2);
    expect(data.items).toHaveLength(before + 1);
  });

  it('编辑：更新字段并刷新 updatedAt', () => {
    const store = useAchievementStore();
    const created = store.add(draft());
    const before = created.updatedAt;

    store.update(created.id, { title: '改后标题', tags: ['vue', 'pinia'] });

    const updated = store.get(created.id)!;
    expect(updated.title).toBe('改后标题');
    expect(updated.tags).toEqual(['vue', 'pinia']);
    expect(updated.updatedAt >= before).toBe(true);
    // 未改字段保留
    expect(updated.summary).toBe('摘要');
  });

  it('删除：从列表移除且不影响其他条目', () => {
    const store = useAchievementStore();
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));

    store.remove(a.id);
    expect(store.get(a.id)).toBeNull();
    expect(store.get(b.id)!.title).toBe('B');
  });

  it('置顶与归档：切换状态并持久化', () => {
    const store = useAchievementStore();
    const created = store.add(draft());

    store.togglePin(created.id);
    expect(store.get(created.id)!.pinned).toBe(true);
    store.togglePin(created.id);
    expect(store.get(created.id)!.pinned).toBe(false);

    store.toggleArchive(created.id);
    expect(store.get(created.id)!.archived).toBe(true);

    const parsed = readStorage();
    expect(parsed.items.find((x) => x.id === created.id)!.archived).toBe(true);
  });

  it('持久化恢复：重新实例化 store 后数据完整恢复', () => {
    const store = useAchievementStore();
    const created = store.add(draft({ title: '要恢复的成果' }));
    store.togglePin(created.id);

    // 模拟页面刷新：新 pinia + 新 store 从 localStorage 恢复
    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.achievements).toHaveLength(SEED_ACHIEVEMENTS.length + 1);
    const restored = reloaded.get(created.id)!;
    expect(restored.title).toBe('要恢复的成果');
    expect(restored.pinned).toBe(true);
  });

  it('损坏数据：localStorage 内容非法时回退到种子数据', () => {
    localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, '{broken json');
    const store = useAchievementStore();
    expect(store.achievements.length).toBe(SEED_ACHIEVEMENTS.length);
  });
});

describe('achievement store（批量操作与手动排序）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('批量置顶/归档/删除：只影响目标条目并同步持久化', () => {
    const store = useAchievementStore();
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));
    const c = store.add(draft({ title: 'C' }));

    store.batchSetPinned([a.id, b.id], true);
    expect(store.get(a.id)!.pinned).toBe(true);
    expect(store.get(b.id)!.pinned).toBe(true);
    expect(store.get(c.id)!.pinned).toBe(false);

    store.batchSetArchived([b.id, c.id], true);
    expect(store.get(b.id)!.archived).toBe(true);
    expect(store.get(c.id)!.archived).toBe(true);
    expect(store.get(a.id)!.archived).toBe(false);

    store.batchDelete([b.id]);
    expect(store.get(b.id)).toBeNull();
    expect(store.achievements).toHaveLength(SEED_ACHIEVEMENTS.length + 2);

    const parsed = readStorage();
    expect(parsed.items.map((x) => x.id)).not.toContain(b.id);
  });

  it('批量删除后清理选中态，且 store 与 localStorage 一致', () => {
    const store = useAchievementStore();
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));
    store.setSelection([a.id, b.id]);

    store.batchDelete([a.id, b.id]);
    expect(store.selectedIds).toEqual([]);
    expect(readStorage().items).toHaveLength(store.achievements.length);
  });

  it('手动排序：上移/下移交换顺序，不跨越置顶边界', () => {
    const store = useAchievementStore();
    // 清空种子数据，得到干净的三条目场景（种子含置顶条目会干扰边界推演）
    store.batchDelete(store.achievements.map((x) => x.id));
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));
    const c = store.add(draft({ title: 'C' }));
    const seq = () => sortAchievements(store.achievements, 'manual').map((x) => x.id);

    // 新条目 order 递增：A, B, C
    expect(seq()).toEqual([a.id, b.id, c.id]);

    store.move(c.id, -1); // C 上移一位：与 B 交换
    expect(seq()).toEqual([a.id, c.id, b.id]);

    store.move(c.id, -1); // C 再上移：与 A 交换
    expect(seq()).toEqual([c.id, a.id, b.id]);

    store.move(c.id, -1); // C 已在序列首位，不动
    expect(seq()).toEqual([c.id, a.id, b.id]);

    store.move(b.id, -1); // B 上移：与 A 交换
    expect(seq()).toEqual([c.id, b.id, a.id]);

    // 置顶边界：A 置顶后位于最前，B 可超过 C（同组）但不能越过 A
    store.togglePin(a.id);
    store.move(b.id, -1); // B 超过 C
    expect(seq()).toEqual([a.id, b.id, c.id]);
    store.move(b.id, -1); // 试图越过置顶 A → 被阻止
    expect(seq()).toEqual([a.id, b.id, c.id]);
  });

  it('批量选择：toggle/全选/清空', () => {
    const store = useAchievementStore();
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));

    store.toggleSelect(a.id);
    store.toggleSelect(b.id);
    expect(store.selectedIds).toHaveLength(2);

    store.toggleSelect(a.id);
    expect(store.selectedIds).toEqual([b.id]);

    store.setSelection([a.id, b.id]);
    expect(store.selectedIds).toHaveLength(2);

    store.clearSelection();
    expect(store.selectedIds).toEqual([]);
  });
});

describe('achievement store（UI 偏好持久化）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('视图/筛选/排序变更后持久化，刷新恢复', () => {
    const store = useAchievementStore();
    store.setView('timeline');
    store.setFilters({
      keyword: 'vue',
      types: ['project'],
      year: 2026,
      month: 7,
      tags: ['vue'],
      archived: 'all',
      sort: 'title',
      titleQuery: '发布',
      descQuery: '',
      projectQuery: '',
    });

    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.ui.view).toBe('timeline');
    expect(reloaded.ui.filters.keyword).toBe('vue');
    expect(reloaded.ui.filters.sort).toBe('title');
    expect(reloaded.ui.filters.year).toBe(2026);
    expect(reloaded.ui.filters.month).toBe(7);
    expect(reloaded.ui.filters.archived).toBe('all');
    expect(reloaded.ui.filters.titleQuery).toBe('发布');
  });

  it('UI 存储损坏时回退默认值，不影响成果数据', () => {
    const store = useAchievementStore();
    const total = store.achievements.length;
    localStorage.setItem(ACHIEVEMENT_UI_STORAGE_KEY, '{bad');

    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.ui.view).toBe('card');
    expect(reloaded.ui.filters).toEqual({
      keyword: '',
      types: [],
      year: null,
      month: null,
      tags: [],
      archived: 'active',
      sort: 'date-desc',
      titleQuery: '',
      descQuery: '',
      projectQuery: '',
    });
    expect(reloaded.achievements).toHaveLength(total);
  });

  it('非法 UI 字段（未知视图/类型/月份无年份）被清洗回退', () => {
    localStorage.setItem(
      ACHIEVEMENT_UI_STORAGE_KEY,
      JSON.stringify({
        version: 2,
        view: 'nope',
        filters: {
          keyword: 42,
          types: ['project', 'ghost-type'],
          year: null,
          month: 7,
          tags: 'oops',
          archived: 'weird',
          sort: 'unknown',
          titleQuery: 12,
          descQuery: 'ok',
          projectQuery: '',
        },
      }),
    );
    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.ui.view).toBe('card');
    expect(reloaded.ui.filters.keyword).toBe('');
    expect(reloaded.ui.filters.types).toEqual(['project']);
    expect(reloaded.ui.filters.month).toBeNull();
    expect(reloaded.ui.filters.tags).toEqual([]);
    expect(reloaded.ui.filters.archived).toBe('active');
    expect(reloaded.ui.filters.sort).toBe('date-desc');
    expect(reloaded.ui.filters.titleQuery).toBe('');
    expect(reloaded.ui.filters.descQuery).toBe('ok');
  });
});

describe('achievement store（数据迁移与可靠性）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('旧版本（纯数组）自动迁移为 v2 信封', () => {
    const legacy = SEED_ACHIEVEMENTS.slice(0, 2).map((a) => ({ ...a }));
    localStorage.setItem(ACHIEVEMENT_STORAGE_KEY, JSON.stringify(legacy));

    const store = useAchievementStore();
    expect(store.achievements).toHaveLength(2);
    const raw = localStorage.getItem(ACHIEVEMENT_STORAGE_KEY)!;
    const parsed = JSON.parse(raw) as AchievementStorageData;
    expect(parsed.version).toBe(2);
    expect(parsed.items).toHaveLength(2);
    expect(parsed.collections).toEqual([]);
  });

  it('未来版本：拒绝加载，回退种子数据', () => {
    localStorage.setItem(
      ACHIEVEMENT_STORAGE_KEY,
      JSON.stringify({ version: 999, seq: 10, items: SEED_ACHIEVEMENTS.slice(0, 2) }),
    );
    const store = useAchievementStore();
    expect(store.achievements.length).toBe(SEED_ACHIEVEMENTS.length);
  });

  it('清洗：非法日期/未知类型条目被丢弃，重复 ID 去重', () => {
    const good = { ...SEED_ACHIEVEMENTS[0]!, id: 'dup' };
    const badDate = { ...SEED_ACHIEVEMENTS[0]!, id: 'bad-date', completedAt: '2026-13-99' };
    const badType = { ...SEED_ACHIEVEMENTS[0]!, id: 'bad-type', type: 'unknown' as never };
    localStorage.setItem(
      ACHIEVEMENT_STORAGE_KEY,
      JSON.stringify({ version: 1, seq: 10, items: [good, { ...good }, badDate, badType] }),
    );
    const store = useAchievementStore();
    expect(store.achievements).toHaveLength(1);
    expect(store.achievements[0]!.id).toBe('dup');
  });

  it('写入失败：保留内存状态并置 persistError', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      const store = useAchievementStore();
      const before = store.achievements.length;
      const created = store.add(draft({ title: '写不进去的成果' }));
      expect(store.achievements).toHaveLength(before + 1); // 内存保留
      expect(store.get(created.id)).not.toBeNull();
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
    store.add(draft({ title: 'X' }));
    expect(store.persistError).toBe(true);
    spy.mockRestore();

    store.add(draft({ title: 'Y' }));
    expect(store.persistError).toBe(false);
  });
});

describe('achievement store（导入导出）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('导出：全库包含版本号与 items/collections，可重新导入', () => {
    const store = useAchievementStore();
    const json = store.exportJson('all');
    const parsed = JSON.parse(json) as AchievementStorageData;
    expect(parsed.version).toBe(2);
    expect(parsed.items).toHaveLength(store.achievements.length);
    expect(parsed.collections).toHaveLength(store.collections.length);
  });

  it('导出作用域：单项只含目标成果；集合含集合与其引用成果', () => {
    const store = useAchievementStore();
    const first = store.achievements[0]!;
    const single = JSON.parse(store.exportJson('single', first.id)) as AchievementStorageData;
    expect(single.items).toHaveLength(1);
    expect(single.items[0]!.id).toBe(first.id);
    expect(single.collections).toEqual([]);

    const col = store.collections[0]!;
    const bundle = JSON.parse(store.exportJson('collection', col.id)) as AchievementStorageData;
    expect(bundle.collections).toHaveLength(1);
    expect(bundle.collections[0]!.id).toBe(col.id);
    expect(bundle.items.map((a) => a.id)).toEqual(col.achievementIds);
  });

  it('overwrite 导入：同 id 覆盖、新 id 追加；集合同步，store 与 localStorage 一致', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const incoming = {
      items: [
        { ...existing, title: '覆盖后的标题' },
        { ...SEED_ACHIEVEMENTS[1]!, id: 'brand-new', title: '新导入条目' },
      ],
      collections: [{ ...store.collections[0]!, name: '导入的集合' }],
    };
    const outcome = store.importItems(incoming, 'overwrite');

    expect(outcome.added).toBe(1);
    expect(outcome.replaced).toBe(1);
    expect(store.get(existing.id)!.title).toBe('覆盖后的标题');
    expect(store.get('brand-new')!.title).toBe('新导入条目');
    expect(store.achievements.length).toBe(SEED_ACHIEVEMENTS.length + 1);
    expect(store.collections[0]!.name).toBe('导入的集合');
    expect(readStorage().items.length).toBe(store.achievements.length);
    expect(readStorage().collections.length).toBe(store.collections.length);
  });

  it('skip 导入：冲突条目保留现有，仅新增全新条目', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const incoming = {
      items: [
        { ...existing, title: '不该生效' },
        { ...SEED_ACHIEVEMENTS[1]!, id: 'only-new', title: '全新条目' },
      ],
      collections: [],
    };
    const outcome = store.importItems(incoming, 'skip');

    expect(outcome.skipped).toBe(1);
    expect(outcome.added).toBe(1);
    expect(store.get(existing.id)!.title).not.toBe('不该生效');
    expect(store.get('only-new')).not.toBeNull();
  });

  it('copy 导入：冲突条目复制为新 id，选中态与失效 id 清理', () => {
    const store = useAchievementStore();
    const existing = store.achievements[0]!;
    const incoming = {
      items: [{ ...existing, title: '复制品' }],
      collections: [],
    };
    store.setSelection([existing.id, 'ghost-id']);
    const before = store.seq;

    const outcome = store.importItems(incoming, 'copy');
    expect(outcome.copied).toBe(1);
    const copies = store.achievements.filter((a) => a.title === '复制品');
    expect(copies).toHaveLength(1);
    expect(copies[0]!.id).not.toBe(existing.id);
    expect(copies[0]!.id.startsWith('ac-')).toBe(true);
    expect(store.seq).toBeGreaterThan(before);
    expect(store.selectedIds).toEqual([existing.id]); // ghost-id 被清理
  });
});
