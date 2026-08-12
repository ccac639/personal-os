/** Dashboard 页面主题设置：背景色 + 字体 */

export interface ThemeSettings {
  /** CSS 背景色 */
  background: string;
  /** CSS font-family */
  font: string;
}

export interface ThemePreset<T = string> {
  id: string;
  label: string;
  value: T;
}

export const BACKGROUND_PRESETS: ThemePreset[] = [
  { id: 'neutral-50', label: '浅灰', value: '#fafafa' },
  { id: 'white', label: '纯白', value: '#ffffff' },
  { id: 'blue', label: '雾蓝', value: '#eff6ff' },
  { id: 'purple', label: '淡紫', value: '#faf5ff' },
  { id: 'green', label: '薄荷', value: '#f0fdf4' },
  { id: 'rose', label: '粉杏', value: '#fff1f2' },
  { id: 'amber', label: '暖米', value: '#fffbeb' },
  { id: 'dark', label: '深空', value: '#171717' },
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

export const DEFAULT_THEME: ThemeSettings = {
  background: BACKGROUND_PRESETS[0]!.value,
  font: FONT_PRESETS[0]!.value,
};

/** 从 localStorage 读取主题，失败或缺失时返回默认值 */
export function loadTheme(): ThemeSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
    return {
      background:
        typeof parsed.background === 'string' ? parsed.background : DEFAULT_THEME.background,
      font: typeof parsed.font === 'string' ? parsed.font : DEFAULT_THEME.font,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

/** 持久化主题到 localStorage */
export function saveTheme(theme: ThemeSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // 隐私模式等写入失败场景，忽略即可
  }
}
