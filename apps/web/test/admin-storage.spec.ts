import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';

import {
  ADMIN_STORAGE_KEY,
  ADMIN_PROVIDERS_KEY,
  ADMIN_STORAGE_VERSION,
} from '@/features/admin/registry';
import {
  defaultPreferences,
  loadAdminPreferences,
  saveAdminPreferences,
  isValidAvatarUrl,
} from '@/features/admin/storage';
import { useAdminStore } from '@/features/admin/store';
import { useThemeStore, BACKGROUND_PRESETS } from '@/stores/theme';

describe('admin 偏好持久化', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('默认偏好可安全加载，recovered 为 false', () => {
    const result = loadAdminPreferences();
    expect(result.recovered).toBe(false);
    expect(result.prefs.appearance.themeMode).toBe('system');
    expect(result.prefs.automation.workflowRunMode).toBe('manual');
    expect(result.prefs.profile.timezone.length).toBeGreaterThan(0);
  });

  it('保存后重新加载可恢复（版本信封格式）', () => {
    const prefs = defaultPreferences();
    prefs.profile.displayName = '本地用户';
    prefs.appearance.density = 'compact';
    prefs.appearance.defaultPage = 'chat';
    prefs.automation.weeklyReviewDay = 5;

    expect(saveAdminPreferences(prefs)).toBe('saved');

    const raw = localStorage.getItem(ADMIN_STORAGE_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.version).toBe(ADMIN_STORAGE_VERSION);
    expect(envelope.prefs.profile.displayName).toBe('本地用户');

    const reloaded = loadAdminPreferences();
    expect(reloaded.recovered).toBe(false);
    expect(reloaded.prefs.appearance.density).toBe('compact');
    expect(reloaded.prefs.appearance.defaultPage).toBe('chat');
    expect(reloaded.prefs.automation.weeklyReviewDay).toBe(5);
  });

  it('损坏数据安全回退默认值并标记 recovered', () => {
    localStorage.setItem(ADMIN_STORAGE_KEY, '{not valid json');
    const result = loadAdminPreferences();
    expect(result.recovered).toBe(true);
    expect(result.prefs.appearance.density).toBe('comfortable');
  });

  it('版本过新数据安全回退并标记 recovered', () => {
    localStorage.setItem(
      ADMIN_STORAGE_KEY,
      JSON.stringify({ version: ADMIN_STORAGE_VERSION + 1, prefs: defaultPreferences() }),
    );
    const result = loadAdminPreferences();
    expect(result.recovered).toBe(true);
  });

  it('结构不完整（缺少字段）安全回退', () => {
    localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify({ version: 1, prefs: { profile: {} } }));
    const result = loadAdminPreferences();
    expect(result.recovered).toBe(true);
  });

  it('写入失败（配额）返回 denied 且不抛异常', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    try {
      expect(saveAdminPreferences(defaultPreferences())).toBe('denied');
    } finally {
      spy.mockRestore();
    }
  });

  it('localStorage 被禁用时读取安全回退', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const result = loadAdminPreferences();
      expect(result.recovered).toBe(true);
      expect(result.prefs.appearance.density).toBe('comfortable');
    } finally {
      get.mockRestore();
    }
  });
});

describe('admin 偏好 ↔ theme store 同步', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  const darkPreset = BACKGROUND_PRESETS.find((p) => p.id === 'dark')!;
  const lightPreset = BACKGROUND_PRESETS.find((p) => p.id === 'neutral-50')!;

  it('深色模式：写入 theme store 深色预设并持久化', async () => {
    const admin = useAdminStore();
    const theme = useThemeStore();
    admin.applyThemeMode('dark');
    expect(theme.background).toBe(darkPreset.value);
    expect(theme.palette.dark).toBe(true);
    // theme store 自行持久化（watch 异步 flush），刷新后由 main.ts 恢复，不闪烁
    await nextTick();
    const raw = localStorage.getItem('personal-os-dashboard-theme');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).background).toBe(darkPreset.value);
  });

  it('浅色模式：写入浅色预设', () => {
    const admin = useAdminStore();
    const theme = useThemeStore();
    admin.applyThemeMode('light');
    expect(theme.background).toBe(lightPreset.value);
    expect(theme.palette.dark).toBe(false);
  });

  it('主题选择记录 themeModeInitialized（刷新后恢复应用）', async () => {
    const admin = useAdminStore();
    admin.prefs.appearance.themeMode = 'dark';
    admin.prefs.appearance.themeModeInitialized = true;
    admin.applyThemeMode('dark');
    admin.savePrefs();
    await nextTick(); // flush theme store 持久化 watch

    // 模拟刷新：重建 pinia，store 重新加载
    setActivePinia(createPinia());
    const reloaded = useAdminStore();
    const theme = useThemeStore();
    expect(reloaded.prefs.appearance.themeMode).toBe('dark');
    expect(reloaded.prefs.appearance.themeModeInitialized).toBe(true);
    expect(theme.background).toBe(darkPreset.value);
  });

  it('跟随系统模式在系统深色时解析为深色（jsdom 默认浅色）', () => {
    const admin = useAdminStore();
    admin.applyThemeMode('system');
    const theme = useThemeStore();
    // jsdom 无 matchMedia：systemPrefersDark 返回 false → 浅色
    expect(theme.palette.dark).toBe(false);
  });
});

describe('头像 URL 校验', () => {
  it('空值合法（未设置）', () => {
    expect(isValidAvatarUrl('')).toBe(true);
  });

  it('合法 https / http URL 通过', () => {
    expect(isValidAvatarUrl('https://example.com/avatar.png')).toBe(true);
    expect(isValidAvatarUrl('http://localhost:5173/a.jpg')).toBe(true);
  });

  it('非法值拒绝', () => {
    expect(isValidAvatarUrl('not-a-url')).toBe(false);
    expect(isValidAvatarUrl('javascript:alert(1)')).toBe(false);
    expect(isValidAvatarUrl('ftp://example.com/a.png')).toBe(false);
    expect(isValidAvatarUrl('https://a'.repeat(500))).toBe(false);
  });
});

describe('Admin store：API Key 内存边界', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('API Key 只存在于内存，绝不写入 localStorage', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-test-secret-123');
    expect(admin.providers[0]!.apiKey).toBe('sk-test-secret-123');

    // 全量 localStorage 扫描：不得出现 Key 内容
    let found = false;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (localStorage.getItem(key)!.includes('sk-test-secret-123')) found = true;
    }
    expect(found).toBe(false);
  });

  it('保存 Provider 配置只写 hasKey 布尔，Key 内容不落盘', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'sk-test-secret-123');
    admin.persistProviderConfigs();

    const raw = localStorage.getItem(ADMIN_PROVIDERS_KEY);
    expect(raw).not.toBeNull();
    expect(raw).not.toContain('sk-test-secret-123');
    const parsed = JSON.parse(raw!);
    expect(parsed.providers[0]!.hasKey).toBe(true);
    expect(parsed.providers[0]!.apiKey).toBeUndefined();
  });

  it('刷新后（重建 store）API Key 消失', () => {
    const admin = useAdminStore();
    admin.setApiKey('text-model', 'sk-refresh-test');
    expect(admin.providers[1]!.apiKey).toBe('sk-refresh-test');

    setActivePinia(createPinia());
    const reloaded = useAdminStore();
    expect(reloaded.providers[1]!.apiKey).toBe('');
  });

  it('清空单个 / 全部 API Key', () => {
    const admin = useAdminStore();
    admin.setApiKey('generic-compat', 'a');
    admin.setApiKey('text-model', 'b');
    admin.clearApiKey('generic-compat');
    expect(admin.providers[0]!.apiKey).toBe('');
    expect(admin.providers[1]!.apiKey).toBe('b');
    admin.clearAllApiKeys();
    expect(admin.providers.every((p) => p.apiKey === '')).toBe(true);
  });

  it('toPersistedProvider 剥离 apiKey 字段', async () => {
    const { toPersistedProvider } = await import('@/features/admin/providers');
    const persisted = toPersistedProvider({
      id: 'x',
      name: 'x',
      enabled: true,
      defaultModel: 'm',
      capabilities: ['chat'],
      priority: 1,
      timeoutSeconds: 30,
      hasKey: false,
      apiKey: 'sk-top-secret',
    });
    expect(persisted.apiKey).toBeUndefined();
    expect(persisted.hasKey).toBe(true);
  });
});
