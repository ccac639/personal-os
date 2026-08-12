import { describe, expect, it } from 'vitest';

import { parseProjectBundle, serializeProjectBundle } from '@/features/projects/transfer';
import type {
  Milestone,
  ProjectActivity,
  ProjectDetail,
  Retrospective,
} from '@/features/projects/types';
import type { TaskItem } from '@/features/tasks/types';

function makeProject(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-old',
    name: '旧项目',
    description: undefined,
    status: 'active',
    ownerId: 'me',
    tags: [],
    techStack: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    favorite: true,
    progressMode: 'auto',
    ...over,
  };
}

function makeTask(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't-1',
    projectId: 'p-old',
    title: '任务',
    description: undefined,
    status: 'todo',
    priority: 'medium',
    dueDate: undefined,
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    tags: [],
    order: 0,
    subtasks: [],
    dependsOn: [],
    ...over,
  };
}

function makeMilestone(over: Partial<Milestone> = {}): Milestone {
  return {
    id: 'ms-1',
    projectId: 'p-old',
    title: '里程碑',
    status: 'in-progress',
    order: 0,
    taskIds: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

function makeActivity(over: Partial<ProjectActivity> = {}): ProjectActivity {
  return {
    id: 'a-1',
    projectId: 'p-old',
    type: 'created',
    title: '创建项目',
    createdAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

describe('项目包导入 / 导出安全处理', () => {
  it('serializeProjectBundle：带 kind 标记的可往返 JSON', () => {
    const text = serializeProjectBundle({
      project: makeProject(),
      tasks: [makeTask()],
      milestones: [],
      activities: [],
      retrospective: null,
    });
    const parsed = JSON.parse(text);
    expect(parsed.kind).toBe('personal-os-project');
    expect(parsed.data.project.name).toBe('旧项目');
  });

  it('parseProjectBundle：非法 JSON / 缺少 kind / 项目元数据非法 → 可读原因', () => {
    expect(parseProjectBundle('{broken').ok).toBe(false);
    expect(parseProjectBundle('{"data": {}}').ok).toBe(false);
    const noKind = parseProjectBundle(JSON.stringify({ data: { project: makeProject() } }));
    expect(noKind.ok).toBe(false);
    const badProject = parseProjectBundle(
      JSON.stringify({ kind: 'personal-os-project', data: { project: { id: 1 } } }),
    );
    expect(badProject.ok).toBe(false);
  });

  it('parseProjectBundle：重新生成所有 id，内部引用重映射，收藏重置', () => {
    const text = serializeProjectBundle({
      project: makeProject({ favorite: true }),
      tasks: [
        makeTask({ id: 't-a', title: '任务A' }),
        makeTask({ id: 't-b', title: '任务B', dependsOn: ['t-a'] }),
      ],
      milestones: [makeMilestone({ taskIds: ['t-a', 't-b'] })],
      activities: [makeActivity()],
      retrospective: {
        projectId: 'p-old',
        done: 'D',
        blockers: '',
        next: '',
        lessons: '',
        updatedAt: 'x',
      } as Retrospective,
    });
    const result = parseProjectBundle(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { bundle } = result;
    const newProjectId = bundle.data.project.id;
    expect(newProjectId).not.toBe('p-old');
    expect(bundle.data.project.favorite).toBe(false);
    // 任务与里程碑全部归属新项目 id，依赖已重映射
    expect(bundle.data.tasks.every((t) => t.projectId === newProjectId)).toBe(true);
    const b = bundle.data.tasks.find((t) => t.title === '任务B')!;
    const a = bundle.data.tasks.find((t) => t.title === '任务A')!;
    expect(b.dependsOn).toEqual([a.id]);
    expect(bundle.data.milestones[0]!.projectId).toBe(newProjectId);
    expect(bundle.data.milestones[0]!.taskIds).toHaveLength(2);
    expect(bundle.data.activities[0]!.projectId).toBe(newProjectId);
    expect(bundle.data.retrospective!.projectId).toBe(newProjectId);
  });

  it('parseProjectBundle：清理悬空引用与循环依赖', () => {
    const text = serializeProjectBundle({
      project: makeProject(),
      tasks: [
        makeTask({ id: 't-a', dependsOn: ['t-b'] }),
        makeTask({ id: 't-b', dependsOn: ['t-a'] }),
        makeTask({ id: 't-c', dependsOn: ['t-ghost'] }),
      ],
      milestones: [makeMilestone({ taskIds: ['t-ghost', 't-a'] })],
      activities: [],
      retrospective: null,
    });
    const result = parseProjectBundle(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.removedCycles).toBeGreaterThanOrEqual(1);
    expect(result.report.cleanedDeps).toBeGreaterThanOrEqual(1);
    expect(result.report.cleanedMilestoneRefs).toBeGreaterThanOrEqual(1);
    const ids = new Set(result.bundle.data.tasks.map((t) => t.id));
    expect(result.bundle.data.milestones[0]!.taskIds.every((id) => ids.has(id))).toBe(true);
  });

  it('parseProjectBundle：非法任务条目跳过并报告', () => {
    const text = JSON.stringify({
      kind: 'personal-os-project',
      version: 1,
      exportedAt: 'x',
      data: {
        project: makeProject(),
        tasks: [{ garbage: true }, makeTask({ id: 'ok' })],
        milestones: [],
        activities: [],
        retrospective: null,
      },
    });
    const result = parseProjectBundle(text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.skippedInvalid).toBe(1);
    expect(result.bundle.data.tasks).toHaveLength(1);
  });
});

describe('快照 JSON 解析（导入校验）', () => {
  it('parseSnapshotJson：合法快照可原样导回，错误 JSON / 结构非法被拒绝', async () => {
    const { parseSnapshotJson, serializeSnapshot } =
      await import('@/features/projects/persistence');
    // 错误 JSON
    expect(parseSnapshotJson('{broken').ok).toBe(false);
    // 结构非法
    expect(parseSnapshotJson('{"a":1}').ok).toBe(false);

    // 构造合法快照 → 序列化 → 解析回
    const snapshot = {
      id: 'snap-1',
      projectId: 'p-old',
      createdAt: '2026-08-01T00:00:00+08:00',
      data: {
        project: makeProject(),
        tasks: [makeTask()],
        milestones: [makeMilestone()],
        activities: [makeActivity()],
        retrospective: null,
      },
    };
    const text = serializeSnapshot(snapshot);
    const parsed = parseSnapshotJson(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.snapshot.id).toBe('snap-1');
      expect(parsed.snapshot.data.tasks).toHaveLength(1);
      expect(parsed.snapshot.data.milestones).toHaveLength(1);
    }
  });
});
