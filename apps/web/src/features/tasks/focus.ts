/**
 * 专注计时纯函数（可单测，不依赖 store）
 *
 * 计时模型：
 * - 开始：accumulatedMs = 0，lastResumeAt = now，status = running；
 * - 暂停：accumulatedMs += now - lastResumeAt；
 * - 继续：lastResumeAt = now；
 * - 完成 / 放弃：先结算当前段，再生成 FocusSession 与活动事件标题。
 */
import type { FocusItem, FocusPlanDay, FocusSession, RunningFocus, TaskItem } from './types';

/** 任务是否可加入今日聚焦（必须存在、未完成、未取消；归档项目由调用方结合项目状态判断） */
export function focusEligibleTask(task: TaskItem | null): boolean {
  if (!task) return false;
  return task.status !== 'done' && task.status !== 'cancelled';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 本地时区日期 → YYYY-MM-DD（session 按 endedAt 归属） */
export function sessionDate(endedAt: string): string {
  const d = new Date(endedAt);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 某天（YYYY-MM-DD，按 endedAt 本地时区）累计专注分钟数 */
export function dailyFocusMinutes(sessions: FocusSession[], date: string): number {
  return sessions
    .filter((s) => sessionDate(s.endedAt) === date)
    .reduce((sum, s) => sum + s.minutes, 0);
}

/** 某天是否完成过专注（completed 记录，纯函数） */
export function hasFocusOn(sessions: FocusSession[], date: string): boolean {
  return sessions.some((s) => s.status === 'completed' && sessionDate(s.endedAt) === date);
}

/**
 * 连续专注天数（纯函数）：从今天（含）往回数连续有「完成专注」的天数；
 * 今天尚未专注时从昨天开始回数，避免刚打开应用就断签。
 */
export function focusStreak(sessions: FocusSession[], today: string): number {
  const active = sessions.filter((s) => s.status === 'completed');
  if (!active.length) return 0;
  let streak = 0;
  let cursor = today;
  if (!hasFocusOn(active, cursor)) {
    // 今天还没有专注：从昨天开始数（今天不计入但不断签）
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!hasFocusOn(active, cursor)) return 0;
  }
  for (let guard = 0; guard < 3660; guard += 1) {
    if (!hasFocusOn(active, cursor)) break;
    streak += 1;
    const d = new Date(`${cursor}T00:00:00`);
    d.setDate(d.getDate() - 1);
    cursor = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  return streak;
}

/** 归档某天的日计划（纯函数）：生成 FocusPlanDay（含完成状态） */
export function archivePlanDay(date: string, items: FocusItem[], doneIds: string[]): FocusPlanDay {
  return {
    date,
    items: items.map((i) => ({ taskId: i.taskId, plannedMinutes: i.plannedMinutes })),
    doneIds: [...new Set(doneIds)],
  };
}

/** 迁移未完成项（纯函数）：归档日计划中未勾选完成的项 */
export function migrateUndone(day: FocusPlanDay): FocusItem[] {
  const done = new Set(day.doneIds);
  return day.items
    .filter((i) => !done.has(i.taskId))
    .map((i) => ({ taskId: i.taskId, plannedMinutes: i.plannedMinutes }));
}

/** 合并计划项（纯函数）：按 taskId 去重，后者覆盖 plannedMinutes，保序 */
export function mergePlanItems(base: FocusItem[], extra: FocusItem[]): FocusItem[] {
  const seen = new Set<string>();
  const out: FocusItem[] = [];
  for (const item of [...base, ...extra]) {
    if (seen.has(item.taskId)) continue;
    seen.add(item.taskId);
    out.push({ taskId: item.taskId, plannedMinutes: item.plannedMinutes });
  }
  return out;
}

/** 结算当前累计毫秒数（运行中时叠加当前段；暂停时仅累计） */
export function settleMs(focus: RunningFocus, now: number): number {
  const base = focus.accumulatedMs;
  if (focus.status !== 'running') return base;
  return base + Math.max(0, now - new Date(focus.lastResumeAt).getTime());
}

/** 毫秒 → 分钟（不足 1 分钟按 1 分钟计，便于记录与展示） */
export function msToMinutes(ms: number): number {
  return Math.max(1, Math.round(ms / 60_000));
}

/** 暂停：累计当前段 */
export function pausedFocus(focus: RunningFocus, now: number): RunningFocus {
  return {
    ...focus,
    accumulatedMs: settleMs(focus, now),
    status: 'paused',
  };
}

/** 继续运行 */
export function resumedFocus(focus: RunningFocus, now: number): RunningFocus {
  return {
    ...focus,
    status: 'running',
    lastResumeAt: new Date(now).toISOString(),
  };
}

/** 完成 / 放弃：生成专注记录（不含结束时间，由调用方补充） */
export function buildFocusSession(
  focus: RunningFocus,
  status: FocusSession['status'],
  now: number,
): FocusSession {
  return {
    id: `f-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    taskId: focus.taskId,
    startedAt: focus.startedAt,
    endedAt: new Date(now).toISOString(),
    minutes: msToMinutes(settleMs(focus, now)),
    status,
  };
}

/** 活动事件标题（完成 / 放弃） */
export function focusEventTitle(session: FocusSession): string {
  return session.status === 'completed'
    ? `完成专注 ${session.minutes} 分钟`
    : `放弃专注（累计 ${session.minutes} 分钟）`;
}

/** 格式化计时器展示文本 mm:ss */
export function formatTimer(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
