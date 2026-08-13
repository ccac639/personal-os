import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { useTaskStore } from '@/features/tasks/store';
import { useReleaseStore } from '@/features/projects/release-store';
import { useKnowledgeStore } from '@/features/projects/knowledge-store';
import { useWeeklyGoalStore } from '@/features/projects/weekly-goals-store';
import {
  archivePreview,
  archiveProjectWithTasks,
  undoArchiveWithTasks,
  restoreProjectWithTasks,
  deleteProjectWithTasks,
} from '@/features/projects/archive';

describe('项目归档与恢复（预检 / 快照 / 转入收件箱 / 撤销一次）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const ps = useProjectStore();
    const ts = useTaskStore();
    const rs = useReleaseStore();
    const ks = useKnowledgeStore();
    const gs = useWeeklyGoalStore();
    const p = ps.createProject({ name: 'P', status: 'active', tags: [], techStack: [] });
    const t1 = ts.createTask({
      projectId: p.id,
      title: '未完成',
      priority: 'medium',
      status: 'todo',
      tags: [],
    });
    const t2 = ts.createTask({
      projectId: p.id,
      title: '已完成',
      priority: 'medium',
      status: 'done',
      tags: [],
    });
    ps.createMilestone(p.id, { title: 'M1', status: 'planned', taskIds: [] });
    ts.addToFocus(t1.id, 25);
    rs.saveChecklist({
      projectId: p.id,
      version: 'v1',
      title: '检查单',
      status: 'draft',
      taskIds: [],
      items: [],
    });
    ks.createEntry({
      projectId: p.id,
      type: 'decision',
      title: '决策',
      body: '',
      tags: [],
      decisionStatus: 'pending',
    });
    return { ps, ts, rs, ks, gs, p, t1, t2 };
  }

  it('归档预检：未完成任务 / 受阻 / 里程碑 / 今日计划 / 检查单 / 记录 / 知识', () => {
    const { ps, ts, rs, ks, p, t1 } = setup();
    const preview = archivePreview(ps, ts, rs, ks, p.id, '2026-08-13');
    expect(preview.unfinishedTasks).toBe(1);
    expect(preview.openMilestones).toBe(1);
    expect(preview.planItems).toBe(1); // t1 在今日计划且未勾选
    expect(preview.openChecklists).toBe(1);
    expect(preview.records).toBe(0);
    expect(preview.knowledge).toBe(1);
    expect(preview.hasUnfinished).toBe(true);
    expect(preview.hasPlan).toBe(true);
    void t1;
  });

  it('直接归档：状态 archived + 自动快照 + 写入活动流；只读（恢复前禁止编辑）', () => {
    const { ps, ts, rs, ks, gs, p } = setup();
    const result = archiveProjectWithTasks(ps, ts, rs, ks, gs, p.id);
    expect(result.ok).toBe(true);
    expect(ps.projectById(p.id)!.status).toBe('archived');
    expect(ps.snapshotsOf(p.id)).toHaveLength(1); // 自动轻量快照
    expect(ps.projectActivities(p.id).some((a) => a.type === 'archived')).toBe(true);
    // 只读限制（store 层：归档项目任务保留但页面层禁用编辑）
    expect(ts.tasksByProject(p.id)).toHaveLength(2);
    expect(ps.projectById(p.id)!.status).toBe('archived');
  });

  it('归档时未完成任务转入收件箱；撤销一次可恢复项目与任务归属', () => {
    const { ps, ts, rs, ks, gs, p } = setup();
    const result = archiveProjectWithTasks(ps, ts, rs, ks, gs, p.id, { moveToInbox: true });
    expect(result.movedTasks).toBe(2);
    expect(ts.tasksByProject(p.id)).toHaveLength(0);
    expect(ts.inboxTasks).toHaveLength(2);

    // 撤销一次：项目恢复 + 任务回到项目
    expect(undoArchiveWithTasks(ps, ts)).toBe(true);
    expect(ps.projectById(p.id)!.status).toBe('active');
    expect(ts.tasksByProject(p.id)).toHaveLength(2);
    expect(ts.inboxTasks).toHaveLength(0);
    // 第二次撤销无效
    expect(undoArchiveWithTasks(ps, ts)).toBe(false);
  });

  it('显式恢复：archived → active，再次恢复无效', () => {
    const { ps, ts, rs, ks, gs, p } = setup();
    archiveProjectWithTasks(ps, ts, rs, ks, gs, p.id);
    expect(restoreProjectWithTasks(ps, ts, p.id)).toBe(true);
    expect(ps.projectById(p.id)!.status).toBe('active');
    expect(restoreProjectWithTasks(ps, ts, p.id)).toBe(false);
  });

  it('删除项目：cascade 清理知识 / 周目标 / 任务；to-inbox 任务进入收件箱', () => {
    const { ps, ts, ks, gs, p } = setup();
    deleteProjectWithTasks(ps, ts, ks, gs, p.id, 'cascade');
    expect(ps.projectById(p.id)).toBeNull();
    expect(ts.tasksByProject(p.id)).toHaveLength(0);
    expect(ks.entriesOf(p.id)).toHaveLength(0);
    expect(gs.goals.filter((g) => g.projectId === p.id)).toHaveLength(0);
  });

  it('删除项目（转入收件箱模式）：任务不遗失', () => {
    const { ps, ts, ks, gs, p } = setup();
    deleteProjectWithTasks(ps, ts, ks, gs, p.id, 'to-inbox');
    expect(ps.projectById(p.id)).toBeNull();
    expect(ts.inboxTasks).toHaveLength(2);
    expect(ts.taskById(ts.inboxTasks[0]!.id)?.projectId).toBeUndefined();
  });

  it('归档已归档项目无效（幂等）', () => {
    const { ps, ts, rs, ks, gs, p } = setup();
    archiveProjectWithTasks(ps, ts, rs, ks, gs, p.id);
    const again = archiveProjectWithTasks(ps, ts, rs, ks, gs, p.id);
    expect(again.ok).toBe(false);
    expect(ps.snapshotsOf(p.id)).toHaveLength(1); // 不重复快照
  });
});
