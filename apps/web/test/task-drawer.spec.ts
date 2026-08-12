import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import TaskDrawer from '@/features/tasks/task-drawer.vue';

describe('task drawer（详情抽屉）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountDrawer(taskId: string | null, open = true) {
    const wrapper = mount(TaskDrawer, {
      props: { taskId, open },
    });
    await wrapper.vm.$nextTick();
    return wrapper;
  }

  it('展示任务标题、描述、属性与活动历史（含创建事件）', async () => {
    const store = useTaskStore();
    useProjectStore();
    const task = store.createTask({
      projectId: 'p-blog',
      title: '抽屉测试任务',
      description: '描述内容',
      priority: 'high',
      status: 'todo',
      dueDate: '2026-08-20',
      tags: ['测试'],
    });

    const wrapper = await mountDrawer(task.id);
    expect(wrapper.text()).toContain('抽屉测试任务');
    expect(wrapper.text()).toContain('描述内容');
    expect(wrapper.text()).toContain('2026-08-20');
    expect(wrapper.text()).toContain('测试');
    // 活动历史包含创建事件
    expect(wrapper.text()).toContain('创建任务');
    // 空任务 id 时显示空态
    const empty = await mountDrawer('not-exist');
    expect(empty.text()).toContain('任务不存在或已被删除');
  });

  it('子任务交互：添加 / 勾选完成，父任务所属列不变，进度更新', async () => {
    const store = useTaskStore();
    useProjectStore();
    const task = store.createTask({
      projectId: 'p-blog',
      title: '子任务交互测试',
      priority: 'low',
      status: 'in-progress',
      tags: [],
    });
    const columnBefore = store.taskById(task.id)!.status;

    const wrapper = await mountDrawer(task.id);
    const input = wrapper.find('input[placeholder="添加子任务，回车确认"]');
    await input.setValue('第一个子步骤');
    await wrapper.find('button[aria-label="添加子任务"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(store.taskById(task.id)!.subtasks).toHaveLength(1);
    expect(wrapper.text()).toContain('第一个子步骤');

    // 勾选完成
    await wrapper.find('button[aria-label^="标记完成"]').trigger('click');
    await wrapper.vm.$nextTick();
    const sub = store.taskById(task.id)!.subtasks[0]!;
    expect(sub.done).toBe(true);
    // 父任务仍在原列（子任务完成不改变所属列）
    expect(store.taskById(task.id)!.status).toBe(columnBefore);
    // 全部完成后出现提示
    expect(store.taskEvents(task.id).some((e) => e.title === '全部子任务已完成')).toBe(true);
  });

  it('编辑 / 删除按钮向上抛出事件', async () => {
    const store = useTaskStore();
    useProjectStore();
    const task = store.createTask({
      projectId: 'p-blog',
      title: '事件测试任务',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    const wrapper = await mountDrawer(task.id);
    await wrapper.find('button[aria-label="关闭详情"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();

    await wrapper.find('footer button').trigger('click');
    expect(wrapper.emitted('edit')?.[0]).toEqual([task.id]);
  });

  it('快捷键：Escape 关闭抽屉', async () => {
    const store = useTaskStore();
    useProjectStore();
    const task = store.createTask({
      projectId: 'p-blog',
      title: '快捷键任务',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });

    const wrapper = await mountDrawer(task.id);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await wrapper.vm.$nextTick();
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
