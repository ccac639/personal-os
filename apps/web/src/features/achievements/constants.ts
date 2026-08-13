import type { Component } from 'vue';
import { Code2, FileText, Rocket, Trophy, Workflow } from '@lucide/vue';
import type { AchievementSort, AchievementType } from './types';

/** 类型元数据：展示名 / 图标 / chip 配色 / 统计条配色 */
export interface TypeMeta {
  label: string;
  icon: Component;
  /** 图标底色（语义色，不随主题变化，与工作流模块同风格） */
  chip: string;
  /** 统计条 / 时间线圆点颜色 */
  dot: string;
}

export const TYPE_META: Record<AchievementType, TypeMeta> = {
  project: {
    label: '项目发布',
    icon: Rocket,
    chip: 'bg-brand-500/10 text-brand-600',
    dot: 'bg-brand-500',
  },
  article: {
    label: '文章',
    icon: FileText,
    chip: 'bg-violet-500/10 text-violet-600',
    dot: 'bg-violet-500',
  },
  workflow: {
    label: '工作流模板',
    icon: Workflow,
    chip: 'bg-emerald-500/10 text-emerald-600',
    dot: 'bg-emerald-500',
  },
  code: {
    label: '代码片段',
    icon: Code2,
    chip: 'bg-amber-500/10 text-amber-600',
    dot: 'bg-amber-500',
  },
  milestone: {
    label: '里程碑',
    icon: Trophy,
    chip: 'bg-rose-500/10 text-rose-600',
    dot: 'bg-rose-500',
  },
};

export const ACHIEVEMENT_TYPES = Object.keys(TYPE_META) as AchievementType[];

/** 标签 chip 色板（按标签哈希稳定取色） */
const TAG_PALETTE = [
  'bg-brand-500/10 text-brand-600',
  'bg-emerald-500/10 text-emerald-600',
  'bg-amber-500/10 text-amber-600',
  'bg-rose-500/10 text-rose-600',
  'bg-sky-500/10 text-sky-600',
  'bg-violet-500/10 text-violet-600',
  'bg-teal-500/10 text-teal-600',
  'bg-fuchsia-500/10 text-fuchsia-600',
];

export function tagCls(tag: string): string {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) >>> 0;
  return TAG_PALETTE[h % TAG_PALETTE.length]!;
}

/** 排序选项 */
export const SORT_OPTIONS: { value: AchievementSort; label: string }[] = [
  { value: 'date-desc', label: '完成时间（新→旧）' },
  { value: 'date-asc', label: '完成时间（旧→新）' },
  { value: 'updated', label: '最近更新' },
  { value: 'title', label: '标题' },
  { value: 'manual', label: '手动排序' },
];

/** 集合封面色板（预置色，避免任意输入破坏主题） */
export const COLLECTION_COLORS: { value: string; label: string }[] = [
  { value: '#6366f1', label: '靛蓝' },
  { value: '#10b981', label: '翠绿' },
  { value: '#f59e0b', label: '琥珀' },
  { value: '#f43f5e', label: '玫红' },
  { value: '#0ea5e9', label: '天蓝' },
  { value: '#8b5cf6', label: '紫罗兰' },
  { value: '#14b8a6', label: '青碧' },
  { value: '#78716c', label: '石灰' },
];

export const DEFAULT_COLLECTION_COLOR = COLLECTION_COLORS[0]!.value;

/** 合法集合封面色（预置色板或任意 #rrggbb） */
export function isCollectionColor(v: unknown): v is string {
  return (
    typeof v === 'string' &&
    (COLLECTION_COLORS.some((c) => c.value === v) || /^#[0-9a-fA-F]{6}$/.test(v))
  );
}

export function sanitizeCollectionColor(v: unknown): string {
  return isCollectionColor(v) ? v.toLowerCase() : DEFAULT_COLLECTION_COLOR;
}
