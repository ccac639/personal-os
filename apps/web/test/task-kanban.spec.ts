import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import type { Pinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import TaskKanban from '@/features/tasks/task-kanban.vue';

describe('task kanban（统一筛选 / 批量操作 / 移动端降级 / 高密度）', () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountKanban(projectId = 'p-personal-os') {
    useProjectStore();
    const wrapper = mount(TaskKanban, {
      props: { projectId },
      global: { plugins: [pinia] },
    });
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  it('筛选收纳：截止日期 / 快捷筛选 / 排序统一在一个工具栏内', async () => {
    const wrapper = await mountKanban();
    // 只有一个筛选工具栏
    const toolbars = wrapper.findAll('[role="toolbar"][aria-label="任务筛选工具栏"]');
    expect(toolbars).toHaveLength(1);

    const toolbar = toolbars[0]!;
    expect(toolbar.find('select[aria-label="任务排序方式"]').exists()).toBe(true);
    expect(toolbar.find('select[aria-label="截止日期筛选"]').exists()).toBe(true);
    expect(toolbar.find('select[aria-label="快捷筛选"]').exists()).toBe(true);
    // 密度切换也在工具栏内
    expect(toolbar.find('button[aria-label="切换为常规密度"]').exists()).toBe(true);

    // 收纳：每个筛选控件全局只出现一次（移动端抽屉未打开时不渲染重复控件）
    expect(wrapper.findAll('select[aria-label="截止日期筛选"]')).toHaveLength(1);
    expect(wrapper.findAll('select[aria-label="快捷筛选"]')).toHaveLength(1);
    // 旧的独立 chip 行（圆角筛选按钮）已移除
    expect(wrapper.findAll('button.rounded-full')).toHaveLength(0);

    // 移动端提供「筛选」入口（底部抽屉）
    expect(wrapper.find('button[aria-label="打开筛选"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('批量工具栏仅在选择任务时出现', async () => {
    const wrapper = await mountKanban();
    expect(wrapper.find('[aria-label="批量操作"]').exists()).toBe(false);

    // 选择第一个任务
    const selectBtn = wrapper.find('button[aria-label^="选择："]');
    await selectBtn.trigger('click');
    await wrapper.vm.$nextTick();

    const batch = wrapper.find('[aria-label="批量操作"]');
    expect(batch.exists()).toBe(true);
    expect(batch.text()).toContain('已选 1 项');

    // 取消选择后消失
    await wrapper.find('button[aria-label="取消选择"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[aria-label="批量操作"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('移动端看板降级：按状态分组列表（md:hidden），桌面三列看板小屏隐藏', async () => {
    const wrapper = await mountKanban();
    const mobileSections = wrapper.findAll('.md\\:hidden');
    expect(mobileSections.length).toBeGreaterThan(0);
    const grouped = mobileSections.find((el) =>
      ['待办', '进行中', '已完成'].every((label) => el.text().includes(label)),
    );
    expect(grouped).toBeTruthy();

    // 桌面三列看板：小屏隐藏
    const desktopBoard = wrapper.findAll('.hidden.md\\:grid');
    expect(desktopBoard.length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('看板默认高密度：隐藏描述，切换为常规后显示', async () => {
    const store = useTaskStore();
    useProjectStore();
    expect(store.density).toBe('dense');

    store.createTask({
      projectId: 'p-personal-os',
      title: '密度测试任务',
      description: '密集模式隐藏的描述',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    const wrapper = await mountKanban();
    // 高密度：标题可见，描述隐藏
    expect(wrapper.text()).toContain('密度测试任务');
    expect(wrapper.text()).not.toContain('密集模式隐藏的描述');

    // 切换为常规密度 → 描述出现
    await wrapper.find('button[aria-label="切换为常规密度"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.density).toBe('comfortable');
    expect(wrapper.text()).toContain('密集模式隐藏的描述');
    wrapper.unmount();
  });
});
