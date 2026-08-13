/**
 * 周目标 —— 独立持久化 repository
 *
 * 独立 key + 信封（v1）：周目标列表（含历史，自动裁剪到 WEEKLY_GOAL_HISTORY_LIMIT）。
 * 损坏 / 版本过新时降级为空列表并给出非阻塞提示。
 */
import { readEnvelope, writeEnvelope, isPlainObject, type SaveResult } from './persistence';
import { trimWeeklyGoalHistory, WEEKLY_GOAL_HISTORY_LIMIT, type WeeklyGoal } from './execution';

export const WEEKLY_GOALS_VERSION = 1;
export const WEEKLY_GOALS_KEY = 'personal-os.weekly-goals.v1';

export interface LoadWeeklyGoalsResult {
  data: WeeklyGoal[];
  notice: string | null;
}

function normalizeGoal(raw: unknown): WeeklyGoal | null {
  if (!isPlainObject(raw)) return null;
  const g = raw;
  if (
    typeof g.id !== 'string' ||
    typeof g.projectId !== 'string' ||
    typeof g.weekStart !== 'string' ||
    /^\d{4}-\d{2}-\d{2}$/.test(g.weekStart) === false ||
    typeof g.description !== 'string' ||
    typeof g.targetTasks !== 'number' ||
    !Number.isFinite(g.targetTasks) ||
    g.targetTasks < 0 ||
    typeof g.targetFocusMinutes !== 'number' ||
    !Number.isFinite(g.targetFocusMinutes) ||
    g.targetFocusMinutes < 0
  ) {
    return null;
  }
  return {
    id: g.id,
    projectId: g.projectId,
    weekStart: g.weekStart,
    description: g.description,
    targetTasks: Math.round(g.targetTasks),
    targetFocusMinutes: Math.round(g.targetFocusMinutes),
    createdAt: typeof g.createdAt === 'string' ? g.createdAt : new Date().toISOString(),
    updatedAt: typeof g.updatedAt === 'string' ? g.updatedAt : new Date().toISOString(),
  };
}

function normalizeList(raw: unknown): WeeklyGoal[] | null {
  if (!Array.isArray(raw)) return null;
  const out: WeeklyGoal[] = [];
  for (const item of raw) {
    const n = normalizeGoal(item);
    if (n === null) return null;
    out.push(n);
  }
  return out;
}

export function loadWeeklyGoalsData(): LoadWeeklyGoalsResult {
  const outcome = readEnvelope(WEEKLY_GOALS_KEY, WEEKLY_GOALS_VERSION, normalizeList);
  if (outcome.status === 'ok') return { data: outcome.data, notice: null };
  if (outcome.status === 'newer') {
    return { data: [], notice: '本地周目标数据版本过新，已使用空数据，请升级应用' };
  }
  if (outcome.status === 'corrupt') {
    return { data: [], notice: '本地周目标数据损坏，已重置为空数据' };
  }
  return { data: [], notice: null };
}

export function saveWeeklyGoalsData(goals: WeeklyGoal[]): SaveResult {
  return writeEnvelope(
    WEEKLY_GOALS_KEY,
    WEEKLY_GOALS_VERSION,
    trimWeeklyGoalHistory(goals, WEEKLY_GOAL_HISTORY_LIMIT),
  );
}
