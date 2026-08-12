/**
 * 专注计时纯函数（可单测，不依赖 store）
 *
 * 计时模型：
 * - 开始：accumulatedMs = 0，lastResumeAt = now，status = running；
 * - 暂停：accumulatedMs += now - lastResumeAt；
 * - 继续：lastResumeAt = now；
 * - 完成 / 放弃：先结算当前段，再生成 FocusSession 与活动事件标题。
 */
import type { FocusSession, RunningFocus } from './types';

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
