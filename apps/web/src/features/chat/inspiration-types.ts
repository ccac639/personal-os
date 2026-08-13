/**
 * Chat 功能域 —— 灵感广场数据模型
 *
 * 本质是个人灵感库（非公共社区）：保存提示词、创作目标与关联引用。
 * 只保存文本与结构化元数据，绝不保存附件二进制 / 完整聊天记录。
 */

/** 灵感类别 */
export type InspirationCategory =
  | 'writing'
  | 'code'
  | 'vision'
  | 'research'
  | 'efficiency'
  | 'other';

/** 灵感来源 */
export type InspirationSource = 'manual' | 'chat' | 'agent';

/** 本地 CSS 视觉预设（封面生成，不依赖外部图片） */
export type InspirationVisualPreset =
  | 'color'
  | 'grid'
  | 'paper'
  | 'code'
  | 'minimal'
  | 'geometry';

/** 灵感条目 */
export interface ChatInspiration {
  id: string;
  title: string;
  /** 一句话摘要 */
  summary: string;
  category: InspirationCategory;
  tags: string[];
  /** 完整提示词 */
  prompt: string;
  /** 创作目标 */
  creativeGoal: string;
  /** 封面视觉预设 */
  visualPreset: InspirationVisualPreset;
  favorite: boolean;
  pinned: boolean;
  archived: boolean;
  source: InspirationSource;
  /** 关联智能体 id */
  relatedAgentId?: string;
  /** 关联模型 id */
  relatedModelId?: string;
  /** 关联会话 id（从对话保存时） */
  relatedConversationId?: string;
  createdAt: number;
  updatedAt: number;
}

/** 灵感筛选条件（组合生效） */
export interface InspirationFilters {
  keyword: string;
  category: InspirationCategory | 'all';
  tag: string;
  source: InspirationSource | 'all';
  favoritesOnly: boolean;
  pinnedOnly: boolean;
  /** 三态：undefined=显示全部（含归档）；false=排除归档；true=只看归档 */
  archived: boolean | undefined;
}

/** 排序键 */
export type InspirationSortKey = 'newest' | 'oldest' | 'updated';

/** 卡片 / 列表视图 */
export type InspirationView = 'masonry' | 'list';

/** 快捷视图 */
export type InspirationQuickView = 'all' | 'recent' | 'favorites' | 'drafting' | 'archived';

/** 灵感 UI 偏好（随灵感库持久化） */
export interface InspirationUiState {
  view: InspirationView;
  sort: InspirationSortKey;
  quickView: InspirationQuickView;
  filters: InspirationFilters;
}

/** 导入冲突策略 */
export type InspirationImportStrategy = 'skip' | 'overwrite' | 'copy';

/** 导入预览（展示数量与版本后再执行） */
export interface InspirationImportPreview {
  total: number;
  version: number;
  invalidCount: number;
  /** 首个非法原因（展示用） */
  firstInvalidReason?: string;
}

/** 导入执行结果 */
export interface InspirationImportResult {
  added: number;
  skipped: number;
  overwritten: number;
  copied: number;
  invalid: number;
}

/** 从助手消息保存灵感的草稿（预填表单） */
export interface InspirationDraftInput {
  title: string;
  summary: string;
  prompt: string;
  category: InspirationCategory;
  tags: string[];
  source: InspirationSource;
  creativeGoal?: string;
  relatedAgentId?: string;
  relatedModelId?: string;
  relatedConversationId?: string;
}
