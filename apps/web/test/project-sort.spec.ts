import { describe, expect, it } from 'vitest';

import { SEED_PROJECTS } from '@/features/projects/mock';
import { effectiveProgress } from '@/features/projects/progress';
import { sortProjects } from '@/features/projects/sort';

describe('project sort（纯函数）', () => {
  it('按名称排序：升序 / 降序', () => {
    const asc = sortProjects(SEED_PROJECTS, 'name', 'asc');
    const names = asc.map((p) => p.name.toLowerCase());
    // 与实现一致：简单字符串比较（ASCII 先于中文）
    const expected = [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(names).toEqual(expected);

    const desc = sortProjects(SEED_PROJECTS, 'name', 'desc');
    expect(desc[0]?.name).toBe(asc[asc.length - 1]?.name);
  });

  it('按更新时间降序（默认）与创建时间排序', () => {
    const byUpdated = sortProjects(SEED_PROJECTS, 'updatedAt', 'desc');
    for (let i = 1; i < byUpdated.length; i += 1) {
      expect(byUpdated[i - 1]!.updatedAt >= byUpdated[i]!.updatedAt).toBe(true);
    }

    const byCreated = sortProjects(SEED_PROJECTS, 'createdAt', 'asc');
    for (let i = 1; i < byCreated.length; i += 1) {
      expect(byCreated[i - 1]!.createdAt <= byCreated[i]!.createdAt).toBe(true);
    }
  });

  it('按完成进度排序：使用外部传入的有效进度（自动/手动）', () => {
    const progress = new Map<string, number>();
    for (const p of SEED_PROJECTS) progress.set(p.id, effectiveProgress(p, 50));
    // 手动进度 45 的项目应排在任务进度 50 的项目之前
    progress.set('p-personal-os', 50);
    progress.set('p-blog', 45);

    const asc = sortProjects(SEED_PROJECTS, 'progress', 'asc', { progress, unfinished: new Map() });
    const idx = (id: string) => asc.findIndex((p) => p.id === id);
    expect(idx('p-blog')).toBeLessThan(idx('p-personal-os'));

    const desc = sortProjects(SEED_PROJECTS, 'progress', 'desc', {
      progress,
      unfinished: new Map(),
    });
    expect(desc.findIndex((p) => p.id === 'p-personal-os')).toBeLessThan(
      desc.findIndex((p) => p.id === 'p-blog'),
    );
  });

  it('按未完成任务数排序：少任务在前（升序）', () => {
    const unfinished = new Map<string, number>([
      ['p-personal-os', 4],
      ['p-cli-toolkit', 1],
      ['p-blog', 2],
      ['p-nas-monitor', 2],
      ['p-habit-app', 0],
      ['p-legacy-homepage', 0],
    ]);
    const asc = sortProjects(SEED_PROJECTS, 'tasks', 'asc', { progress: new Map(), unfinished });
    const countOf = (id: string) => unfinished.get(id)!;
    for (let i = 1; i < asc.length; i += 1) {
      expect(countOf(asc[i - 1]!.id) <= countOf(asc[i]!.id)).toBe(true);
    }
  });

  it('不修改原数组，且相同键时按更新时间降序兜底保持稳定', () => {
    const before = SEED_PROJECTS.map((p) => p.id);
    sortProjects(SEED_PROJECTS, 'progress', 'asc');
    expect(SEED_PROJECTS.map((p) => p.id)).toEqual(before);
  });
});
