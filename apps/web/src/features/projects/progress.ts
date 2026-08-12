/**
 * 项目进度纯函数（可单测）
 *
 * 进度来源：
 * - auto：任务完成比例（taskStore.projectStats().progress）；
 * - manual：手动设置的 manualProgress；
 * 切换模式时，调用方应以当前有效进度初始化 manualProgress，避免数据跳变。
 */
import type { ProjectDetail, ProjectProgressMode } from './types';

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 当前生效的进度值（0-100） */
export function effectiveProgress(
  project: Pick<ProjectDetail, 'progressMode' | 'manualProgress'>,
  taskProgress: number,
): number {
  if (project.progressMode === 'manual') {
    return clampProgress(project.manualProgress ?? 0);
  }
  return clampProgress(taskProgress);
}

/** 切换进度模式；切到手动时用当前有效进度初始化，避免数据跳变；切回自动时保留手动值 */
export function withProgressMode(
  project: Pick<ProjectDetail, 'progressMode' | 'manualProgress'>,
  mode: ProjectProgressMode,
  taskProgress: number,
): { progressMode: ProjectProgressMode; manualProgress?: number } {
  if (mode === 'auto') {
    // 保留 manualProgress，切回手动时可接续上次手动值（自动模式下不参与计算）
    return { progressMode: 'auto', manualProgress: project.manualProgress };
  }
  const current = effectiveProgress(project, taskProgress);
  return { progressMode: 'manual', manualProgress: current };
}
