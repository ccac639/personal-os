import { describe, expect, it } from 'vitest';

import { buildRiskRules } from '@/features/projects/health';
import type { RiskRuleInput } from '@/features/projects/health';
import type { Milestone, ProjectDetail } from '@/features/projects/types';
import type { FocusSession, TaskItem } from '@/features/tasks/types';

function makeProject(over: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-1',
    name: '测试项目',
    description: undefined,
    status: 'active',
    ownerId: 'me',
    tags: [],
    techStack: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    favorite: false,
    progressMode: 'auto',
    startDate: '2026-08-01',
    targetDate: '2026-09-30',
    ...over,
  };
}

function makeTask(over: Partial<TaskItem> = {}): TaskItem {
  return {
    id: 't-1',
    projectId: 'p-1',
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
    projectId: 'p-1',
    title: '里程碑',
    status: 'in-progress',
    order: 0,
    taskIds: [],
    createdAt: '2026-08-01T00:00:00+08:00',
    updatedAt: '2026-08-01T00:00:00+08:00',
    ...over,
  };
}

function makeSession(over: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 's',
    taskId: 't-1',
    startedAt: '2026-08-13T10:00:00+08:00',
    endedAt: '2026-08-13T10:25:00+08:00',
    minutes: 25,
    status: 'completed',
    ...over,
  };
}

const TODAY = '2026-08-13';

function baseInput(over: Partial<RiskRuleInput> = {}): RiskRuleInput {
  return {
    project: makeProject(),
    tasks: [],
    milestones: [],
    activities: [],
    focusSessions: [],
    today: TODAY,
    latestActivityAt: '2026-08-13T09:00:00+08:00',
    ...over,
  };
}

describe('项目健康风险规则', () => {
  it('进度落后：目标日期已过且项目未完成', () => {
    const input = baseInput({
      project: makeProject({ targetDate: '2026-08-10' }),
    });
    const rules = buildRiskRules(input);
    expect(rules.some((r) => r.key === 'progress-behind' && r.level === 'danger')).toBe(true);
  });

  it('进度落后不误报：目标日期已过但项目已完成 / 完成率 100%', () => {
    for (const p of [
      makeProject({ targetDate: '2026-08-10', status: 'completed' }),
      makeProject({ targetDate: '2026-08-10', status: 'archived' }),
    ]) {
      const rules = buildRiskRules(baseInput({ project: p }));
      expect(rules.some((r) => r.key === 'progress-behind')).toBe(false);
    }
    const done100 = buildRiskRules(
      baseInput({
        project: makeProject({ targetDate: '2026-08-10' }),
        tasks: [makeTask({ status: 'done' })],
      }),
    );
    expect(done100.some((r) => r.key === 'progress-behind')).toBe(false);
  });

  it('临近截止：目标日期或里程碑 7 天内到期', () => {
    const target = buildRiskRules(
      baseInput({ project: makeProject({ targetDate: '2026-08-18' }) }),
    );
    expect(target.some((r) => r.key === 'deadline-soon')).toBe(true);

    const ms = buildRiskRules(
      baseInput({
        project: makeProject({ targetDate: undefined }),
        milestones: [makeMilestone({ dueDate: '2026-08-15' })],
      }),
    );
    expect(ms.some((r) => r.key === 'deadline-soon' && r.detail.includes('里程碑'))).toBe(true);

    const far = buildRiskRules(baseInput({ project: makeProject({ targetDate: '2026-09-01' }) }));
    expect(far.some((r) => r.key === 'deadline-soon')).toBe(false);
  });

  it('长期无活动：无活动记录但有数据 / 最近活动超过 14 天', () => {
    const none = buildRiskRules(
      baseInput({
        latestActivityAt: null,
        tasks: [makeTask()],
      }),
    );
    expect(none.some((r) => r.key === 'stale')).toBe(true);

    const old = buildRiskRules(baseInput({ latestActivityAt: '2026-07-20T09:00:00+08:00' }));
    expect(old.some((r) => r.key === 'stale' && r.detail.includes('24 天'))).toBe(true);

    const fresh = buildRiskRules(baseInput({ latestActivityAt: '2026-08-10T09:00:00+08:00' }));
    expect(fresh.some((r) => r.key === 'stale')).toBe(false);
  });

  it('阻塞任务：存在未完成前置', () => {
    const input = baseInput({
      tasks: [
        makeTask({ id: 'a', status: 'todo' }),
        makeTask({ id: 'b', status: 'todo', dependsOn: ['a'] }),
      ],
    });
    const rules = buildRiskRules(input);
    expect(rules.some((r) => r.key === 'blocked' && r.detail.includes('1 个'))).toBe(true);

    // 前置完成 → 不阻塞
    const resolved = buildRiskRules(
      baseInput({
        tasks: [
          makeTask({ id: 'a', status: 'done' }),
          makeTask({ id: 'b', status: 'todo', dependsOn: ['a'] }),
        ],
      }),
    );
    expect(resolved.some((r) => r.key === 'blocked')).toBe(false);
  });

  it('专注偏差：有估时任务且实际投入明显低于估时（>50%）', () => {
    const input = baseInput({
      tasks: [makeTask({ id: 'a', estimatedMinutes: 120 })],
      focusSessions: [makeSession({ taskId: 'a', minutes: 30 })],
    });
    const rules = buildRiskRules(input);
    expect(rules.some((r) => r.key === 'focus-drift')).toBe(true);

    // 投入充足 → 不触发
    const ok = buildRiskRules(
      baseInput({
        tasks: [makeTask({ id: 'a', estimatedMinutes: 120 })],
        focusSessions: [makeSession({ taskId: 'a', minutes: 100 })],
      }),
    );
    expect(ok.some((r) => r.key === 'focus-drift')).toBe(false);
  });

  it('全部正常：空数据项目不输出虚假风险', () => {
    const rules = buildRiskRules(
      baseInput({
        project: makeProject({ targetDate: '2026-09-30' }),
        tasks: [makeTask()],
        latestActivityAt: '2026-08-13T09:00:00+08:00',
      }),
    );
    expect(rules).toEqual([]);
  });
});
