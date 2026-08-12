/**
 * 全局主题 Store（Pinia）
 *
 * 原理：Tailwind v4 的 @theme 把 --color-* 令牌编译为 :root 上的 CSS 变量，
 * 运行时覆盖这些变量即可让全站所有使用语义色（surface 系与 brand 系）的组件联动换肤。
 *
 * 根据所选背景色的明暗，自动派生整组配色（卡片/边框/文字/品牌色），
 * 选择写入 documentElement.style，经 localStorage 持久化。
 */
import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

export interface ThemePreset {
  id: string;
  label: string;
  value: string;
}

export const BACKGROUND_PRESETS: ThemePreset[] = [
  { id: 'neutral-50', label: '浅灰', value: '#f8fafc' },
  { id: 'white', label: '纯白', value: '#ffffff' },
  { id: 'blue', label: '雾蓝', value: '#eff6ff' },
  { id: 'purple', label: '淡紫', value: '#faf5ff' },
  { id: 'green', label: '薄荷', value: '#f0fdf4' },
  { id: 'rose', label: '粉杏', value: '#fff1f2' },
  { id: 'amber', label: '暖米', value: '#fffbeb' },
  { id: 'dark', label: '深空', value: '#111318' },
];

export const FONT_PRESETS: ThemePreset[] = [
  {
    id: 'system',
    label: '系统默认',
    value: "system-ui, -apple-system, 'Segoe UI', 'Microsoft YaHei', sans-serif",
  },
  {
    id: 'yahei',
    label: '微软雅黑',
    value: "'Microsoft YaHei', 'PingFang SC', 'Helvetica Neue', sans-serif",
  },
  {
    id: 'serif',
    label: '衬线宋体',
    value: "Georgia, 'Times New Roman', 'Songti SC', 'SimSun', serif",
  },
  {
    id: 'kaiti',
    label: '楷体',
    value: "'KaiTi', 'STKaiti', 'Kaiti SC', serif",
  },
  {
    id: 'mono',
    label: '等宽',
    value: "'JetBrains Mono', 'Cascadia Mono', 'Courier New', monospace",
  },
  {
    id: 'rounded',
    label: '圆体',
    value: "'YouYuan', 'Yuanti SC', 'STYuanti', sans-serif",
  },
];

const STORAGE_KEY = 'personal-os-dashboard-theme';

/** 相对亮度（WCAG 近似）：0 黑 ~ 1 白 */
function luminance(hex: string): number {
  const c = hex.replace('#', '');
  const full =
    c.length === 3
      ? c
          .split('')
          .map((x) => x + x)
          .join('')
      : c;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r ?? 0) + 0.7152 * lin(g ?? 0) + 0.0722 * lin(b ?? 0);
}

function isDark(color: string): boolean {
  return luminance(color) < 0.35;
}

export interface ThemePalette {
  /** 页面背景（用户所选颜色） */
  page: string;
  /** 卡片背景 */
  surface0: string;
  /** 次级块背景（hover/highlight 底） */
  surface50: string;
  /** 边框 */
  surface100: string;
  /** 次级文字 */
  surface800: string;
  /** 主文字 */
  surface900: string;
  brand500: string;
  brand600: string;
  brand700: string;
  dark: boolean;
}

const LIGHT_PALETTE: Omit<ThemePalette, 'page' | 'dark'> = {
  surface0: '#ffffff',
  surface50: '#f8fafc',
  surface100: '#e6eaf0',
  surface800: '#334155',
  surface900: '#0f172a',
  brand500: '#6366f1',
  brand600: '#4f46e5',
  brand700: '#4338ca',
};

const DARK_PALETTE: Omit<ThemePalette, 'page' | 'dark'> = {
  surface0: '#1b1e25',
  surface50: '#21252e',
  surface100: '#30353f',
  surface800: '#a3adbd',
  surface900: '#eef1f6',
  brand500: '#818cf8',
  brand600: '#a5b4fc',
  brand700: '#c7d2fe',
};

function buildPalette(page: string): ThemePalette {
  const dark = isDark(page);
  const base = dark ? DARK_PALETTE : LIGHT_PALETTE;
  return { ...base, page, dark };
}

function loadBackground(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { background?: string };
      if (parsed.background) return parsed.background;
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return BACKGROUND_PRESETS[0]!.value;
}

function loadFont(): string {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { font?: string };
      if (parsed.font) return parsed.font;
    }
  } catch {
    /* 忽略损坏数据 */
  }
  return FONT_PRESETS[0]!.value;
}

export const useThemeStore = defineStore('theme', () => {
  const background = ref(loadBackground());
  const font = ref(loadFont());

  const palette = computed<ThemePalette>(() => buildPalette(background.value));

  /** 把派生调色板写入 :root CSS 变量 + body 兜底，全站立即生效 */
  function apply() {
    const p = palette.value;
    const root = document.documentElement;
    const set = (name: string, value: string) => root.style.setProperty(name, value);
    set('--color-page', p.page);
    set('--color-surface-0', p.surface0);
    set('--color-surface-50', p.surface50);
    set('--color-surface-100', p.surface100);
    set('--color-surface-800', p.surface800);
    set('--color-surface-900', p.surface900);
    set('--color-brand-500', p.brand500);
    set('--color-brand-600', p.brand600);
    set('--color-brand-700', p.brand700);
    root.dataset.theme = p.dark ? 'dark' : 'light';
    document.body.style.backgroundColor = p.page;
    document.body.style.fontFamily = font.value;
    document.body.style.transition = 'background-color 0.3s ease, color 0.3s ease';
  }

  function setBackground(value: string) {
    background.value = value;
  }

  function setFont(value: string) {
    font.value = value;
  }

  function reset() {
    background.value = BACKGROUND_PRESETS[0]!.value;
    font.value = FONT_PRESETS[0]!.value;
  }

  // 变更自动持久化 + 应用
  watch(
    [background, font],
    () => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ background: background.value, font: font.value }),
        );
      } catch {
        /* 忽略写入失败 */
      }
      apply();
    },
    { deep: true },
  );

  return { background, font, palette, apply, setBackground, setFont, reset };
});
