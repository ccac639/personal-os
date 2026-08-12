/**
 * 子任务（checklist）纯函数（可单测）
 *
 * 约定：子任务完成状态计入任务进度（卡片上的进度指示），
 * 但【不】改变父任务在看板中的所属列（列由父任务 status 决定）。
 */
import type { SubTask, TaskItem } from './types';

export interface SubtaskStats {
  total: number;
  done: number;
  /** 完成率 0-100；无子任务时为 0 */
  progress: number;
  /** 是否全部完成（无子任务时视为 false） */
  allDone: boolean;
}

export function subtaskStats(task: Pick<TaskItem, 'subtasks'>): SubtaskStats {
  const total = task.subtasks.length;
  const done = task.subtasks.filter((s) => s.done).length;
  return {
    total,
    done,
    progress: total === 0 ? 0 : Math.round((done / total) * 100),
    allDone: total > 0 && done === total,
  };
}

export function addSubtaskTo(task: TaskItem, title: string, now: string): SubTask {
  return {
    id: `s-${now.replace(/\D/g, '').slice(-8)}-${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim(),
    done: false,
  };
}
