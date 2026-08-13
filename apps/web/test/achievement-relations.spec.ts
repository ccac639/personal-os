import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { useAchievementStore } from '@/features/achievements/store';
import AchievementDrawer from '@/features/achievements/achievement-drawer.vue';
import type { Achievement, AchievementDraft } from '@/features/achievements/types';

function draft(overrides: Partial<AchievementDraft> = {}): AchievementDraft {
  return {
    type: 'project',
    title: '关系测试',
    summary: '',
    description: '',
    tags: [],
    completedAt: '2026-08-13',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    ...overrides,
  };
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

describe('achievement relations（Store：关系更新与失效引用清理）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('更新关系：projectIds / workflowIds / 前置 / 衍生均持久化', () => {
    const store = useAchievementStore();
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));

    store.update(a.id, {
      relations: {
        projectIds: ['p-personal-os', 'p-blog'],
        workflowIds: ['wf-1'],
        predecessorIds: [b.id],
        derivedIds: [b.id],
      },
    });

    const updated = store.get(a.id)!;
    expect(updated.relations.projectIds).toEqual(['p-personal-os', 'p-blog']);
    expect(updated.relations.workflowIds).toEqual(['wf-1']);
    expect(updated.relations.predecessorIds).toEqual([b.id]);
    expect(updated.relations.derivedIds).toEqual([b.id]);
  });

  it('失效引用处理：删除成果后，其他成果对它的前置/衍生引用被清理', () => {
    const store = useAchievementStore();
    store.batchDelete(store.achievements.map((x) => x.id));
    const a = store.add(draft({ title: 'A' }));
    const b = store.add(draft({ title: 'B' }));
    const c = store.add(draft({ title: 'C' }));

    // A 前置 → B、衍生 → C；C 衍生 → A
    store.update(a.id, {
      relations: { projectIds: [], workflowIds: [], predecessorIds: [b.id], derivedIds: [c.id] },
    });
    store.update(c.id, {
      relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [a.id] },
    });

    store.remove(b.id);
    expect(store.get(a.id)!.relations.predecessorIds).toEqual([]); // b 被删 → 引用清理
    expect(store.get(a.id)!.relations.derivedIds).toEqual([c.id]); // c 未失效 → 保留
    expect(store.get(c.id)!.relations.derivedIds).toEqual([a.id]); // a 未失效 → 保留

    store.batchDelete([a.id]);
    expect(store.get(a.id)).toBeNull();
    expect(store.get(c.id)!.relations.derivedIds).toEqual([]); // a 被删 → 引用清理
  });

  it('删除成果不影响其关联项目/工作流 id（只读引用，不修改其他模块）', () => {
    const store = useAchievementStore();
    store.batchDelete(store.achievements.map((x) => x.id));
    const a = store.add(draft({ title: 'A' }));
    store.update(a.id, {
      relations: {
        projectIds: ['p-personal-os'],
        workflowIds: ['wf-1'],
        predecessorIds: [],
        derivedIds: [],
      },
    });

    store.remove(a.id);
    // 无残留关系条目；projects / workflows 模块不受影响（本模块不写它们）
    expect(store.achievements.length).toBe(0);
  });
});

describe('achievement relations（抽屉展示与失效标记）', () => {
  function makeDrawerItem(): Achievement {
    return {
      id: 'drawer-rel',
      type: 'project',
      title: '关系抽屉',
      summary: '',
      description: '',
      tags: [],
      completedAt: '2026-08-13',
      metrics: [],
      relations: {
        projectIds: ['p-personal-os', 'p-ghost'],
        workflowIds: ['wf-1'],
        predecessorIds: ['ac-prev'],
        derivedIds: ['ac-ghost-derive'],
      },
      reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
      pinned: false,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  let wrapper: ReturnType<typeof mount> | null = null;
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
  });

  it('渲染关联项目/工作流名称；失效引用显示删除线占位', async () => {
    const item = makeDrawerItem();
    wrapper = mount(AchievementDrawer, {
      props: {
        item,
        projectNameById: { 'p-personal-os': 'Personal OS 一体化系统' },
        workflowNameById: { 'wf-1': '每日审查' },
        itemsById: {},
      },
    });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Personal OS 一体化系统');
    expect(dialog.textContent).toContain('每日审查');
    expect(dialog.textContent).toContain('已失效');
  });

  it('前置/衍生成果可点击跳转；失效引用不派发事件', async () => {
    const item = makeDrawerItem();
    const prev = makeItem({ id: 'ac-prev', title: '前置成果标题' });
    wrapper = mount(AchievementDrawer, {
      props: {
        item,
        projectNameById: {},
        workflowNameById: {},
        itemsById: { 'ac-prev': prev },
      },
    });
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const buttons = Array.from(dialog.querySelectorAll('button'));
    const linked = buttons.filter((b) => b.textContent?.includes('前置：'));
    expect(linked.length).toBe(1);
    (linked[0] as HTMLButtonElement).click();
    expect(wrapper.emitted('open-linked')![0]).toEqual(['ac-prev']);
    expect(dialog.textContent).toContain('（已失效）'); // 衍生 ac-ghost-derive
    wrapper.unmount();
    wrapper = null;
    await nextTick();
  });
});
