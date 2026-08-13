import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { monthlySeries, overviewStats, typeDistribution } from '@/features/achievements/stats';
import AchievementStats from '@/features/achievements/achievement-stats.vue';
import type { Achievement } from '@/features/achievements/types';

function make(partial: Partial<Achievement> & { id: string }): Achievement {
  return {
    type: 'project',
    title: 'x',
    summary: '',
    description: '',
    tags: [],
    completedAt: '2026-07-18',
    metrics: [],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('achievement stats（统计纯函数）', () => {
  it('overviewStats：总数 / 未归档 / 归档 / 置顶 / 今年 / 独立标签', () => {
    const now = new Date();
    const thisYear = now.getFullYear();
    const items: Achievement[] = [
      make({ id: '1', completedAt: `${thisYear}-01-10`, pinned: true, tags: ['a', 'b'] }),
      make({ id: '2', completedAt: `${thisYear}-02-10`, tags: ['a'] }),
      make({ id: '3', completedAt: `${thisYear - 1}-06-01`, archived: true, tags: ['c'] }),
    ];
    const stats = overviewStats(items);
    expect(stats.total).toBe(3);
    expect(stats.active).toBe(2);
    expect(stats.archived).toBe(1);
    expect(stats.pinned).toBe(1);
    expect(stats.thisYear).toBe(2);
    expect(stats.tagCount).toBe(3);
  });

  it('typeDistribution：按类型计数并给出占比，五种类型顺序固定', () => {
    const items: Achievement[] = [
      make({ id: '1', type: 'project' }),
      make({ id: '2', type: 'project' }),
      make({ id: '3', type: 'article' }),
      make({ id: '4', type: 'milestone' }),
    ];
    const dist = typeDistribution(items);
    expect(dist).toHaveLength(5); // 未出现的类型也保留（0 计数）
    const project = dist.find((d) => d.type === 'project')!;
    expect(project.count).toBe(2);
    expect(project.ratio).toBe(50);
    expect(dist.find((d) => d.type === 'article')!.count).toBe(1);
    expect(dist.find((d) => d.type === 'milestone')!.count).toBe(1);
    // 占比合计 100（空列表时 total 兜底为 1）
    expect(typeDistribution([]).reduce((s, d) => s + d.ratio, 0)).toBe(0);
  });

  it('monthlySeries：按月聚合、升序排列、窗口截取最近 N 个月', () => {
    const items: Achievement[] = [
      make({ id: '1', completedAt: '2025-01-10' }),
      make({ id: '2', completedAt: '2025-01-20' }),
      make({ id: '3', completedAt: '2025-03-05' }),
      make({ id: '4', completedAt: '2025-03-12' }),
      make({ id: '5', completedAt: '2025-03-28' }),
      make({ id: '6', completedAt: '2025-02-15' }),
    ];
    const series = monthlySeries(items, 24);
    expect(series.map((p) => p.key)).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(series.map((p) => p.count)).toEqual([2, 1, 3]);
    expect(series[0]!.label).toBe('1月');

    // 窗口截取：只保留最近 2 个月
    const windowed = monthlySeries(items, 2);
    expect(windowed.map((p) => p.key)).toEqual(['2025-02', '2025-03']);
  });

  it('monthlySeries：空列表返回空数组', () => {
    expect(monthlySeries([])).toEqual([]);
  });
});

describe('achievement stats 组件（空态）', () => {
  it('无数据时显示占位文案，不渲染图表', () => {
    const wrapper = mount(AchievementStats, {
      props: { items: [] },
      global: { stubs: { VChart: true } },
    });
    expect(wrapper.text()).toContain('暂无月度数据');
    expect(wrapper.findComponent({ name: 'VChart' }).exists()).toBe(false);
    // 无障碍摘要仍可用
    expect(wrapper.find('.sr-only').text()).toContain('暂无数据');
  });
});
