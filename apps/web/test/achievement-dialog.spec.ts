import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import AchievementConfirmDialog from '@/features/achievements/achievement-confirm-dialog.vue';

let wrapper: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

function queryDialog(): HTMLElement | null {
  return document.body.querySelector('[role="alertdialog"]');
}

function mountDialog(visible: boolean) {
  wrapper = mount(AchievementConfirmDialog, {
    props: { visible, titles: ['成果 A'], count: 1 },
  });
  return wrapper;
}

describe('achievement confirm dialog（删除确认）', () => {
  it('展示数量与标题；确认 / 取消事件正确派发', async () => {
    const w = mountDialog(true);
    await nextTick();
    const dialog = queryDialog()!;
    expect(dialog.textContent).toContain('1');
    expect(dialog.textContent).toContain('成果 A');

    // 取消
    Array.from(dialog.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('取消'))!
      .click();
    expect(w.emitted('close')).toBeTruthy();

    // 重新打开，确认删除
    await w.setProps({ visible: true });
    await nextTick();
    const dialog2 = queryDialog()!;
    Array.from(dialog2.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('确认删除'))!
      .click();
    expect(w.emitted('confirm')).toBeTruthy();
  });

  it('Escape 关闭；点击遮罩关闭', async () => {
    const w = mountDialog(true);
    await nextTick();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(w.emitted('close')).toBeTruthy();

    await w.setProps({ visible: true });
    await nextTick();
    // 遮罩是 alertdialog 的父级
    queryDialog()!.parentElement!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(w.emitted('close')).toHaveLength(2);
  });

  it('打开时记录触发焦点，关闭后归还', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = '打开删除';
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const w = mountDialog(true);
    await nextTick();
    expect(document.activeElement).toBe(trigger); // 弹窗不抢焦点

    await w.setProps({ visible: false });
    await nextTick();
    expect(document.activeElement).toBe(trigger); // 关闭后归还
  });
});
