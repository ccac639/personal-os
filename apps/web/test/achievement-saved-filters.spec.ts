import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ACHIEVEMENT_STORAGE_KEY, useAchievementStore } from '@/features/achievements/store';
import { sanitizeSavedFilters, normalizeStorage } from '@/features/achievements/storage';
import { emptyFilters } from '@/features/achievements/types';
import type { AchievementFilters } from '@/features/achievements/types';
import type { AchievementStorageData } from '@/features/achievements/storage';

function readStorage(): AchievementStorageData {
  return JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY)!) as AchievementStorageData;
}

function filters(overrides: Partial<AchievementFilters> = {}): AchievementFilters {
  return { ...emptyFilters(), ...overrides };
}

describe('achievement saved filters（保存/恢复/删除筛选方案）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('保存方案：名称清洗、筛选快照独立、随信封持久化', () => {
    const store = useAchievementStore();
    const saved = store.saveFilter(
      '  Vue 成果 ',
      filters({ keyword: 'vue', types: ['project'], year: 2026 }),
    );

    expect(saved.name).toBe('Vue 成果');
    expect(saved.filters).toEqual(filters({ keyword: 'vue', types: ['project'], year: 2026 }));
    expect(store.savedFilters).toHaveLength(1);
    expect(readStorage().savedFilters).toHaveLength(1);
  });

  it('恢复方案：应用保存的筛选到当前 UI 并持久化', () => {
    const store = useAchievementStore();
    const saved = store.saveFilter(
      '重点筛选',
      filters({ keyword: '发布', archived: 'all', sort: 'title' }),
    );

    // 先改成别的筛选
    store.setFilters(filters({ keyword: '其他' }));
    expect(store.ui.filters.keyword).toBe('其他');

    store.setFilters({ ...saved.filters });
    expect(store.ui.filters.keyword).toBe('发布');
    expect(store.ui.filters.archived).toBe('all');
    expect(store.ui.filters.sort).toBe('title');

    // 刷新后方案仍可恢复
    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.savedFilters).toHaveLength(1);
    expect(reloaded.savedFilters[0]!.name).toBe('重点筛选');
  });

  it('删除方案：从 store 与 localStorage 移除，不影响当前筛选', () => {
    const store = useAchievementStore();
    const a = store.saveFilter('A', filters({ keyword: 'a' }));
    const b = store.saveFilter('B', filters({ keyword: 'b' }));
    store.setFilters(filters({ keyword: 'b' }));

    store.deleteSavedFilter(a.id);

    expect(store.savedFilters.map((s) => s.id)).toEqual([b.id]);
    expect(readStorage().savedFilters).toHaveLength(1);
    expect(store.ui.filters.keyword).toBe('b'); // 当前筛选不受影响
  });

  it('清洗：非法方案被丢弃（缺名称/坏筛选字段），合法方案字段回退', () => {
    const cleaned = sanitizeSavedFilters([
      { id: 's1', name: '合法', filters: { keyword: 'vue', year: 2026, month: 7, titleQuery: 42 } },
      { id: 's2', name: '  ', filters: {} },
      { id: 's3', name: '部分非法', filters: { year: 'x', types: ['ghost'] } },
    ]);
    expect(cleaned.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(cleaned[0]!.filters.keyword).toBe('vue');
    expect(cleaned[0]!.filters.month).toBe(7);
    expect(cleaned[0]!.filters.titleQuery).toBe(''); // 非字符串回退
    expect(cleaned[1]!.filters).toEqual(emptyFilters()); // 非法字段回退默认
  });

  it('信封迁移：旧 v1 数据不含 savedFilters，normalize 后补齐为空', () => {
    const data = normalizeStorage({ version: 1, seq: 3, items: [] });
    expect(data!.savedFilters).toEqual([]);
  });
});
