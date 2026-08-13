import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AchievementToolbar from '@/features/achievements/achievement-toolbar.vue';
import AchievementCard from '@/features/achievements/achievement-card.vue';
import AchievementPage from '@/pages/achievements/index.vue';
import { emptyFilters } from '@/features/achievements/types';
import type {
  Achievement,
  AchievementFilters,
  AchievementView,
} from '@/features/achievements/types';

function filters(overrides: Partial<AchievementFilters> = {}): AchievementFilters {
  return { ...emptyFilters(), ...overrides };
}

function mountToolbar(overrides: Partial<AchievementFilters> = {}) {
  return mount(AchievementToolbar, {
    props: {
      filters: filters(overrides),
      years: [2026, 2025],
      months: [1, 7],
      tags: ['vue', '发布', '自动化'],
      view: 'card' as AchievementView,
      savedFilters: [],
      activeCollection: null,
    },
  });
}

function makeItem(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'ws-1',
    type: 'project',
    title: '工作区测试成果',
    summary: '摘要',
    description: '描述',
    tags: ['vue'],
    completedAt: '2026-08-13',
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

let wrapper: ReturnType<typeof mount> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('achievement workspace（筛选抽屉）', () => {
  it('点击筛选打开抽屉（Teleport 到 body；移动端底部抽屉、桌面端右侧抽屉）', async () => {
    wrapper = mountToolbar();
    await wrapper.find('button[aria-expanded]').trigger('click');
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"][aria-label="筛选成果"]');
    expect(dialog).not.toBeNull();
    const cls = (dialog as HTMLElement).className;
    // 移动端：贴底
    expect(cls).toContain('inset-x-0');
    expect(cls).toContain('bottom-0');
    // sm 断点起：右侧固定宽度抽屉
    expect(cls).toContain('sm:top-0');
    expect(cls).toContain('sm:right-0');
    expect(cls).toContain('sm:w-96');
  });

  it('抽屉内筛选类型派发 update:filters', async () => {
    wrapper = mountToolbar();
    await wrapper.find('button[aria-expanded]').trigger('click');
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const typeBtn = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('项目发布'),
    )!;
    (typeBtn as HTMLButtonElement).click();
    expect(wrapper.emitted('update:filters')![0]![0]).toMatchObject({ types: ['project'] });
  });

  it('抽屉内切换归档状态与清空筛选', async () => {
    wrapper = mountToolbar();
    await wrapper.find('button[aria-expanded]').trigger('click');
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const archived = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('已归档'),
    )!;
    (archived as HTMLButtonElement).click();
    expect(wrapper.emitted('update:filters')![0]![0]).toMatchObject({ archived: 'archived' });

    // 模拟父级 v-model 回写（测试中 props 静态，需手动同步）
    await wrapper.setProps({ filters: filters({ archived: 'archived' }) });
    await nextTick();
    const clear = Array.from(dialog.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('清空筛选'),
    )!;
    (clear as HTMLButtonElement).click();
    expect(wrapper.emitted('clear')).toBeTruthy();
  });

  it('Escape 关闭筛选抽屉', async () => {
    wrapper = mountToolbar();
    await wrapper.find('button[aria-expanded]').trigger('click');
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('achievement workspace（视图切换）', () => {
  it('工具栏提供 5 个视图（含概览/集合独立视图）并派发 update:view', async () => {
    wrapper = mountToolbar();
    const radios = wrapper.findAll('button[role="radio"]');
    expect(radios).toHaveLength(5);

    const cases: [string, AchievementView][] = [
      ['卡片', 'card'],
      ['列表', 'list'],
      ['时间线', 'timeline'],
      ['概览', 'overview'],
      ['集合', 'collections'],
    ];
    for (const [label, value] of cases) {
      const btn = radios.find((b) => b.attributes('title') === `${label}视图`)!;
      await btn.trigger('click');
      expect(wrapper.emitted('update:view')!.at(-1)![0]).toBe(value);
    }
  });
});

describe('achievement workspace（紧凑筛选条）', () => {
  it('有生效条件时显示紧凑筛选条；点击 chip 移除对应条件', async () => {
    wrapper = mountToolbar({ types: ['project'], year: 2026, tags: ['vue'] });
    expect(wrapper.text()).toContain('已筛选 3 项');
    expect(wrapper.text()).toContain('类型 1');
    expect(wrapper.text()).toContain('2026 年');
    expect(wrapper.text()).toContain('标签 1');

    const typeChip = wrapper.findAll('button').find((b) => b.text().includes('类型 1'))!;
    await typeChip.trigger('click');
    expect(wrapper.emitted('update:filters')!.at(-1)![0]).toMatchObject({ types: [] });
  });

  it('无生效条件时不渲染紧凑筛选条', () => {
    wrapper = mountToolbar();
    expect(wrapper.text()).not.toContain('已筛选');
  });

  it('手动排序模式下显示操作提示', () => {
    wrapper = mountToolbar({ sort: 'manual' });
    expect(wrapper.text()).toContain('手动排序模式');
  });
});

describe('achievement workspace（移动端布局）', () => {
  it('工具栏搜索框移动端全宽、视图标签小屏隐藏（不横向溢出）', async () => {
    wrapper = mountToolbar();
    const search = wrapper.find('input[aria-label="搜索成果"]');
    expect(search.classes()).toContain('w-full');
    // 断点约束在包裹层（移动端全宽 → sm 起限宽），input 本体无固定宽度
    expect(search.element.parentElement!.classList).toContain('sm:max-w-xs');
    const firstRadio = wrapper.findAll('button[role="radio"]')[0]!;
    expect(firstRadio.find('span').classes()).toContain('hidden');
    expect(firstRadio.find('span').classes()).toContain('sm:inline');
  });

  it('成果卡为纵向布局且溢出隐藏（移动端单列不横向溢出）', () => {
    wrapper = mount(AchievementCard, {
      props: { item: makeItem(), selected: false, manual: false },
    });
    const article = wrapper.find('article');
    expect(article.classes()).toContain('flex-col');
    expect(article.classes()).toContain('overflow-hidden');
  });
});

describe('achievement workspace（页面层级）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  function mountPage() {
    return mount(AchievementPage, {
      global: { stubs: { Echarts: true } },
    });
  }

  it('顶部仅保留标题/总数/主操作；统计默认收起不占首屏', async () => {
    wrapper = mountPage();
    await nextTick();
    expect(wrapper.find('h1').text()).toBe('已完成');
    expect(wrapper.text()).toContain('共');
    expect(wrapper.find('header button').text()).toContain('新建成果');
    // 默认卡片视图：统计概览收起（v-show display:none），主列表渲染
    const statsParent = wrapper.find('[aria-label="成果统计概览"]').element
      .parentElement as HTMLElement;
    expect(statsParent.style.display).toBe('none');
    expect(wrapper.find('[data-testid="achievement-card-grid"]').exists()).toBe(true);
  });

  it('视图切换：概览/集合独立视图不渲染成果主列表', async () => {
    wrapper = mountPage();
    await nextTick();
    const { useAchievementStore } = await import('@/features/achievements/store');
    const store = useAchievementStore();
    const statsParent = () =>
      wrapper.find('[aria-label="成果统计概览"]').element.parentElement as HTMLElement;
    const colParent = () =>
      wrapper.find('[aria-label="成果集合"]').element.parentElement as HTMLElement;
    const go = async (label: string) => {
      const radios = wrapper.findAll('button[role="radio"]');
      await radios.find((b) => b.attributes('title') === `${label}视图`)!.trigger('click');
      await nextTick();
    };

    await go('概览');
    expect(store.ui.view).toBe('overview');
    expect(statsParent().style.display).toBe('');
    expect(wrapper.find('[data-testid="achievement-card-grid"]').exists()).toBe(false);

    await go('集合');
    expect(store.ui.view).toBe('collections');
    expect(colParent().style.display).toBe('');
    expect(statsParent().style.display).toBe('none');

    await go('卡片');
    expect(store.ui.view).toBe('card');
    expect(wrapper.find('[data-testid="achievement-card-grid"]').exists()).toBe(true);
    expect(statsParent().style.display).toBe('none');
  });

  it('卡片网格移动端单列（grid-cols-1 + sm 断点升列）', async () => {
    wrapper = mountPage();
    await nextTick();
    const grid = wrapper.find('[data-testid="achievement-card-grid"]');
    expect(grid.classes()).toContain('grid-cols-1');
    expect(grid.classes()).toContain('sm:grid-cols-2');
  });

  it('主操作新建成果打开表单抽屉', async () => {
    wrapper = mountPage();
    await nextTick();
    await wrapper.find('header button').trigger('click');
    await nextTick();
    const dialog = document.body.querySelector('[role="dialog"][aria-label="新增成果"]');
    expect(dialog).not.toBeNull();
  });
});
