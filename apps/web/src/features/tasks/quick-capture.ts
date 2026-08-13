/**
 * 快速捕获解析器（确定性纯函数，不依赖任何自然语言模型）
 *
 * 语法（顺序无关，均从输入中提取后剩余为标题）：
 * - 日期关键词：今天 / 今日 / 明天 / 明日 / 后天 / 本周X / 下周X / 周五等
 *   以及「下周一」「周五」；返回 YYYY-MM-DD。
 * - 优先级标记：!高 / !中 / !低 / !urgent / !high / !medium / !low（大小写不敏感）
 * - 标签：#标签（支持多个，中文与英文均可）
 *
 * 未匹配日期 / 优先级时使用默认值；解析结果对同一输入始终一致（确定性）。
 */
import type { TaskPriority } from '@personal-os/types';
import { addDays } from '@/features/projects/plan';

export interface QuickCaptureParse {
  /** 清洗后的任务标题（必填，去标记后非空） */
  title: string;
  /** YYYY-MM-DD；无关键词时为 undefined */
  dueDate?: string;
  priority: TaskPriority;
  tags: string[];
}

const WEEKDAY_CN: Record<string, number> = { 日: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

const PRIORITY_MAP: Record<string, TaskPriority> = {
  '!高': 'high',
  '!中': 'medium',
  '!低': 'low',
  '!urgent': 'urgent',
  '!high': 'high',
  '!medium': 'medium',
  '!low': 'low',
};

/**
 * 解析日期关键词；today 为 YYYY-MM-DD（本地时区）。
 * 返回 { date, consumed }；consumed 为应从输入中移除的原文片段。
 */
export function parseDateKeyword(
  input: string,
  today: string,
): { date?: string; consumed?: string } {
  const todayDate = new Date(`${today}T00:00:00`);
  if (Number.isNaN(todayDate.getTime())) return {};

  // 绝对偏移词（按首次出现顺序，长词优先）
  const offsets: [RegExp, number, string][] = [
    [/后天/g, 2, '后天'],
    [/明天|明日/g, 1, '明天'],
    [/今天|今日/g, 0, '今天'],
  ];
  for (const [re, days, label] of offsets) {
    if (re.test(input)) {
      const d = new Date(todayDate.getTime() + days * 86_400_000);
      return { date: toStr(d), consumed: label };
    }
  }

  // 本周X / 下周X / 这周X
  const weekMatch = input.match(/(?:下|这|本)周(日|一|二|三|四|五|六)/);
  if (weekMatch) {
    const target = WEEKDAY_CN[weekMatch[1]!]!;
    const thisMonday = addDays(today, -todayDate.getDay()); // 本周一
    const monday = new Date(`${thisMonday}T00:00:00`);
    const offset = weekMatch[0].startsWith('下') ? 7 : 0;
    const d = new Date(monday.getTime() + (offset + target) * 86_400_000);
    return { date: toStr(d), consumed: weekMatch[0] };
  }

  // 裸「周X」（默认本周；若已过则下周）
  const bare = input.match(/(?:周|星期)(日|一|二|三|四|五|六)/);
  if (bare) {
    const target = WEEKDAY_CN[bare[1]!]!;
    const thisMonday = addDays(today, -todayDate.getDay());
    const monday = new Date(`${thisMonday}T00:00:00`);
    let offset = target;
    const candidate = new Date(monday.getTime() + offset * 86_400_000);
    if (toStr(candidate) < today) offset += 7;
    const d = new Date(monday.getTime() + offset * 86_400_000);
    return { date: toStr(d), consumed: bare[0] };
  }

  // 下月 / 月底 / 下周
  if (/下月/.test(input)) {
    const y = todayDate.getFullYear();
    const m = todayDate.getMonth() + 1;
    const first = new Date(y, m, 1);
    return { date: toStr(first), consumed: '下月' };
  }
  if (/月底/.test(input)) {
    const y = todayDate.getFullYear();
    const m = todayDate.getMonth() + 1; // 1-12
    const last = new Date(y, m, 0); // 当月最后一天
    return { date: toStr(last), consumed: '月底' };
  }
  if (/下周/.test(input)) {
    const d = new Date(todayDate.getTime() + 7 * 86_400_000);
    return { date: toStr(d), consumed: '下周' };
  }
  return {};
}

function toStr(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 提取优先级标记（!高 / !urgent 等），返回优先级与剩余输入 */
export function extractPriority(input: string): { priority: TaskPriority; rest: string } {
  const keys = Object.keys(PRIORITY_MAP).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`(^|\\s)${escapeRe(k)}(?=\\s|$)`, 'i');
    if (re.test(input)) {
      const rest = input.replace(re, ' ').replace(/\s+/g, ' ').trim();
      return { priority: PRIORITY_MAP[k]!, rest };
    }
  }
  return { priority: 'medium', rest: input };
}

/** 提取 #标签（中文标签须以 # 开头，允许字母数字中文下划线连字符） */
export function extractTags(input: string): { tags: string[]; rest: string } {
  const re = /(?:^|\s)#([\p{L}\p{N}_-]+)/gu;
  const tags: string[] = [];
  const rest = input.replace(re, (m, tag: string) => {
    tags.push(tag);
    return ' ';
  });
  return { tags, rest: rest.replace(/\s+/g, ' ').trim() };
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 解析快速捕获输入。
 * - 输入为空或清洗后标题为空 → null；
 * - today 非法 → null（保证确定性：非法日期不产生不可复现结果）。
 */
export function parseQuickCapture(input: string, today: string): QuickCaptureParse | null {
  if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const { priority, rest: afterPrio } = extractPriority(trimmed);
  const { tags, rest: afterTags } = extractTags(afterPrio);
  const { date, consumed } = parseDateKeyword(afterTags, today);
  const title = consumed ? afterTags.replace(consumed, ' ').replace(/\s+/g, ' ').trim() : afterTags;
  if (!title) return null;

  return {
    title,
    dueDate: date,
    priority,
    tags,
  };
}
