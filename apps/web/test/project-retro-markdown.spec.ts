import { describe, expect, it } from 'vitest';

import {
  buildHealthStats,
  buildRetroMarkdown,
  buildRetroTemplate,
} from '@/features/projects/health';
import type { Milestone, ProjectDetail, Retrospective } from '@/features/projects/types';
import type { TaskItem } from '@/features/tasks/types';

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
    updatedAt: '2026-08-13T10:00:00+08:00',
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

const TODAY = '2026-08-13';

describe('复盘模板与 Markdown 导出', () => {
  it('buildRetroTemplate：基于健康统计预填四段（完成率 / 逾期 / 阻塞 / 里程碑）', () => {
    const health = buildHealthStats(
      {
        tasks: [
          makeTask({ id: 'a', status: 'done', updatedAt: '2026-08-13T10:00:00+08:00' }),
          makeTask({ id: 'b', status: 'todo', dueDate: '2026-08-01' }),
          makeTask({ id: 'c', status: 'todo', dependsOn: ['a'] }),
        ],
        milestones: [makeMilestone({ status: 'done' })],
        activities: [],
        focusSessions: [],
        today: TODAY,
      },
      '7d',
    );
    const tpl = buildRetroTemplate(health);
    expect(tpl.done).toContain('完成率 33%');
    expect(tpl.blockers).toContain('1 个任务逾期');
    expect(tpl.lessons).toContain('已完成 1 个');
  });

  it('buildRetroMarkdown：包含标题 / 健康摘要 / 风险 / 完成任务 / 里程碑 / 复盘笔记', () => {
    const tasks = [
      makeTask({ id: 'a', title: '完成的任务', status: 'done', dod: '验收通过' }),
      makeTask({ id: 'b', title: '待办任务' }),
    ];
    const milestones = [makeMilestone({ title: '里程碑一', dueDate: '2026-08-20' })];
    const health = buildHealthStats(
      { tasks, milestones, activities: [], focusSessions: [], today: TODAY },
      '7d',
    );
    const retro: Omit<Retrospective, 'projectId' | 'updatedAt'> = {
      done: '本期完成 A',
      blockers: '遇到阻塞',
      next: '下期做 B',
      lessons: '经验 X',
    };
    const md = buildRetroMarkdown({
      project: makeProject(),
      health,
      rules: [{ key: 'blocked', level: 'warn', label: '阻塞任务', detail: '1 个任务受阻' }],
      retro,
      tasks,
    });
    expect(md).toContain('# 复盘 · 测试项目');
    expect(md).toContain('## 健康摘要');
    expect(md).toContain('## 风险');
    expect(md).toContain('阻塞任务**：1 个任务受阻');
    expect(md).toContain('- [x] 完成的任务（DoD：验收通过）');
    expect(md).toContain('## 里程碑');
    expect(md).toContain('里程碑一');
    expect(md).toContain('### 本期完成');
    expect(md).toContain('本期完成 A');
    expect(md).toContain('### 下期计划');
    expect(md).toContain('下期做 B');
  });

  it('buildRetroMarkdown：无笔记 / 无任务时输出占位而非崩溃', () => {
    const health = buildHealthStats(
      { tasks: [], milestones: [], activities: [], focusSessions: [], today: TODAY },
      '7d',
    );
    const md = buildRetroMarkdown({
      project: makeProject(),
      health,
      rules: [],
      retro: null,
      tasks: [],
    });
    expect(md).toContain('（本期暂无完成任务）');
    expect(md).toContain('（尚未撰写复盘笔记）');
    expect(md).toContain('暂无异常');
  });
});
