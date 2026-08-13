import { beforeEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import AdminDialog from '@/features/admin/components/admin-dialog.vue';
import AdminShell from '@/features/admin/components/admin-shell.vue';
import AdminPreferences from '@/features/admin/components/admin-preferences.vue';
import { useAdminStore } from '@/features/admin/store';
import { useThemeStore, BACKGROUND_PRESETS } from '@/stores/theme';

function findDialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]');
}

function keydownOn(el: HTMLElement, key: string): void {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

describe('AdminDialog 弹窗可访问性', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('打开时渲染 teleport 弹窗并聚焦确认按钮', async () => {
    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作', confirmText: '确认' },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();

    const dialog = findDialog();
    expect(dialog).not.toBeNull();
    expect(dialog!.getAttribute('aria-modal')).toBe('true');
    const buttons = dialog!.querySelectorAll<HTMLButtonElement>('button');
    const confirm = buttons[buttons.length - 1]!;
    expect(document.activeElement).toBe(confirm);
    wrapper.unmount();
  });

  it('Escape 触发关闭事件', async () => {
    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作' },
      attachTo: document.body,
    });
    await nextTick();
    keydownOn(findDialog()!, 'Escape');
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('busy 时 Escape 不关闭（防重复操作）', async () => {
    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作', busy: true },
      attachTo: document.body,
    });
    await nextTick();
    keydownOn(findDialog()!, 'Escape');
    expect(wrapper.emitted('update:open')).toBeUndefined();
    wrapper.unmount();
  });

  it('遮罩点击关闭', async () => {
    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作' },
      attachTo: document.body,
    });
    await nextTick();
    const mask = document.body.querySelector('[aria-hidden="true"]') as HTMLElement;
    mask.click();
    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false]);
    wrapper.unmount();
  });

  it('关闭后焦点恢复到触发元素', async () => {
    const trigger = document.createElement('button');
    trigger.id = 'trigger-btn';
    document.body.appendChild(trigger);
    trigger.focus();

    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作' },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    expect(document.activeElement).not.toBe(trigger);

    await wrapper.setProps({ open: false });
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(trigger);
    wrapper.unmount();
    trigger.remove();
  });

  it('Tab 焦点锁定在弹窗内循环', async () => {
    const wrapper = mount(AdminDialog, {
      props: { open: true, title: '确认操作' },
      attachTo: document.body,
    });
    await nextTick();
    await nextTick();
    const dialog = findDialog()!;
    const buttons = Array.from(dialog.querySelectorAll<HTMLElement>('button'));
    // 焦点在最后一个（确认按钮）：Tab 应循环回第一个（关闭按钮）
    buttons[buttons.length - 1]!.focus();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(document.activeElement).toBe(buttons[0]);
    // Shift+Tab 从第一个循环回最后一个
    buttons[0]!.focus();
    dialog.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
    );
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    wrapper.unmount();
  });
});

describe('AdminShell 二级导航', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('点击导航项发出 update:active', async () => {
    const wrapper = mount(AdminShell, { props: { active: 'overview' } });
    const buttons = wrapper.findAll('nav button');
    expect(buttons.length).toBe(7);
    await buttons[2]!.trigger('click'); // AI 配置
    expect(wrapper.emitted('update:active')?.at(-1)).toEqual(['ai-providers']);
  });

  it('当前项标记 aria-current=page', () => {
    const wrapper = mount(AdminShell, { props: { active: 'data' } });
    const active = wrapper.find('button[aria-current="page"]');
    expect(active.exists()).toBe(true);
    expect(active.text()).toContain('数据与备份');
  });

  it('窄屏导航容器可横向滚动', () => {
    const wrapper = mount(AdminShell, { props: { active: 'overview' } });
    const scrollable = wrapper.find('.overflow-x-auto');
    expect(scrollable.exists()).toBe(true);
    // 窄屏滚动容器内包含全部 7 个导航项
    expect(scrollable.findAll('button').length).toBe(7);
  });

  it('危险操作项带独立图标与文案', () => {
    const wrapper = mount(AdminShell, { props: { active: 'overview' } });
    expect(wrapper.text()).toContain('危险操作');
  });
});

describe('AdminPreferences 头像与主题', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  async function mountPrefs() {
    const wrapper = mount(AdminPreferences, {
      attachTo: document.body,
      global: { plugins: [createPinia()] },
    });
    await nextTick();
    return wrapper;
  }

  it('非法头像 URL 显示校验提示（role=alert）', async () => {
    const wrapper = await mountPrefs();
    const admin = useAdminStore();
    admin.prefs.profile.avatarUrl = 'not-a-url';
    await nextTick();
    const alert = wrapper.find('[role="alert"]');
    expect(alert.exists()).toBe(true);
    expect(alert.text()).toContain('合法的 http(s) URL');
    wrapper.unmount();
  });

  it('合法头像 URL 渲染安全预览（img 无 alt 泄漏）', async () => {
    const wrapper = await mountPrefs();
    const admin = useAdminStore();
    admin.prefs.profile.avatarUrl = 'https://example.com/avatar.png';
    await nextTick();
    const img = wrapper.find('img[src="https://example.com/avatar.png"]');
    expect(img.exists()).toBe(true);
    wrapper.unmount();
  });

  it('图片加载失败回退占位（不再渲染 img）', async () => {
    const wrapper = await mountPrefs();
    const admin = useAdminStore();
    admin.prefs.profile.avatarUrl = 'https://example.com/broken.png';
    await nextTick();
    const img = wrapper.find('img[src="https://example.com/broken.png"]');
    expect(img.exists()).toBe(true);
    await img.trigger('error');
    await nextTick();
    expect(wrapper.find('img[src="https://example.com/broken.png"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('切换主题应用 theme store 并标记已初始化', async () => {
    const wrapper = await mountPrefs();
    const admin = useAdminStore();
    const theme = useThemeStore();

    const darkPreset = BACKGROUND_PRESETS.find((p) => p.id === 'dark')!;
    const darkButton = wrapper.findAll('button[role="radio"]').find((b) => b.text() === '深色')!;
    await darkButton.trigger('click');
    await nextTick();

    expect(admin.prefs.appearance.themeMode).toBe('dark');
    expect(admin.prefs.appearance.themeModeInitialized).toBe(true);
    expect(theme.background).toBe(darkPreset.value);
    expect(theme.palette.dark).toBe(true);
    wrapper.unmount();
  });

  it('保存偏好写入 localStorage 信封', async () => {
    const wrapper = await mountPrefs();
    const admin = useAdminStore();
    admin.prefs.profile.displayName = '测试用户';
    await nextTick();
    const saveBtn = wrapper.findAll('button').find((b) => b.text().includes('保存偏好'))!;
    await saveBtn.trigger('click');
    await nextTick();

    const raw = localStorage.getItem('personal-os.admin.v1');
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.version).toBe(1);
    expect(envelope.prefs.profile.displayName).toBe('测试用户');
    wrapper.unmount();
  });
});
