/**
 * 任务估时 / 实际投入 / 项目偏差 —— 纯函数（可单测，不依赖 store）
 *
 * 模型：
 * - 任务估时 = estimatedMinutes（表单填写）；
 * - 任务实际投入 = actualMinutes（专注完成自动累加，可手动覆盖）；
 * - 项目偏差 = Σ估时 - Σ实际（分钟），有估时任务才参与统计。
 */
import type { FocusSession, TaskItem } from './types';

export interface TaskEstimateInfo {
  /** 估时（分钟，未设置为 null） */
  estimatedMinutes: number | null;
  /** 实际投入（分钟；专注 + 手动） */
  actualMinutes: number;
  /** 偏差分钟数（估时 - 实际；无估时为 null） */
  varianceMinutes: number | null;
}

export interface ProjectEstimateSummary {
  /** 设置了估时的任务数 */
  estimatedCount: number;
  /** Σ估时（分钟） */
  estimatedMinutes: number;
  /** Σ实际投入（分钟；专注 + 手动，覆盖全部未取消任务） */
  actualMinutes: number;
  /** 偏差（估时 - 实际；无估时任务时为 null） */
  varianceMinutes: number | null;
  /** 偏差方向：ahead=实际少于估时 / behind=实际超出估时 / on-track */
  varianceDirection: 'ahead' | 'behind' | 'on-track' | 'none';
}

/** 单任务实际投入 = 手动记录 + 专注分钟（纯函数） */
export function taskActualMinutes(task: TaskItem, focusSessions: FocusSession[]): number {
  const focus = focusSessions
    .filter((s) => s.taskId === task.id)
    .reduce((sum, s) => sum + s.minutes, 0);
  return (task.actualMinutes ?? 0) + focus;
}

/** 单任务估时信息（纯函数） */
export function taskEstimate(task: TaskItem, focusSessions: FocusSession[]): TaskEstimateInfo {
  const estimated =
    task.estimatedMinutes != null &&
    Number.isFinite(task.estimatedMinutes) &&
    task.estimatedMinutes >= 0
      ? Math.round(task.estimatedMinutes)
      : null;
  const actual = taskActualMinutes(task, focusSessions);
  return {
    estimatedMinutes: estimated,
    actualMinutes: actual,
    varianceMinutes: estimated === null ? null : estimated - actual,
  };
}

/** 项目估时汇总（纯函数；已取消任务不计实际投入） */
export function estimateSummary(
  tasks: TaskItem[],
  focusSessions: FocusSession[],
): ProjectEstimateSummary {
  const active = tasks.filter((t) => t.status !== 'cancelled');
  const estimatedTasks = active.filter(
    (t) =>
      t.estimatedMinutes != null && Number.isFinite(t.estimatedMinutes) && t.estimatedMinutes >= 0,
  );
  const estimatedMinutes = estimatedTasks.reduce(
    (sum, t) => sum + Math.round(t.estimatedMinutes!),
    0,
  );
  const actualMinutes = active.reduce((sum, t) => sum + taskActualMinutes(t, focusSessions), 0);
  if (estimatedTasks.length === 0) {
    return {
      estimatedCount: 0,
      estimatedMinutes: 0,
      actualMinutes,
      varianceMinutes: null,
      varianceDirection: 'none',
    };
  }
  const varianceMinutes = estimatedMinutes - actualMinutes;
  const direction = varianceMinutes > 30 ? 'ahead' : varianceMinutes < -30 ? 'behind' : 'on-track';
  return {
    estimatedCount: estimatedTasks.length,
    estimatedMinutes,
    actualMinutes,
    varianceMinutes,
    varianceDirection: direction,
  };
}

/** 分钟 → 人类可读（如「2.5 小时」） */
export function formatHoursShort(minutes: number): string {
  if (minutes <= 0) return '0 分钟';
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h} 小时` : `${Math.round(h * 10) / 10} 小时`;
}
