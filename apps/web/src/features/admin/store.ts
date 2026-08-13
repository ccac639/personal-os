/**
 * Admin 功能域 —— Pinia store
 *
 * 职责：
 * - 个人偏好（profile / appearance / automation）的加载、保存、回退提示
 * - 主题模式（浅色 / 深色 / 跟随系统）与既有 theme store 的双向同步
 * - AI Provider / 模型目录的会话内存态；API Key 只存在于本 store，刷新即消失
 * - 提供「应用主题模式」等副作用入口，页面负责调用时机
 *
 * 安全边界：apiKey 字段绝不写入 localStorage（持久化仅 hasKey 布尔），
 * 也绝不进入备份 / 诊断 / 导出。
 */
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';

import { BACKGROUND_PRESETS, useThemeStore } from '@/stores/theme';

import { defaultPreferences, loadAdminPreferences, saveAdminPreferences } from './storage';
import { ADMIN_PROVIDERS_KEY } from './registry';
import {
  createMockModels,
  createMockProviders,
  toMemoryProvider,
  toPersistedProvider,
} from './providers';
import type {
  AdminPreferences,
  AdminProvider,
  AdminProviderDraft,
  AdminThemeMode,
  ConnectionCheckResult,
} from './types';
import { getProviderConnectionAdapter } from './providers';

/** 主题模式 → theme store 背景预设 id（浅色固定用 neutral-50，深色用 dark） */
const THEME_PRESET_BY_MODE: Record<Exclude<AdminThemeMode, 'system'>, string> = {
  light: 'neutral-50',
  dark: 'dark',
};

function presetValueById(id: string): string {
  return BACKGROUND_PRESETS.find((p) => p.id === id)?.value ?? BACKGROUND_PRESETS[0]!.value;
}

function systemPrefersDark(): boolean {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  } catch {
    return false;
  }
}

export const useAdminStore = defineStore('admin', () => {
  /* ---------------- 偏好 ---------------- */

  const prefsResult = loadAdminPreferences();
  const prefs = ref<AdminPreferences>(prefsResult.prefs);
  /** 偏好数据损坏被回退时提示 UI */
  const prefsRecovered = ref(prefsResult.recovered);
  /** 最近一次备份时间（内存态，刷新即重置为 null） */
  const lastBackupAt = ref<string | null>(null);

  function markBackup(): void {
    lastBackupAt.value = new Date().toISOString();
  }

  /** 保存偏好；返回是否成功（配额 / 隐私模式失败时提示） */
  function savePrefs(): boolean {
    const outcome = saveAdminPreferences(prefs.value);
    if (outcome === 'saved') {
      prefsRecovered.value = false;
      return true;
    }
    return false;
  }

  /** 恢复所有默认偏好（危险操作区用） */
  function resetPrefs(): void {
    prefs.value = defaultPreferences();
    savePrefs();
    applyThemeMode(prefs.value.appearance.themeMode);
  }

  /* ---------------- 主题同步 ---------------- */

  /** 应用主题模式到既有 theme store（theme store 自行持久化，刷新无闪烁） */
  function applyThemeMode(mode: AdminThemeMode): void {
    const themeStore = useThemeStore();
    const resolved: Exclude<AdminThemeMode, 'system'> =
      mode === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : mode;
    themeStore.setBackground(presetValueById(THEME_PRESET_BY_MODE[resolved]));
  }

  /** 跟随系统：监听系统主题变化（返回停止函数；jsdom/不支持时自动降级） */
  function startSystemThemeWatch(): () => void {
    if (typeof window.matchMedia !== 'function') return () => undefined;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      if (prefs.value.appearance.themeMode === 'system') {
        applyThemeMode('system');
      }
    };
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }

  /* ---------------- AI Provider（会话内存态） ---------------- */

  const providers = ref<AdminProviderDraft[]>(createMockProviders().map(toMemoryProvider));
  const models = ref(createMockModels());

  const enabledProviderCount = computed(() => providers.value.filter((p) => p.enabled).length);

  /** 更新 Provider 的持久化字段；apiKey 不随此方法落盘 */
  function updateProvider(id: string, patch: Partial<AdminProvider>): void {
    const target = providers.value.find((p) => p.id === id);
    if (!target) return;
    Object.assign(target, patch);
  }

  /** 设置内存态 API Key（绝不持久化） */
  function setApiKey(id: string, key: string): void {
    const target = providers.value.find((p) => p.id === id);
    if (target) target.apiKey = key;
  }

  /** 清空单个 Provider 的内存态 API Key */
  function clearApiKey(id: string): void {
    const target = providers.value.find((p) => p.id === id);
    if (target) target.apiKey = '';
  }

  /** 清空全部内存态 API Key（离开页面 / 刷新场景） */
  function clearAllApiKeys(): void {
    for (const p of providers.value) p.apiKey = '';
  }

  /** 持久化 Provider 配置（仅 hasKey 布尔，Key 内容不落盘） */
  function persistProviderConfigs(): void {
    const persisted: AdminProvider[] = providers.value.map(toPersistedProvider);
    try {
      window.localStorage.setItem(
        ADMIN_PROVIDERS_KEY,
        JSON.stringify({ version: 1, providers: persisted }),
      );
    } catch {
      /* 写入失败静默：Provider 配置为会话态，不影响核心功能 */
    }
  }

  /** 连接检查（deterministic mock，不发起真实网络） */
  async function checkConnection(id: string): Promise<ConnectionCheckResult> {
    const target = providers.value.find((p) => p.id === id);
    if (!target) return { ok: false, latencyMs: 0, message: '未找到该 Provider' };
    return getProviderConnectionAdapter().checkConnection(target, models.value);
  }

  /* ---------------- 持久化联动 ---------------- */

  return {
    prefs,
    prefsRecovered,
    lastBackupAt,
    markBackup,
    savePrefs,
    resetPrefs,
    applyThemeMode,
    startSystemThemeWatch,
    providers,
    models,
    enabledProviderCount,
    updateProvider,
    setApiKey,
    clearApiKey,
    clearAllApiKeys,
    persistProviderConfigs,
    checkConnection,
  };
});
