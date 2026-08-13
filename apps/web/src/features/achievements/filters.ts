import { TYPE_META } from './constants';
import type { Achievement, AchievementFilters, AchievementSort } from './types';

/** 关键词匹配：标题 / 摘要 / 描述 / 关联项目 / 标签 */
export function matchKeyword(a: Achievement, keyword: string): boolean {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return true;
  const haystack = [a.title, a.summary, a.description, a.relatedProject ?? '', ...a.tags]
    .join(' ')
    .toLowerCase();
  return haystack.includes(kw);
}

function padMonth(m: number): string {
  return String(m).padStart(2, '0');
}

/**
 * 应用全部筛选条件（关键词 / 类型 / 完成年份 / 完成月份 / 标签 / 归档状态 /
 * 结构化搜索：标题 / 描述 / 关联项目名称）。
 * 纯函数：不修改入参，返回新数组。
 * @param resolveProjectName 关联项目 id → 名称（读取 projects 模块，只读引用）
 */
export function filterAchievements(
  list: Achievement[],
  filters: AchievementFilters,
  resolveProjectName?: (projectId: string) => string | undefined,
): Achievement[] {
  const year = filters.year;
  const month = filters.month;
  return list.filter((a) => {
    if (filters.archived === 'active' && a.archived) return false;
    if (filters.archived === 'archived' && !a.archived) return false;
    if (filters.types.length > 0 && !filters.types.includes(a.type)) return false;
    if (year != null && !a.completedAt.startsWith(`${year}-`)) return false;
    if (year != null && month != null) {
      if (!a.completedAt.startsWith(`${year}-${padMonth(month)}-`)) return false;
    }
    if (!matchKeyword(a, filters.keyword)) return false;
    if (filters.tags.length > 0 && !filters.tags.some((t) => a.tags.includes(t))) return false;
    // 结构化搜索：标题包含
    const titleQ = filters.titleQuery.trim().toLowerCase();
    if (titleQ && !a.title.toLowerCase().includes(titleQ)) return false;
    // 结构化搜索：描述包含
    const descQ = filters.descQuery.trim().toLowerCase();
    if (descQ && !a.description.toLowerCase().includes(descQ)) return false;
    // 结构化搜索：关联项目名称包含（relations 解析名称 + 旧版自由文本兜底）
    const projectQ = filters.projectQuery.trim().toLowerCase();
    if (projectQ) {
      const names = a.relations.projectIds
        .map((id) => resolveProjectName?.(id) ?? '')
        .filter(Boolean);
      const related = a.relatedProject ?? '';
      const hit =
        names.some((n) => n.toLowerCase().includes(projectQ)) ||
        related.toLowerCase().includes(projectQ);
      if (!hit) return false;
    }
    return true;
  });
}

/** 排序：置顶优先，其次按指定规则（纯函数） */
export function sortAchievements(list: Achievement[], sort: AchievementSort): Achievement[] {
  return [...list].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    switch (sort) {
      case 'date-asc':
        return a.completedAt.localeCompare(b.completedAt) || a.createdAt.localeCompare(b.createdAt);
      case 'updated':
        return b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id);
      case 'title':
        return (
          a.title.localeCompare(b.title, 'zh-Hans-CN') || a.completedAt.localeCompare(b.completedAt)
        );
      case 'manual':
        return (a.order ?? 0) - (b.order ?? 0) || a.createdAt.localeCompare(b.createdAt);
      default:
        return b.completedAt.localeCompare(a.completedAt) || b.createdAt.localeCompare(a.createdAt);
    }
  });
}

/** 当前生效的筛选条件数量（用于「已筛选 N 项」提示与一键清空） */
export function activeFilterCount(f: AchievementFilters): number {
  let n = 0;
  if (f.keyword.trim()) n += 1;
  if (f.types.length > 0) n += 1;
  if (f.year != null) n += 1;
  if (f.month != null) n += 1;
  if (f.tags.length > 0) n += 1;
  if (f.archived !== 'active') n += 1;
  if (f.titleQuery.trim()) n += 1;
  if (f.descQuery.trim()) n += 1;
  if (f.projectQuery.trim()) n += 1;
  return n;
}

/** 筛选条件的人类可读摘要（空态展示用） */
export function filterSummary(f: AchievementFilters): string[] {
  const parts: string[] = [];
  const kw = f.keyword.trim();
  if (kw) parts.push(`关键词「${kw}」`);
  if (f.types.length > 0) parts.push(`类型：${f.types.map((t) => TYPE_META[t].label).join('、')}`);
  if (f.year != null) {
    parts.push(f.month != null ? `${f.year} 年 ${f.month} 月` : `${f.year} 年`);
  }
  if (f.tags.length > 0) parts.push(`标签：${f.tags.join('、')}`);
  if (f.archived === 'archived') parts.push('仅看已归档');
  else if (f.archived === 'all') parts.push('包含已归档');
  const titleQ = f.titleQuery.trim();
  if (titleQ) parts.push(`标题包含「${titleQ}」`);
  const descQ = f.descQuery.trim();
  if (descQ) parts.push(`描述包含「${descQ}」`);
  const projectQ = f.projectQuery.trim();
  if (projectQ) parts.push(`关联项目「${projectQ}」`);
  return parts;
}

/** 全部出现过的年份（降序） */
export function yearOptions(list: Achievement[]): number[] {
  const years = new Set<number>();
  for (const a of list) {
    const y = Number(a.completedAt.slice(0, 4));
    if (Number.isFinite(y)) years.add(y);
  }
  return [...years].sort((a, b) => b - a);
}

/** 指定年份中出现过的月份（升序） */
export function monthOptions(list: Achievement[], year: number): number[] {
  const months = new Set<number>();
  for (const a of list) {
    if (!a.completedAt.startsWith(`${year}-`)) continue;
    const m = Number(a.completedAt.slice(5, 7));
    if (Number.isFinite(m)) months.add(m);
  }
  return [...months].sort((a, b) => a - b);
}

/** 全部标签（按使用频次降序，其次按名称；比较器确定性，跨环境稳定） */
export function allTags(list: Achievement[]): string[] {
  const freq = new Map<string, number>();
  for (const a of list) {
    for (const t of a.tags) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([tag]) => tag);
}
