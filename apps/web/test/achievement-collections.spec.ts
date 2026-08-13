import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { ACHIEVEMENT_STORAGE_KEY, useAchievementStore } from '@/features/achievements/store';
import AchievementCollections from '@/features/achievements/achievement-collections.vue';
import { SEED_ACHIEVEMENTS, seedCollections } from '@/features/achievements/mock';
import type {
  Achievement,
  AchievementCollection,
  CollectionDraft,
} from '@/features/achievements/types';
import type { AchievementStorageData } from '@/features/achievements/storage';

function readStorage(): AchievementStorageData {
  return JSON.parse(localStorage.getItem(ACHIEVEMENT_STORAGE_KEY)!) as AchievementStorageData;
}

function draft(overrides: Partial<CollectionDraft> = {}): CollectionDraft {
  return { name: '我的集合', description: '说明', color: '#10b981', ...overrides };
}

function makeItem(overrides: Partial<Achievement> & { id: string }): Achievement {
  return {
    type: 'project',
    title: '成果',
    summary: '',
    description: '',
    tags: [],
    completedAt: '2026-08-01',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('achievement collections（Store：CRUD / 排序 / 引用完整性）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('创建集合：id 递增、空成员、默认未聚焦，并持久化', () => {
    const store = useAchievementStore();
    const before = store.collections.length;
    const col = store.addCollection(draft({ name: '新集合' }));

    expect(col.id).toMatch(/^col-\d+$/);
    expect(col.name).toBe('新集合');
    expect(col.achievementIds).toEqual([]);
    expect(store.collections).toHaveLength(before + 1);
    expect(readStorage().collections).toHaveLength(before + 1);
  });

  it('编辑集合：名称/说明/封面色更新并刷新 updatedAt', () => {
    const store = useAchievementStore();
    const col = store.addCollection(draft());
    const before = col.updatedAt;

    store.updateCollection(col.id, { name: '改名', description: '新说明', color: '#f43f5e' });
    const updated = store.getCollection(col.id)!;
    expect(updated.name).toBe('改名');
    expect(updated.color).toBe('#f43f5e');
    expect(updated.updatedAt >= before).toBe(true);
  });

  it('成员管理：添加去重、移除、手动排序（上移/下移）', () => {
    const store = useAchievementStore();
    store.batchDelete(store.achievements.map((a) => a.id));
    const a = store.add(makeItem({ id: 'ac-1', title: 'A' }) as never);
    const b = store.add(makeItem({ id: 'ac-2', title: 'B' }) as never);
    const c = store.add(makeItem({ id: 'ac-3', title: 'C' }) as never);
    const col = store.addCollection(draft());

    store.addToCollection(col.id, [a.id, b.id, c.id]);
    store.addToCollection(col.id, [a.id]); // 重复添加被去重
    expect(store.getCollection(col.id)!.achievementIds).toEqual([a.id, b.id, c.id]);

    store.moveCollectionItem(col.id, c.id, -1); // C 上移
    expect(store.getCollection(col.id)!.achievementIds).toEqual([a.id, c.id, b.id]);
    store.moveCollectionItem(col.id, a.id, -1); // A 已在首位，不动
    expect(store.getCollection(col.id)!.achievementIds).toEqual([a.id, c.id, b.id]);
    store.moveCollectionItem(col.id, b.id, 1); // B 已在末位，不动
    expect(store.getCollection(col.id)!.achievementIds).toEqual([a.id, c.id, b.id]);

    store.removeFromCollection(col.id, c.id);
    expect(store.getCollection(col.id)!.achievementIds).toEqual([a.id, b.id]);
  });

  it('引用完整性：删除成果时从所有集合移除，集合保留', () => {
    const store = useAchievementStore();
    const target = store.achievements[0]!;
    const other = store.achievements[1]!;
    const col = store.addCollection(draft());
    store.addToCollection(col.id, [target.id, other.id]);

    store.remove(target.id);

    expect(store.get(target.id)).toBeNull();
    expect(store.getCollection(col.id)).not.toBeNull(); // 集合本身保留
    expect(store.getCollection(col.id)!.achievementIds).not.toContain(target.id);
    expect(store.getCollection(col.id)!.achievementIds).toContain(other.id);
    expect(readStorage().collections[0]!.achievementIds).not.toContain(target.id);
  });

  it('批量删除同样清理集合引用', () => {
    const store = useAchievementStore();
    const ids = store.achievements.slice(0, 3).map((a) => a.id);
    const col = store.addCollection(draft());
    store.addToCollection(col.id, ids);

    store.batchDelete(ids);
    expect(store.getCollection(col.id)!.achievementIds).toEqual([]);
  });

  it('删除集合：集合移除并清理聚焦态，成果不受影响', () => {
    const store = useAchievementStore();
    const col = store.addCollection(draft());
    const itemCount = store.achievements.length;

    store.setActiveCollection(col.id);
    store.removeCollection(col.id);

    expect(store.getCollection(col.id)).toBeNull();
    expect(store.activeCollectionId).toBeNull();
    expect(store.achievements).toHaveLength(itemCount);
  });

  it('聚焦集合导航态：设置 / 清除（不持久化，刷新恢复为 null）', () => {
    const store = useAchievementStore();
    const col = store.addCollection(draft());

    store.setActiveCollection(col.id);
    expect(store.activeCollectionId).toBe(col.id);

    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    expect(reloaded.activeCollectionId).toBeNull();
  });

  it('集合持久化：刷新后完整恢复', () => {
    const store = useAchievementStore();
    const col = store.addCollection(draft({ name: '要恢复的集合' }));
    store.addToCollection(col.id, [store.achievements[0]!.id]);
    store.updateCollection(col.id, { color: '#0ea5e9' });

    setActivePinia(createPinia());
    const reloaded = useAchievementStore();
    const restored = reloaded.getCollection(col.id)!;
    expect(restored.name).toBe('要恢复的集合');
    expect(restored.color).toBe('#0ea5e9');
    expect(restored.achievementIds).toEqual([SEED_ACHIEVEMENTS[0]!.id]);
  });

  it('首次播种：种子集合引用有效的种子成果（引用完整性）', () => {
    const store = useAchievementStore();
    const idSet = new Set(store.achievements.map((a) => a.id));
    for (const c of store.collections) {
      for (const id of c.achievementIds) expect(idSet.has(id)).toBe(true);
    }
    expect(store.collections.length).toBeGreaterThan(0);
    expect(seedCollections(SEED_ACHIEVEMENTS).length).toBeGreaterThan(0);
  });
});

describe('achievement collections（组件渲染与事件）', () => {
  function colItem(overrides: Partial<AchievementCollection> = {}): AchievementCollection {
    return {
      id: 'col-1',
      name: '示例集合',
      description: '说明',
      color: '#6366f1',
      achievementIds: ['ac-1'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('空态：无集合时显示引导文案与新建按钮', () => {
    const wrapper = mount(AchievementCollections, {
      props: { collections: [], items: [], activeCollectionId: null },
    });
    expect(wrapper.text()).toContain('还没有集合');
    expect(wrapper.find('button').text()).toContain('新建集合');
    wrapper.unmount();
  });

  it('卡片：展示名称/说明/数量/成员预览；点击查看派发 open', async () => {
    const items = [makeItem({ id: 'ac-1', title: '成员成果' })];
    const wrapper = mount(AchievementCollections, {
      props: { collections: [colItem()], items, activeCollectionId: null },
    });
    expect(wrapper.text()).toContain('示例集合');
    expect(wrapper.text()).toContain('1 项');
    expect(wrapper.text()).toContain('成员成果');

    const buttons = wrapper.findAll('button');
    const viewBtn = buttons.find((b) => b.text().includes('查看'))!;
    await viewBtn.trigger('click');
    expect(wrapper.emitted('open')![0]).toEqual(['col-1']);
    wrapper.unmount();
  });

  it('失效引用：集合引用不存在的成果时显示失效提示', () => {
    const wrapper = mount(AchievementCollections, {
      props: {
        collections: [colItem({ achievementIds: ['ac-ghost', 'ac-1'] })],
        items: [makeItem({ id: 'ac-1' })],
        activeCollectionId: null,
      },
    });
    expect(wrapper.text()).toContain('含 1 个失效引用');
    wrapper.unmount();
  });

  it('创建弹窗：填名称与封面色后派发 create', async () => {
    const wrapper = mount(AchievementCollections, {
      props: { collections: [], items: [], activeCollectionId: null },
    });
    await wrapper.find('button').trigger('click'); // 新建集合
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const input = dialog.querySelector('input[type="text"]') as HTMLInputElement;
    input.value = '精选';
    await input.dispatchEvent(new Event('input'));
    const submit = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('创建集合'),
    ) as HTMLButtonElement;
    submit.click();
    expect(wrapper.emitted('create')![0]![0]).toMatchObject({ name: '精选' });
    wrapper.unmount();
    document.body.innerHTML = '';
  });

  it('删除：两段式确认后派发 remove', async () => {
    const wrapper = mount(AchievementCollections, {
      props: { collections: [colItem()], items: [], activeCollectionId: null },
    });
    const del = wrapper.findAll('button').find((b) => b.text().includes('删除'))!;
    await del.trigger('click');
    await del.trigger('click');
    expect(wrapper.emitted('remove')![0]).toEqual(['col-1']);
    wrapper.unmount();
  });
});
