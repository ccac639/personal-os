import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import {
  PROJECTS_KEY,
  PROJECTS_V2_KEY,
  PROJECTS_LEGACY_KEY,
  PROJECTS_VERSION,
  ACTIVITIES_KEY,
  ACTIVITIES_V2_KEY,
  ACTIVITIES_LEGACY_KEY,
} from '@/features/projects/persistence';
import { SEED_PROJECTS } from '@/features/projects/mock';

function legacyProject() {
  const p = SEED_PROJECTS[0]!;
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    status: p.status,
    ownerId: p.ownerId,
    tags: p.tags,
    techStack: p.techStack,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

describe('project 持久化迁移（v1 / v2 → v3）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('v1 裸数组 → v3：补默认字段（favorite / progressMode / 计划字段 / milestones），旧 key 保留', () => {
    localStorage.setItem(PROJECTS_LEGACY_KEY, JSON.stringify([legacyProject()]));
    const store = useProjectStore();

    const p = store.projectById('p-personal-os')!;
    expect(p.favorite).toBe(false);
    expect(p.progressMode).toBe('auto');
    expect(p.manualProgress).toBeUndefined();
    expect(p.goal).toBeUndefined();
    expect(store.milestones).toHaveLength(0);

    // 新格式已落盘，旧 key 保留可回滚
    const envelope = JSON.parse(localStorage.getItem(PROJECTS_KEY)!);
    expect(envelope.version).toBe(PROJECTS_VERSION);
    expect(envelope.data.projects).toHaveLength(1);
    expect(localStorage.getItem(PROJECTS_LEGACY_KEY)).not.toBeNull();
  });

  it('v2 旧信封 → v3：data 数组转为 { projects, milestones }', () => {
    localStorage.setItem(PROJECTS_V2_KEY, JSON.stringify({ version: 2, data: [legacyProject()] }));
    const store = useProjectStore();
    expect(store.projects).toHaveLength(1);
    expect(store.projectById('p-personal-os')?.name).toBe(SEED_PROJECTS[0]!.name);
    const envelope = JSON.parse(localStorage.getItem(PROJECTS_KEY)!);
    expect(envelope.data.projects).toHaveLength(1);
    expect(envelope.data.milestones).toEqual([]);
  });

  it('v1 / v2 活动记录同样迁移到 v3 key', () => {
    localStorage.setItem(
      ACTIVITIES_LEGACY_KEY,
      JSON.stringify([
        {
          id: 'a-x',
          projectId: 'p-personal-os',
          type: 'created',
          title: '创建项目',
          createdAt: '2026-08-01T00:00:00+08:00',
        },
      ]),
    );
    localStorage.setItem(
      ACTIVITIES_V2_KEY,
      JSON.stringify({
        version: 2,
        data: [
          {
            id: 'a-y',
            projectId: 'p-personal-os',
            type: 'task',
            title: '创建任务',
            createdAt: '2026-08-02T00:00:00+08:00',
          },
        ],
      }),
    );
    const store = useProjectStore();
    // v2 优先于 v1
    expect(store.projectActivities('p-personal-os')).toHaveLength(1);
    const envelope = JSON.parse(localStorage.getItem(ACTIVITIES_KEY)!);
    expect(envelope.version).toBe(PROJECTS_VERSION);
  });

  it('损坏数据 / 版本过新：回退种子并给出非阻塞提示', () => {
    localStorage.setItem(PROJECTS_KEY, '{broken json');
    const s1 = useProjectStore();
    expect(s1.projects.length).toBe(SEED_PROJECTS.length);
    expect(s1.storageWarning).toContain('无法读取');

    setActivePinia(createPinia());
    localStorage.setItem(PROJECTS_KEY, JSON.stringify({ version: 99, data: [] }));
    const s2 = useProjectStore();
    expect(s2.projects.length).toBe(SEED_PROJECTS.length);
    expect(s2.storageWarning).toContain('版本过新');
  });

  it('写入失败（QuotaExceeded）：内存数据继续可用且展示提示', () => {
    const store = useProjectStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    try {
      store.createProject({ name: '写失败项目', status: 'active', tags: [], techStack: [] });
      expect(store.projectById(store.projects[0]!.id)?.name).toBe('写失败项目');
      expect(store.storageWarning).toContain('存储空间不足');
    } finally {
      spy.mockRestore();
    }
  });
});
