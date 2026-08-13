/**
 * Chat 功能域 —— 持久化边界（repository）
 *
 * 组件与 store 不直接读写 localStorage，统一收敛到本模块：
 * - 会话存储（personal-os.chat.v1）：版本化 + zod 结构校验，
 *   损坏 / 过期 / 不兼容数据安全回退至默认 mock 会话并清理无效存储
 * - 偏好存储（personal-os.chat.prefs.v1）：模型库筛选 / 收藏 / 输出配置，
 *   损坏时回退安全默认值并返回 recovered 标志供 UI 非阻塞提示
 * - 安全约定：只存 UI 状态；API Key、图片二进制、完整文件内容绝不入 localStorage
 */
import { z } from 'zod';

import { CHAT_MODELS } from './models';
import type {
  ChatPreferences,
  ChatSession,
  ChatSystemPromptPreset,
} from './types';
import { uid } from './utils';

export const STORAGE_KEY = 'personal-os.chat.v1';
export const PREFERENCES_KEY = 'personal-os.chat.prefs.v1';
export const PRESETS_KEY = 'personal-os.chat.presets.v1';
const SCHEMA_VERSION = 1;
const PREFERENCES_VERSION = 1;
const DEFAULT_MODEL = CHAT_MODELS[0]!.id;

const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  createdAt: z.number(),
  model: z.string().optional(),
  streaming: z.boolean().optional(),
  error: z.boolean().optional(),
  bookmarked: z.boolean().optional(),
  quote: z
    .object({
      id: z.string(),
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })
    .optional(),
});

const chatSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(chatMessageSchema),
  model: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  agentName: z.string().optional(),
  systemPrompt: z
    .object({
      presetId: z.string(),
      text: z.string(),
    })
    .optional(),
  /** 无该字段视为旧版数据，结构校验通过则兼容迁移 */
  schemaVersion: z.literal(SCHEMA_VERSION).optional(),
});

const chatStoreSchema = z.array(chatSessionSchema);

const preferencesSchema = z
  .object({
    modelFilter: z.enum(['all', 'chat', 'code', 'image', 'creative']),
    modelQuery: z.string(),
    showFavoritesOnly: z.boolean(),
    favorites: z.array(z.string()),
    currentModel: z.string(),
    outputMode: z.enum(['chat', 'writing', 'code', 'image']),
    replyLength: z.enum(['short', 'standard', 'detailed']),
    systemPromptEnabled: z.boolean(),
    sidebarCollapsed: z.boolean(),
    sessionModelFilter: z.enum(['all', 'chat', 'code', 'image', 'creative']),
    sessionTimeFilter: z.enum(['all', 'today', 'week', 'month']),
    sessionBookmarkFilter: z.boolean(),
  })
  // 允许缺字段（未来版本演进 / 旧数据）：读取时合并默认值向前兼容；
  // 类型不合法（如枚举越界）仍视为损坏回退
  .partial();

/** 默认偏好（安全回退值；currentModel 取目录第一个可用模型） */
export function defaultPreferences(): ChatPreferences {
  return {
    modelFilter: 'all',
    modelQuery: '',
    showFavoritesOnly: false,
    favorites: CHAT_MODELS.filter((m) => m.favorite).map((m) => m.id),
    currentModel: DEFAULT_MODEL,
    outputMode: 'chat',
    replyLength: 'standard',
    systemPromptEnabled: false,
    sidebarCollapsed: false,
    sessionModelFilter: 'all',
    sessionTimeFilter: 'all',
    sessionBookmarkFilter: false,
  };
}

/** 默认 mock 会话：数据损坏回退时保证 UI 可用（新对话 + 欢迎态） */
function defaultSessions(): ChatSession[] {
  const now = Date.now();
  return [
    {
      id: uid(),
      title: '新对话',
      messages: [],
      model: DEFAULT_MODEL,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

/** 清理无效会话存储 */
export function clearStoredSessions(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 存储不可用时忽略
  }
}

/** 清理无效偏好存储 */
export function clearStoredPreferences(): void {
  try {
    localStorage.removeItem(PREFERENCES_KEY);
  } catch {
    // 存储不可用时忽略
  }
}

/** 读取并校验会话；任何异常/不兼容数据都回退到默认会话 */
export function loadSessions(): ChatSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSessions();

    const parsed: unknown = JSON.parse(raw);
    const result = chatStoreSchema.safeParse(parsed);
    if (!result.success) {
      clearStoredSessions();
      return defaultSessions();
    }
    return result.data as ChatSession[];
  } catch {
    clearStoredSessions();
    return defaultSessions();
  }
}

/** 保存会话（附加版本号），失败（隐私模式/配额）不阻塞聊天 */
export function saveSessions(sessions: ChatSession[]): void {
  try {
    const payload = sessions.map((s) => ({ ...s, schemaVersion: SCHEMA_VERSION }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 存储失败不阻塞聊天
  }
}

export interface PreferencesLoadResult {
  prefs: ChatPreferences;
  /** 数据损坏 / 不兼容被回退时置 true，UI 可非阻塞提示 */
  recovered: boolean;
}

/**
 * 读取并校验偏好；损坏 / 不兼容数据回退安全默认值并清理无效存储。
 * 缺字段（未来版本新增）自动补默认值，向前兼容。
 */
export function loadPreferences(): PreferencesLoadResult {
  try {
    const raw = localStorage.getItem(PREFERENCES_KEY);
    if (!raw) return { prefs: defaultPreferences(), recovered: false };

    const parsed: unknown = JSON.parse(raw);
    const result = preferencesSchema.safeParse(parsed);
    if (!result.success) {
      clearStoredPreferences();
      return { prefs: defaultPreferences(), recovered: true };
    }
    // 合并默认值：目录新增模型 / 偏好字段演进时保持兼容
    const base = defaultPreferences();
    const data = result.data as Partial<ChatPreferences>;
    return {
      prefs: { ...base, ...data },
      recovered: false,
    };
  } catch {
    clearStoredPreferences();
    return { prefs: defaultPreferences(), recovered: true };
  }
}

/** 保存偏好（附加版本号）；失败不阻塞 UI */
export function savePreferences(prefs: ChatPreferences): void {
  try {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ ...prefs, schemaVersion: PREFERENCES_VERSION }),
    );
  } catch {
    // 存储失败不阻塞
  }
}

/* ---------- 自定义系统提示词预设 ---------- */

const customPresetSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  text: z.string(),
  builtin: z.literal(false).optional(),
});

export interface CustomPresetsLoadResult {
  presets: ChatSystemPromptPreset[];
  /** 数据损坏被回退时置 true */
  recovered: boolean;
}

/** 读取自定义预设；损坏 / 不兼容数据回退空列表并清理 */
export function loadCustomPresets(): CustomPresetsLoadResult {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return { presets: [], recovered: false };
    const parsed: unknown = JSON.parse(raw);
    const result = z.array(customPresetSchema).safeParse(parsed);
    if (!result.success) {
      clearStoredPresets();
      return { presets: [], recovered: true };
    }
    return {
      presets: result.data as ChatSystemPromptPreset[],
      recovered: false,
    };
  } catch {
    clearStoredPresets();
    return { presets: [], recovered: true };
  }
}

/** 保存自定义预设（强制 builtin=false）；失败不阻塞 */
export function saveCustomPresets(presets: ChatSystemPromptPreset[]): void {
  try {
    const payload = presets.map((p) => ({ ...p, builtin: false }));
    localStorage.setItem(PRESETS_KEY, JSON.stringify(payload));
  } catch {
    // 存储失败不阻塞
  }
}

/** 清理无效预设存储 */
export function clearStoredPresets(): void {
  try {
    localStorage.removeItem(PRESETS_KEY);
  } catch {
    // 存储不可用时忽略
  }
}
