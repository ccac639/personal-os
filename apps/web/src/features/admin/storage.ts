/**
 * Admin 功能域 —— 偏好持久化（repository）
 *
 * - 独立 key：personal-os.admin.v1，版本信封 { version, prefs }
 * - zod 结构校验：损坏 / 版本过新 / 不可读 → 安全回退默认值并返回 recovered 标志
 * - 安全约定：本模块只存个人偏好；API Key、Token、文件内容绝不写入 localStorage。
 *   Provider 的 API Key 由 store 内存态持有，持久化仅记录 hasKey 布尔。
 */
import { z } from 'zod';

import { ADMIN_STORAGE_KEY, ADMIN_STORAGE_VERSION } from './registry';
import type { AdminPreferences, AdminPrefsResult } from './types';

export const avatarUrlSchema = z
  .string()
  .max(500)
  .refine((v) => {
    if (!v) return true;
    try {
      const u = new URL(v);
      return u.protocol === 'https:' || u.protocol === 'http:';
    } catch {
      return false;
    }
  }, '头像地址必须是合法的 http(s) URL');

/** 头像 URL 校验：空值合法（未设置），非空必须是 http(s) 地址 */
export function isValidAvatarUrl(value: string): boolean {
  return avatarUrlSchema.safeParse(value).success;
}

export const adminProfileSchema = z.object({
  displayName: z.string().max(60),
  avatarUrl: avatarUrlSchema,
  bio: z.string().max(500),
  timezone: z.string().max(60),
  language: z.string().max(20),
});

export const adminAppearanceSchema = z.object({
  themeMode: z.enum(['light', 'dark', 'system']),
  themeModeInitialized: z.boolean().optional().default(false),
  density: z.enum(['comfortable', 'compact']),
  reduceMotion: z.boolean(),
  defaultPage: z.enum(['dashboard', 'chat', 'workflows', 'projects', 'achievements']),
  use24Hour: z.boolean(),
  relativeTime: z.boolean(),
});

export const automationPrefsSchema = z.object({
  workflowRunMode: z.enum(['manual', 'simulate']),
  notifyWorkflowComplete: z.boolean(),
  notifyWorkflowFailed: z.boolean(),
  notifyHealthWarning: z.boolean(),
  dailyPlanReminder: z.boolean(),
  dailyPlanTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  deadlineReminder: z.boolean(),
  deadlineTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeklyReviewReminder: z.boolean(),
  weeklyReviewTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  weeklyReviewDay: z.number().int().min(0).max(6),
});

export const adminPrefsSchema = z.object({
  profile: adminProfileSchema,
  appearance: adminAppearanceSchema,
  automation: automationPrefsSchema,
});

const envelopeSchema = z.object({
  version: z.number(),
  prefs: adminPrefsSchema,
});

export function defaultPreferences(): AdminPreferences {
  return {
    profile: {
      displayName: '',
      avatarUrl: '',
      bio: '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'Asia/Shanghai',
      language: navigator.language ?? 'zh-CN',
    },
    appearance: {
      themeMode: 'system',
      themeModeInitialized: false,
      density: 'comfortable',
      reduceMotion: false,
      defaultPage: 'dashboard',
      use24Hour: false,
      relativeTime: true,
    },
    automation: {
      workflowRunMode: 'manual',
      notifyWorkflowComplete: true,
      notifyWorkflowFailed: true,
      notifyHealthWarning: true,
      dailyPlanReminder: true,
      dailyPlanTime: '09:00',
      deadlineReminder: true,
      deadlineTime: '18:00',
      weeklyReviewReminder: true,
      weeklyReviewTime: '20:00',
      weeklyReviewDay: 5,
    },
  };
}

/** 加载偏好：损坏 / 版本过新 / 写入格式不兼容 → 安全回退默认值 */
export function loadAdminPreferences(): AdminPrefsResult {
  const fallback: AdminPrefsResult = { prefs: defaultPreferences(), recovered: false };
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(ADMIN_STORAGE_KEY);
  } catch {
    return { prefs: defaultPreferences(), recovered: true };
  }
  if (raw === null) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { prefs: defaultPreferences(), recovered: true };
  }

  const result = envelopeSchema.safeParse(parsed);
  if (!result.success) return { prefs: defaultPreferences(), recovered: true };
  if (result.data.version > ADMIN_STORAGE_VERSION) {
    return { prefs: defaultPreferences(), recovered: true };
  }
  return { prefs: result.data.prefs, recovered: false };
}

export type SaveOutcome = 'saved' | 'quota' | 'denied';

/** 保存偏好：写入失败（配额 / 隐私模式）返回失败类型，不抛异常 */
export function saveAdminPreferences(prefs: AdminPreferences): SaveOutcome {
  const envelope = { version: ADMIN_STORAGE_VERSION, prefs };
  try {
    window.localStorage.setItem(ADMIN_STORAGE_KEY, JSON.stringify(envelope));
    return 'saved';
  } catch {
    return 'denied';
  }
}

/** 清理 Admin 自身设置（危险操作区用） */
export function clearAdminPreferences(): boolean {
  try {
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
