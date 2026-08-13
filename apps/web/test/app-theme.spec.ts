import { createPinia, setActivePinia } from 'pinia';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BACKGROUND_PRESETS, useThemeStore } from '@/stores/theme';

/**
 * 主题 store 测试：语义变量应用 / 亮暗自适应 / colorScheme 同步 /
 * prefers-reduced-motion 下关闭 body 过渡（避免主题切换闪烁与动效）。
 */
function stubMatchMedia(query: string, matches: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((q: string) => ({
      matches: q === query ? matches : !matches,
      media: q,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      onchange: null,
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  // 还原 :root 内联变量
  const root = document.documentElement;
  root.removeAttribute('style');
  root.removeAttribute('data-theme');
  document.body.removeAttribute('style');
});

describe('theme store 语义变量', () => {
  it('apply() 写入全部语义 CSS 变量与 data-theme / colorScheme', () => {
    setActivePinia(createPinia());
    const theme = useThemeStore();
    theme.setBackground(BACKGROUND_PRESETS[7]!.value); // dark 预设
    theme.apply();

    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--color-page')).toBe(BACKGROUND_PRESETS[7]!.value);
    expect(root.style.getPropertyValue('--color-surface-900')).toBe('#eef1f6');

    theme.setBackground(BACKGROUND_PRESETS[0]!.value); // 浅色预设
    theme.apply();
    expect(root.dataset.theme).toBe('light');
    expect(root.style.colorScheme).toBe('light');
  });

  it('prefers-reduced-motion 时 body 不设置主题过渡（无闪烁副作用动画）', () => {
    stubMatchMedia('(prefers-reduced-motion: reduce)', true);
    setActivePinia(createPinia());
    const theme = useThemeStore();
    theme.apply();
    expect(document.body.style.transition).toBe('none');

    vi.unstubAllGlobals();
    stubMatchMedia('(prefers-reduced-motion: reduce)', false);
    theme.apply();
    expect(document.body.style.transition).toContain('background-color 0.3s ease');
  });

  it('setBackground / setFont / reset 保持既有 API 契约（业务模块依赖）', () => {
    setActivePinia(createPinia());
    const theme = useThemeStore();
    expect(typeof theme.setBackground).toBe('function');
    expect(typeof theme.setFont).toBe('function');
    expect(typeof theme.reset).toBe('function');
    // setup store 中 computed 自动解包：palette 即值本身
    expect(typeof theme.palette.dark).toBe('boolean');
    expect(Array.isArray(BACKGROUND_PRESETS)).toBe(true);
    expect(BACKGROUND_PRESETS.length).toBeGreaterThanOrEqual(8);
  });
});
