/**
 * 项目计划视图纯函数（可单测，不依赖 store）
 *
 * 时间轴模型：
 * - 以「项目开始日期 ~ 目标完成日期」为窗口；缺失时用里程碑日期推断；
 * - 可用有效日期不足两个时无法绘制时间轴，调用方应降级为列表模式并说明缺失字段；
 * - 网格按 day / week / month 三种刻度生成，组件只负责渲染；
 * - 里程碑无日期时不允许强行绘制到时间轴（调用方按状态展示）。
 */
import type { Milestone, ProjectDetail } from './types';

export type TimelineScale = 'day' | 'week' | 'month';

export interface TimelineCell {
  /** YYYY-MM-DD（刻度起点） */
  date: string;
  /** 展示标签 */
  label: string;
  /** 是否为今天 */
  isToday: boolean;
}

export interface TimelineWindow {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD */
  end: string;
  /** 跨度天数（≥1） */
  spanDays: number;
}

export interface TimelinePosition {
  left: string;
  width: string;
}

/** 计划信息中缺失的字段说明（列表模式提示用） */
export interface PlanMissingInfo {
  /** 是否可绘制时间轴 */
  hasWindow: boolean;
  /** 缺失字段说明（人类可读） */
  missing: string[];
}

export interface EstimateInfo {
  /** 预计投入小时数（未设置时为 null） */
  estimatedHours: number | null;
  /** 已完成投入小时数（由专注分钟折算，1 位小数） */
  doneHours: number;
  /** 剩余投入小时数（无预计时不计算） */
  remainingHours: number | null;
  hasEstimate: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date → YYYY-MM-DD（本地时区） */
export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 校验 YYYY-MM-DD 且为真实存在的日期（如 2026-02-30 不合法）；非字符串直接返回 false */
export function isValidDateStr(s: unknown): s is string {
  if (typeof s !== 'string' || !s) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && toDateStr(d) === s;
}

/** 日期字符串加减天数（YYYY-MM-DD） */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 两个日期相差天数（b - a） */
export function dayDiff(a: string, b: string): number {
  const ta = new Date(`${a}T00:00:00`).getTime();
  const tb = new Date(`${b}T00:00:00`).getTime();
  return Math.round((tb - ta) / 86_400_000);
}

/** 收集项目与里程碑的有效日期（去重、升序） */
export function collectPlanDates(project: ProjectDetail, milestones: Milestone[]): string[] {
  const set = new Set<string>();
  if (isValidDateStr(project.startDate)) set.add(project.startDate);
  if (isValidDateStr(project.targetDate)) set.add(project.targetDate);
  for (const m of milestones) {
    if (isValidDateStr(m.startDate)) set.add(m.startDate);
    if (isValidDateStr(m.dueDate)) set.add(m.dueDate);
  }
  return [...set].sort();
}

/** 时间轴窗口：至少两个不同有效日期；否则返回 null（降级列表模式） */
export function timelineWindow(
  project: ProjectDetail,
  milestones: Milestone[],
): TimelineWindow | null {
  const dates = collectPlanDates(project, milestones);
  const start = dates[0];
  const end = dates[dates.length - 1];
  if (!start || !end || start === end) return null;
  return { start, end, spanDays: Math.max(1, dayDiff(start, end)) };
}

/** 按刻度生成网格单元（覆盖 [start, end]） */
export function buildTimelineCells(
  start: string,
  end: string,
  scale: TimelineScale,
  today: string,
): TimelineCell[] {
  const cells: TimelineCell[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= end && guard < 10_000) {
    guard += 1;
    let next: string;
    let label: string;
    if (scale === 'day') {
      next = addDays(cursor, 1);
      label = cursor.slice(5);
    } else if (scale === 'week') {
      next = addDays(cursor, 7);
      label = cursor.slice(5);
    } else {
      // month：从当月 1 日推进到下月 1 日，但首个单元以 start 对齐
      const d = new Date(`${cursor}T00:00:00`);
      const firstOfMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
      if (cursor === firstOfMonth || cursor === start) {
        const nd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        next = toDateStr(nd);
        label = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      } else {
        // start 不是月初：先补到当月月末，标签为该月
        const nd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        next = addDays(toDateStr(nd), 1);
        label = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      }
    }
    cells.push({ date: cursor, label, isToday: cursor === today });
    cursor = next;
    if (cursor > end) break;
  }
  return cells;
}

/** 日期在窗口内的位置（百分比，左边界 + 宽度），越界自动收敛 */
export function timelinePosition(date: string, window: TimelineWindow): TimelinePosition {
  const diff = dayDiff(window.start, date);
  const span = Math.max(1, window.spanDays);
  const left = Math.max(0, Math.min(100, (diff / span) * 100));
  const width = Math.max(2, Math.min(100 - left, (1 / span) * 100));
  return { left: `${left}%`, width: `${width}%` };
}

/** 里程碑时间轴条：需要至少一个有效日期；无日期返回 null（禁止绘制） */
export function milestoneBar(
  milestone: Milestone,
  window: TimelineWindow,
): TimelinePosition | null {
  const anchor = isValidDateStr(milestone.startDate)
    ? milestone.startDate
    : isValidDateStr(milestone.dueDate)
      ? milestone.dueDate
      : null;
  if (!anchor) return null;
  return timelinePosition(anchor, window);
}

/** 计划日期缺失说明（列表模式提示） */
export function planMissingInfo(project: ProjectDetail, milestones: Milestone[]): PlanMissingInfo {
  const missing: string[] = [];
  if (!isValidDateStr(project.startDate)) missing.push('项目未设置开始日期');
  if (!isValidDateStr(project.targetDate)) missing.push('项目未设置目标完成日期');
  const noDateMs = milestones.filter(
    (m) => !isValidDateStr(m.startDate) && !isValidDateStr(m.dueDate),
  ).length;
  if (noDateMs > 0) missing.push(`${noDateMs} 个里程碑未设置日期`);
  return { hasWindow: timelineWindow(project, milestones) !== null, missing };
}

/** 工时信息（预计 / 已完成 / 剩余；已完成由专注分钟折算） */
export function estimateInfo(project: ProjectDetail, focusMinutes: number): EstimateInfo {
  const estimated =
    typeof project.estimatedHours === 'number' &&
    Number.isFinite(project.estimatedHours) &&
    project.estimatedHours >= 0
      ? Math.round(project.estimatedHours * 10) / 10
      : null;
  const doneHours = Math.round((focusMinutes / 60) * 10) / 10;
  const remainingHours =
    estimated === null ? null : Math.max(0, Math.round((estimated - doneHours) * 10) / 10);
  return { estimatedHours: estimated, doneHours, remainingHours, hasEstimate: estimated !== null };
}
