import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import { SEED_PROJECTS } from '@/features/projects/mock';

describe('project store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    // 固定系统时间，保证活动记录排序断言可复现
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('初始状态：无持久化数据时加载种子项目', () => {
    const store = useProjectStore();
    expect(store.projects.length).toBe(SEED_PROJECTS.length);
    expect(store.projectById('p-personal-os')?.name).toBe('Personal OS 一体化系统');
    expect(store.projectById('not-exist')).toBeNull();
  });

  it('创建项目：写入列表、生成 id、ownerId 为 me、记录创建活动', () => {
    const store = useProjectStore();
    const created = store.createProject({
      name: '新项目',
      description: '测试项目',
      status: 'planning',
      tags: ['测试'],
      techStack: ['Vue 3'],
    });

    expect(store.projects.some((p) => p.id === created.id)).toBe(true);
    expect(created.name).toBe('新项目');
    expect(created.ownerId).toBe('me');
    expect(created.techStack).toEqual(['Vue 3']);

    const acts = store.projectActivities(created.id);
    expect(acts).toHaveLength(1);
    expect(acts[0]?.type).toBe('created');
    expect(acts[0]?.title).toBe('创建项目');
  });

  it('更新项目：字段合并、刷新 updatedAt、记录更新活动', () => {
    const store = useProjectStore();
    const id = 'p-personal-os';
    const before = Date.parse(store.projectById(id)!.updatedAt);

    store.updateProject(id, {
      name: 'Personal OS v2',
      description: '新描述',
      status: 'paused',
      tags: ['AI'],
      techStack: ['Vue 3'],
    });

    const p = store.projectById(id)!;
    expect(p.name).toBe('Personal OS v2');
    expect(p.description).toBe('新描述');
    expect(p.status).toBe('paused');
    expect(Date.parse(p.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(store.projectActivities(id)[0]?.type).toBe('updated');
  });

  it('归档与恢复：状态切换并分别记录活动', () => {
    const store = useProjectStore();
    const id = 'p-blog';

    store.archiveProject(id);
    expect(store.projectById(id)?.status).toBe('archived');
    expect(store.projectActivities(id)[0]?.type).toBe('archived');

    // 重复归档为幂等操作，不重复记录
    const count = store.projectActivities(id).length;
    store.archiveProject(id);
    expect(store.projectActivities(id).length).toBe(count);

    store.restoreProject(id);
    expect(store.projectById(id)?.status).toBe('active');
    expect(store.projectActivities(id)[0]?.type).toBe('restored');
  });

  it('删除项目：移除项目并清理其活动记录', () => {
    const store = useProjectStore();
    const id = 'p-personal-os';
    store.deleteProject(id);

    expect(store.projectById(id)).toBeNull();
    expect(store.projects.some((p) => p.id === id)).toBe(false);
    expect(store.projectActivities(id)).toHaveLength(0);
  });

  it('搜索：按名称 / 描述 / 标签 / 技术栈匹配', () => {
    const store = useProjectStore();

    store.searchQuery = 'personal';
    expect(store.filteredProjects.map((p) => p.id)).toContain('p-personal-os');

    store.searchQuery = 'Vue 2';
    expect(store.filteredProjects.map((p) => p.id)).toContain('p-legacy-homepage');

    store.searchQuery = '运维';
    expect(store.filteredProjects.map((p) => p.id)).toContain('p-nas-monitor');

    store.searchQuery = '不存在的关键词';
    expect(store.filteredProjects).toHaveLength(0);
  });

  it('状态筛选：只返回对应状态的项目，可与搜索叠加', () => {
    const store = useProjectStore();

    store.statusFilter = 'completed';
    expect(store.filteredProjects.every((p) => p.status === 'completed')).toBe(true);
    expect(store.filteredProjects.map((p) => p.id)).toContain('p-habit-app');

    store.searchQuery = 'personal';
    store.statusFilter = 'active';
    expect(store.filteredProjects.map((p) => p.id)).toEqual(['p-personal-os']);
  });

  it('摘要：各状态计数正确，recent 按 updatedAt 降序', () => {
    const store = useProjectStore();
    const s = store.summary;

    expect(s.total).toBe(store.projects.length);
    expect(s.active).toBe(store.projects.filter((p) => p.status === 'active').length);
    expect(s.completed).toBe(store.projects.filter((p) => p.status === 'completed').length);
    expect(s.archived).toBe(store.projects.filter((p) => p.status === 'archived').length);

    for (let i = 1; i < s.recent.length; i += 1) {
      expect(Date.parse(s.recent[i - 1]!.updatedAt) >= Date.parse(s.recent[i]!.updatedAt)).toBe(
        true,
      );
    }
  });

  it('持久化：变更写入 localStorage，重新加载可恢复；空列表不回退到种子', () => {
    const store = useProjectStore();
    store.createProject({
      name: '持久化测试项目',
      status: 'active',
      tags: [],
      techStack: [],
    });

    const raw = localStorage.getItem('personal-os.projects.v1');
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).length).toBe(SEED_PROJECTS.length + 1);

    // 模拟重新加载
    setActivePinia(createPinia());
    const reloaded = useProjectStore();
    expect(reloaded.projects.length).toBe(SEED_PROJECTS.length + 1);
    expect(reloaded.projects.some((p) => p.name === '持久化测试项目')).toBe(true);

    // 清空后重载保持空（不回退种子）
    reloaded.projects.forEach((p) => reloaded.deleteProject(p.id));
    expect(reloaded.projects).toHaveLength(0);
    setActivePinia(createPinia());
    expect(useProjectStore().projects).toHaveLength(0);
  });
});
