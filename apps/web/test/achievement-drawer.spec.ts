import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AchievementDrawer from '@/features/achievements/achievement-drawer.vue';
import type { Achievement } from '@/features/achievements/types';

function make(): Achievement {
  return {
    id: 'drawer-1',
    type: 'article',
    title: '抽屉测试成果',
    summary: '摘要',
    description: '一段用于测试的详细描述，'.repeat(20),
    tags: Array.from({ length: 10 }, (_, i) => `标签${i}`),
    completedAt: '2026-08-13',
    link: 'https://example.com/article',
    metrics: [{ label: '阅读量', value: '1.2k' }],
    relations: { projectIds: [], workflowIds: [], predecessorIds: [], derivedIds: [] },
    reuse: { links: [], usageGuide: '', checklist: [], retrospective: '', templateSnippet: '' },
    pinned: false,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** 抽屉内容通过 Teleport 渲染到 body */
function queryDialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]');
}

/** 每个用例只挂载一个抽屉，确保 afterEach 能完全卸载清理 */
let wrapper: ReturnType<typeof mount> | null = null;

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
  document.body.style.overflow = '';
  document.body.innerHTML = '';
});

describe('achievement drawer（键盘 / 焦点 / 滚动）', () => {
  it('打开时锁定背景滚动，关闭后恢复', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    expect(document.body.style.overflow).toBe('hidden');

    await wrapper.setProps({ item: null });
    await nextTick();
    expect(document.body.style.overflow).toBe('');
  });

  it('打开时焦点移到关闭按钮；卸载后归还焦点', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = queryDialog();
    expect(dialog).not.toBeNull();
    const closeBtn = dialog!.querySelector('button[aria-label="关闭详情"]') as HTMLButtonElement;
    expect(document.activeElement).toBe(closeBtn);

    wrapper.unmount();
    wrapper = null;
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it('Escape 关闭抽屉', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('点击遮罩关闭抽屉', async () => {
    // 禁用 Transition stub，保证遮罩与面板的 DOM 层级真实
    wrapper = mount(AchievementDrawer, {
      props: { item: make() },
      global: { stubs: { transition: false } },
    });
    await nextTick();
    const overlay = queryDialog()!.parentElement!;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('点击内容区不关闭抽屉', async () => {
    wrapper = mount(AchievementDrawer, {
      props: { item: make() },
      global: { stubs: { transition: false } },
    });
    await nextTick();
    queryDialog()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(wrapper.emitted('close')).toBeFalsy();
  });

  it('外链安全属性 + 新标签页；长文本不截断为单行', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const link = queryDialog()!.querySelector('a') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(queryDialog()!.querySelector('h2')!.classList.contains('break-words')).toBe(true);
  });

  it('编辑 / 归档 / 删除直显；置顶收纳在更多菜单并可正确派发', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = queryDialog()!;
    expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);
    const buttons = Array.from(dialog.querySelectorAll('footer button'));
    const text = (b: Element) => b.textContent ?? '';
    (buttons.find((b) => text(b).includes('编辑')) as HTMLButtonElement).click();
    expect(wrapper.emitted('edit')![0]![0]).toMatchObject({ id: 'drawer-1' });

    // 低频操作收纳：置顶需先打开「更多」菜单
    const more = dialog.querySelector('button[aria-label="更多操作"]') as HTMLButtonElement;
    expect(more).toBeTruthy();
    more.click();
    await nextTick();
    const menuButtons = Array.from(dialog.querySelectorAll('footer button'));
    (menuButtons.find((b) => text(b).includes('置顶')) as HTMLButtonElement).click();
    expect(wrapper.emitted('pin')![0]).toEqual(['drawer-1']);

    (buttons.find((b) => text(b).includes('归档')) as HTMLButtonElement).click();
    expect(wrapper.emitted('archive')![0]).toEqual(['drawer-1']);

    const del = buttons.find((b) => text(b).includes('删除')) as HTMLButtonElement;
    del.click();
    del.click();
    expect(wrapper.emitted('remove')![0]).toEqual(['drawer-1']);
  });

  it('更多菜单：点击菜单外区域关闭；菜单项派发后自动收起', async () => {
    wrapper = mount(AchievementDrawer, { props: { item: make() } });
    await nextTick();
    const dialog = queryDialog()!;
    const more = dialog.querySelector('button[aria-label="更多操作"]') as HTMLButtonElement;
    more.click();
    await nextTick();
    expect(dialog.textContent).toContain('导出单项');

    // 点击遮罩层关闭菜单
    const backdrop = dialog.querySelector('button[aria-label="关闭更多菜单"]') as HTMLButtonElement;
    expect(backdrop).toBeTruthy();
    backdrop.click();
    await nextTick();
    expect(dialog.textContent).not.toContain('导出单项');
    expect(wrapper.emitted('close')).toBeFalsy(); // 只关菜单，不关抽屉
  });

  it('指标为空时显示无数据占位，不渲染误导性 0', async () => {
    const item = make();
    item.metrics = [];
    wrapper = mount(AchievementDrawer, { props: { item } });
    await nextTick();
    const dialog = queryDialog()!;
    expect(document.body.querySelectorAll('[role="dialog"]').length).toBe(1);
    expect(dialog.textContent).toContain('暂无关键指标数据');
    expect(dialog.textContent).not.toContain('阅读量');
  });
});
