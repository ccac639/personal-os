import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import AchievementCard from '@/features/achievements/achievement-card.vue';
import type { Achievement } from '@/features/achievements/types';

function make(overrides: Partial<Achievement> = {}): Achievement {
  return {
    id: 'card-1',
    type: 'project',
    title: '常规标题',
    summary: '常规摘要',
    description: '描述',
    tags: ['vue'],
    completedAt: '2026-08-13',
    metrics: [{ label: '测试覆盖率', value: '96%' }],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('achievement card（渲染健壮性）', () => {
  it('长标题 / 长摘要 / 多标签不破坏渲染', () => {
    const long = make({
      title: '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常长的成果标题',
      summary: '同样很长的一段摘要内容，'.repeat(10),
      tags: Array.from({ length: 12 }, (_, i) => `标签${i}`),
    });
    const wrapper = mount(AchievementCard, {
      props: { item: long, selected: false, manual: false },
    });
    expect(wrapper.find('h3').text()).toContain('成果标题');
    expect(wrapper.findAll('.line-clamp-2').length).toBeGreaterThan(0);
    expect(wrapper.findAll('span').length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('缺失链接不渲染外链；缺失指标显示占位而非 0', () => {
    const noLink = make({ link: undefined, metrics: [] });
    const wrapper = mount(AchievementCard, {
      props: { item: noLink, selected: false, manual: false },
    });
    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toContain('暂无关键指标');
    expect(wrapper.text()).not.toContain('指标 0');
    wrapper.unmount();
  });

  it('指标值为空时显示占位符', () => {
    const wrapper = mount(AchievementCard, {
      props: {
        item: make({ metrics: [{ label: '指标', value: '' }] }),
        selected: false,
        manual: false,
      },
    });
    expect(wrapper.text()).toContain('—');
    wrapper.unmount();
  });

  it('纯图标按钮带 aria-label，多选按钮反映选中态', async () => {
    const wrapper = mount(AchievementCard, {
      props: { item: make(), selected: true, manual: false },
    });
    const checkbox = wrapper.find('[role="checkbox"]');
    expect(checkbox.attributes('aria-checked')).toBe('true');
    expect(checkbox.attributes('aria-label')).toContain('取消选择');
    // 操作按钮都有可访问名称
    const labeled = wrapper.findAll('button[aria-label]');
    expect(labeled.length).toBeGreaterThanOrEqual(4);
    wrapper.unmount();
  });

  it('手动排序模式下显示上移/下移并派发 move 事件', async () => {
    const wrapper = mount(AchievementCard, {
      props: { item: make(), selected: false, manual: true },
    });
    const up = wrapper.find('button[aria-label="上移"]');
    const down = wrapper.find('button[aria-label="下移"]');
    expect(up.exists()).toBe(true);
    expect(down.exists()).toBe(true);

    await up.trigger('click');
    expect(wrapper.emitted('move')![0]).toEqual(['card-1', -1]);
    await down.trigger('click');
    expect(wrapper.emitted('move')![1]).toEqual(['card-1', 1]);
    wrapper.unmount();
  });

  it('勾选派发 select；点击卡片派发 open', async () => {
    const wrapper = mount(AchievementCard, {
      props: { item: make(), selected: false, manual: false },
    });
    await wrapper.find('[role="checkbox"]').trigger('click');
    expect(wrapper.emitted('select')![0]).toEqual(['card-1']);
    await wrapper.find('article').trigger('click');
    expect(wrapper.emitted('open')![0]![0]).toMatchObject({ id: 'card-1' });
    wrapper.unmount();
  });
});
