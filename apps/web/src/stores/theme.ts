/**
 * 全局主题 Store（Pinia）
 *
 * 原理：Tailwind v4 的 @theme 把 --color-* 令牌编译为 :root 上的 CSS 变量，
 * 运行时覆盖这些变量即可让全站所有使用语义色（surface 系与 brand 系）的组件联动换肤。
 *
 * 每个背景预设都自带一套独立完整配色（页面/卡片/次级块/边框/文字/品牌色），
 * 选择后整组写入 documentElement.style，经 localStorage 持久化。
 */
import { computed, ref, watch } from 'vue';
import { defineStore } from 'pinia';

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
  /** 是否为深色主题（影响 hover 与强调色的呈现） */
  dark: boolean;
}

export interface ThemePreset {
  id: string;
  label: string;
  value: string;
  /** 该背景下的完整配色方案 */
  palette: ThemePalette;
}

export interface FontPreset {
  id: string;
  label: string;
  value: string;
}

export const BACKGROUND_PRESETS: ThemePreset[] = [
  {
    id: 'neutral-50',
    label: '浅灰',
    value: '#f8fafc',
    palette: {
      page: '#f8fafc',
      surface0: '#ffffff',
      surface50: '#f1f5f9',
      surface100: '#e2e8f0',
      surface800: '#475569',
      surface900: '#0f172a',
      brand500: '#6366f1',
      brand600: '#4f46e5',
      brand700: '#4338ca',
      dark: false,
    },
  },
  {
    id: 'white',
    label: '纯白',
    value: '#ffffff',
    palette: {
      page: '#ffffff',
      surface0: '#ffffff',
      surface50: '#f8fafc',
      surface100: '#e2e8f0',
      surface800: '#475569',
      surface900: '#0f172a',
      brand500: '#6366f1',
      brand600: '#4f46e5',
      brand700: '#4338ca',
      dark: false,
    },
  },
  {
    id: 'blue',
    label: '雾蓝',
    value: '#eff6ff',
    palette: {
      page: '#eff6ff',
      surface0: '#f8fbff',
      surface50: '#e3efff',
      surface100: '#c9dcfb',
      surface800: '#3f5f94',
      surface900: '#1e3a6b',
      brand500: '#3b82f6',
      brand600: '#2563eb',
      brand700: '#1d4ed8',
      dark: false,
    },
  },
  {
    id: 'purple',
    label: '淡紫',
    value: '#faf5ff',
    palette: {
      page: '#faf5ff',
      surface0: '#fdfaff',
      surface50: '#f2e8ff',
      surface100: '#e3d4fb',
      surface800: '#6b5699',
      surface900: '#433070',
      brand500: '#8b5cf6',
      brand600: '#7c3aed',
      brand700: '#6d28d9',
      dark: false,
    },
  },
  {
    id: 'green',
    label: '薄荷',
    value: '#f0fdf4',
    palette: {
      page: '#f0fdf4',
      surface0: '#f8fef9',
      surface50: '#e2f9ec',
      surface100: '#c9f0d8',
      surface800: '#3d7355',
      surface900: '#1e4d33',
      brand500: '#10b981',
      brand600: '#059669',
      brand700: '#047857',
      dark: false,
    },
  },
  {
    id: 'rose',
    label: '粉杏',
    value: '#fff1f2',
    palette: {
      page: '#fff1f2',
      surface0: '#fff8f9',
      surface50: '#ffe9eb',
      surface100: '#fcd3d8',
      surface800: '#9c4650',
      surface900: '#74202c',
      brand500: '#f43f5e',
      brand600: '#e11d48',
      brand700: '#be123c',
      dark: false,
    },
  },
  {
    id: 'amber',
    label: '暖米',
    value: '#fffbeb',
    palette: {
      page: '#fffbeb',
      surface0: '#fffdf5',
      surface50: '#fdf1d2',
      surface100: '#f7e3a9',
      surface800: '#8a6d2a',
      surface900: '#6b520f',
      brand500: '#f59e0b',
      brand600: '#d97706',
      brand700: '#b45309',
      dark: false,
    },
  },
  {
    id: 'dark',
    label: '深空',
    value: '#111318',
    palette: {
      page: '#111318',
      surface0: '#1b1e25',
      surface50: '#21252e',
      surface100: '#30353f',
      surface800: '#a3adbd',
      surface900: '#eef1f6',
      brand500: '#818cf8',
      brand600: '#a5b4fc',
      brand700: '#c7d2fe',
      dark: true,
    },
  },
];

export const FONT_PRESETS: FontPreset[] = [
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

/** 相对亮度（WCAG 近似）：0 黑 ~ 1 白（用于回退分支判断明暗） */
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
  // 优先使用预设自带配色；未匹配（自定义/旧数据）时回退到明暗两套
  const preset = BACKGROUND_PRESETS.find((p) => p.value === page);
  if (preset) return preset.palette;
  const dark = luminance(page) < 0.35;
  return dark ? { ...DARK_PALETTE, page, dark: true } : { ...LIGHT_PALETTE, page, dark: false };
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

  /** 把调色板写入 :root CSS 变量 + body 兜底，全站立即生效 */
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
