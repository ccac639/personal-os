/**
 * 周目标 —— Pinia store（独立边界）
 *
 * 每项目每周一个目标（本周目标 + 历史），独立持久化（weekly-goals-persistence）。
 * 历史自动裁剪到 WEEKLY_GOAL_HISTORY_LIMIT。
 */
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

import { loadWeeklyGoalsData, saveWeeklyGoalsData } from './weekly-goals-persistence';
import { weekStartOf, type WeeklyGoal } from './execution';

function uid(): string {
  return `wg-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export const useWeeklyGoalStore = defineStore('weekly-goals', () => {
  const initial = loadWeeklyGoalsData();
  const goals = ref<WeeklyGoal[]>(initial.data);
  const storageWarning = ref<string | null>(initial.notice);

  watch(
    goals,
    () => {
      const saved = saveWeeklyGoalsData(goals.value);
      if (!saved.ok) storageWarning.value = saved.reason ?? '本地存储写入失败';
    },
    { deep: true, flush: 'sync' },
  );

  /** 某项目某周（周一）的目标 */
  function goalOf(projectId: string, weekStart: string): WeeklyGoal | null {
    return goals.value.find((g) => g.projectId === projectId && g.weekStart === weekStart) ?? null;
  }

  /** 本周目标（基于 today 所在周） */
  function currentGoalOf(projectId: string, today: string): WeeklyGoal | null {
    return goalOf(projectId, weekStartOf(today));
  }

  /** 历史周目标（不含本周，按周倒序） */
  function historyOf(projectId: string, today: string): WeeklyGoal[] {
    const week = weekStartOf(today);
    return goals.value
      .filter((g) => g.projectId === projectId && g.weekStart < week)
      .sort((a, b) => (a.weekStart < b.weekStart ? 1 : -1));
  }

  /** 新建 / 更新（upsert：同项目同周覆盖） */
  function setGoal(input: {
    projectId: string;
    weekStart: string;
    description: string;
    targetTasks: number;
    targetFocusMinutes: number;
  }): WeeklyGoal {
    const now = new Date().toISOString();
    const existing = goalOf(input.projectId, input.weekStart);
    if (existing) {
      existing.description = input.description.trim();
      existing.targetTasks = Math.max(0, Math.round(input.targetTasks));
      existing.targetFocusMinutes = Math.max(0, Math.round(input.targetFocusMinutes));
      existing.updatedAt = now;
      return existing;
    }
    const goal: WeeklyGoal = {
      id: uid(),
      projectId: input.projectId,
      weekStart: input.weekStart,
      description: input.description.trim(),
      targetTasks: Math.max(0, Math.round(input.targetTasks)),
      targetFocusMinutes: Math.max(0, Math.round(input.targetFocusMinutes)),
      createdAt: now,
      updatedAt: now,
    };
    goals.value.push(goal);
    return goal;
  }

  function deleteGoal(id: string): void {
    goals.value = goals.value.filter((g) => g.id !== id);
  }

  function deleteByProject(projectId: string): void {
    goals.value = goals.value.filter((g) => g.projectId !== projectId);
  }

  function dismissStorageWarning(): void {
    storageWarning.value = null;
  }

  return {
    goals,
    storageWarning,
    goalOf,
    currentGoalOf,
    historyOf,
    setGoal,
    deleteGoal,
    deleteByProject,
    dismissStorageWarning,
  };
});
