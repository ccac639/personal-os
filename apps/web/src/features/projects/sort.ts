/**
 * 项目排序纯函数（可单测，不依赖 store）
 */
import type { ProjectDetail, ProjectSortKey } from './types';

export type SortDir = 'asc' | 'desc';

/** 排序所需的外部度量：项目 id → 数值（进度 / 未完成任务数） */
export interface ProjectMetrics {
  /** 项目 id → 有效进度 0-100（自动或手动） */
  progress: ReadonlyMap<string, number>;
  /** 项目 id → 未完成任务数 */
  unfinished: ReadonlyMap<string, number>;
}

const EMPTY_METRICS: ProjectMetrics = { progress: new Map(), unfinished: new Map() };

function byString(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * 按排序键排序项目列表（纯函数，不修改原数组）。
 * - updatedAt / createdAt / name：字符串比较；
 * - progress：外部传入的有效进度；
 * - tasks：外部传入的未完成任务数；
 * - 相同键时以 updatedAt 降序、id 升序兜底，保证稳定可复现。
 */
export function sortProjects(
  list: ProjectDetail[],
  key: ProjectSortKey,
  dir: SortDir,
  metrics: ProjectMetrics = EMPTY_METRICS,
): ProjectDetail[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => {
    let r = 0;
    if (key === 'name') {
      r = byString(a.name.toLowerCase(), b.name.toLowerCase());
    } else if (key === 'progress') {
      const pa = metrics.progress.get(a.id) ?? 0;
      const pb = metrics.progress.get(b.id) ?? 0;
      r = pa - pb;
    } else if (key === 'tasks') {
      const ta = metrics.unfinished.get(a.id) ?? 0;
      const tb = metrics.unfinished.get(b.id) ?? 0;
      r = ta - tb;
    } else {
      // updatedAt / createdAt
      r = byString(a[key], b[key]);
    }
    if (r !== 0) return r * factor;
    // 兜底：更新时间降序，再按 id 稳定
    const byUpdated = byString(b.updatedAt, a.updatedAt);
    return byUpdated !== 0 ? byUpdated : byString(a.id, b.id);
  });
}
