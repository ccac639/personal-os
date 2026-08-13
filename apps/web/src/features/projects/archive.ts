/**
 * 项目归档 / 恢复 —— 跨 store 编排（纯函数式组合，保持可测试）
 *
 * 归档预检摘要、归档（可选项：任务转入收件箱）、自动轻量快照、
 * 撤销一次、显式恢复。
 *
 * 注意：本模块不新建状态模型，仅组合 projectStore / taskStore / releaseStore /
 * knowledgeStore / weeklyGoalStore 的既有能力。
 */
import { buildSnapshot } from './health';
import type { useProjectStore } from './store';
import type { useTaskStore } from '@/features/tasks/store';
import type { useReleaseStore } from './release-store';
import type { useKnowledgeStore } from './knowledge-store';
import type { useWeeklyGoalStore } from './weekly-goals-store';
import { todayPlanRows } from './execution';
import type { ReleaseChecklist, ReleaseRecord } from './releases';

type ProjectStore = ReturnType<typeof useProjectStore>;
type TaskStore = ReturnType<typeof useTaskStore>;
type ReleaseStore = ReturnType<typeof useReleaseStore>;
type KnowledgeStore = ReturnType<typeof useKnowledgeStore>;
type WeeklyGoalStore = ReturnType<typeof useWeeklyGoalStore>;

export interface ArchivePreview {
  projectId: string;
  /** 未完成任务数 */
  unfinishedTasks: number;
  /** 受阻任务数 */
  blockedTasks: number;
  /** 未完成里程碑数 */
  openMilestones: number;
  /** 今日计划项数（未勾选） */
  planItems: number;
  /** 未完成发布检查单数 */
  openChecklists: number;
  /** 发布记录数（已归档的不可再改） */
  records: number;
  /** 知识条目数 */
  knowledge: number;
  /** 是否存在未完成任务（决定是否提示转入收件箱） */
  hasUnfinished: boolean;
  hasPlan: boolean;
  hasOpenChecklists: boolean;
}

/** 归档预检摘要（纯函数，无副作用） */
export function archivePreview(
  projectStore: ProjectStore,
  taskStore: TaskStore,
  releaseStore: ReleaseStore,
  knowledgeStore: KnowledgeStore,
  projectId: string,
  today: string,
): ArchivePreview {
  void today;
  const tasks = taskStore.tasksByProject(projectId);
  const unfinishedTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const blockedTasks = unfinishedTasks.filter((t) => taskStore.isBlockedTask(t.id));
  const openMilestones = projectStore.milestonesOf(projectId).filter((m) => m.status !== 'done');
  const planItems = todayPlanRows(taskStore.focus, taskStore.focusDone).filter(
    (p) => !p.done && tasks.some((t) => t.id === p.taskId),
  );
  const openChecklists = releaseStore.checklistsOf(projectId).filter((c) => c.status === 'draft');
  const records = releaseStore.recordsOf(projectId);
  const knowledge = knowledgeStore.entriesOf(projectId);
  return {
    projectId,
    unfinishedTasks: unfinishedTasks.length,
    blockedTasks: blockedTasks.length,
    openMilestones: openMilestones.length,
    planItems: planItems.length,
    openChecklists: openChecklists.length,
    records: records.length,
    knowledge: knowledge.length,
    hasUnfinished: unfinishedTasks.length > 0,
    hasPlan: planItems.length > 0,
    hasOpenChecklists: openChecklists.length > 0,
  };
}

export interface ArchiveOptions {
  /** 未完成任务转入收件箱后再归档（否则任务保留在归档项目内只读） */
  moveToInbox?: boolean;
  /** 归档时间（ISO；默认 now） */
  now?: string;
}

/** 执行归档：自动创建轻量快照 → （可选）任务转入收件箱 → 置为 archived */
export function archiveProjectWithTasks(
  projectStore: ProjectStore,
  taskStore: TaskStore,
  releaseStore: ReleaseStore,
  knowledgeStore: KnowledgeStore,
  weeklyGoalStore: WeeklyGoalStore,
  projectId: string,
  opts: ArchiveOptions = {},
): { ok: boolean; movedTasks: number; snapshotId: string } {
  void releaseStore;
  void knowledgeStore;
  void weeklyGoalStore;
  const p = projectStore.projectById(projectId);
  if (!p || p.status === 'archived') return { ok: false, movedTasks: 0, snapshotId: '' };
  const now = opts.now ?? new Date().toISOString();

  // 1) 自动轻量快照（不覆盖既有手动快照能力，仅新增一条）
  const snapshot = buildSnapshot({
    project: p,
    tasks: taskStore.tasksByProject(projectId),
    milestones: projectStore.milestonesOf(projectId),
    activities: projectStore.projectActivities(projectId),
    retrospective: projectStore.retrospectiveOf(projectId),
    now,
  });
  projectStore.addSnapshot(snapshot);

  // 2) 可选：任务转入收件箱（可撤销一次）
  let movedTasks = 0;
  if (opts.moveToInbox) {
    movedTasks = taskStore.moveProjectTasksToInbox(projectId);
  }

  // 3) 归档
  projectStore.archiveProject(projectId, { movedToInbox: opts.moveToInbox });
  return { ok: true, movedTasks, snapshotId: snapshot.id };
}

/** 撤销最近一次归档（恢复状态；若当时转入收件箱则一并撤销任务移动） */
export function undoArchiveWithTasks(projectStore: ProjectStore, taskStore: TaskStore): boolean {
  const rec = projectStore.archiveUndo;
  if (!rec) return false;
  const ok = projectStore.undoArchive();
  if (ok && rec.movedToInbox) {
    taskStore.undo();
  }
  return ok;
}

/** 显式恢复（只读 → 可编辑） */
export function restoreProjectWithTasks(
  projectStore: ProjectStore,
  taskStore: TaskStore,
  projectId: string,
): boolean {
  void taskStore;
  const p = projectStore.projectById(projectId);
  if (!p || p.status !== 'archived') return false;
  projectStore.restoreProject(projectId);
  return true;
}

/** 删除项目（永久）：级联删除或任务转入收件箱 */
export function deleteProjectWithTasks(
  projectStore: ProjectStore,
  taskStore: TaskStore,
  knowledgeStore: KnowledgeStore,
  weeklyGoalStore: WeeklyGoalStore,
  projectId: string,
  mode: 'cascade' | 'to-inbox',
): void {
  knowledgeStore.deleteByProject(projectId);
  weeklyGoalStore.deleteByProject(projectId);
  taskStore.removeByProject(projectId, mode);
  projectStore.deleteProject(projectId);
}

/** 发布记录摘要（复盘视图用；不修改 Achievements 模块） */
export function releaseSummaryForRetro(
  releaseStore: ReleaseStore,
  projectId: string,
): { checklists: ReleaseChecklist[]; records: ReleaseRecord[] } {
  return {
    checklists: releaseStore.checklistsOf(projectId).filter((c) => c.status === 'draft'),
    records: releaseStore.recordsOf(projectId),
  };
}
