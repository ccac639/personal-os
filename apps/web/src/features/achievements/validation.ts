/**
 * 成果库字段校验（纯函数，供表单与存储清洗共用）
 */
import type { AchievementDraft } from './types';

/** 合法日期：YYYY-MM-DD 且真实存在 */
export function isValidDateString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

/** 合法 ISO 时间戳 */
export function isValidIso(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime()) && value.includes('T');
}

/** 合法外链：仅 http/https */
export function isValidUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 标签文本拆分：支持中文/英文逗号、顿号、空白分隔，去重去空 */
export function splitTags(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[,，、\s]+/)) {
    const t = raw.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** 字段级校验错误（key 为空表示该字段无错） */
export interface DraftErrors {
  title?: string;
  completedAt?: string;
  link?: string;
  tags?: string;
  /** 复用包关键链接存在非法项 */
  reuseLinks?: string;
}

/** 校验表单负载，返回字段级错误；空对象表示通过 */
export function validateDraft(draft: AchievementDraft): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = '请填写成果标题';
  if (!isValidDateString(draft.completedAt)) errors.completedAt = '请选择有效的完成日期';
  if (draft.link && !isValidUrl(draft.link)) errors.link = '链接需以 http:// 或 https:// 开头';
  if (draft.tags.some((t) => t.length > 30)) errors.tags = '单个标签最长 30 个字';
  if (draft.reuse.links.some((l) => !l.label.trim() || !isValidUrl(l.url))) {
    errors.reuseLinks = '复用包链接需填写名称，且地址以 http:// 或 https:// 开头';
  }
  return errors;
}
