import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useProjectStore } from '@/features/projects/store';
import {
  PROJECTS_KEY,
  PROJECTS_LEGACY_KEY,
  PROJECTS_VERSION,
} from '@/features/projects/persistence';
import { SEED_PROJECTS } from '@/features/projects/mock';
import { useTaskStore } from '@/features/tasks/store';

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

  it('持久化：变更写入 localStorage（版本信封），重新加载可恢复；空列表不回退到种子', () => {
    const store = useProjectStore();
    store.createProject({
      name: '持久化测试项目',
      status: 'active',
      tags: [],
      techStack: [],
    });

    const raw = localStorage.getItem(PROJECTS_KEY);
    expect(raw).not.toBeNull();
    const envelope = JSON.parse(raw!);
    expect(envelope.version).toBe(PROJECTS_VERSION);
    expect(envelope.data.projects.length).toBe(SEED_PROJECTS.length + 1);
    expect(Array.isArray(envelope.data.milestones)).toBe(true);

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

  it('收藏：切换收藏状态并写入持久化；收藏视图只显示收藏项目', () => {
    const store = useProjectStore();
    store.toggleFavorite('p-blog');
    expect(store.projectById('p-blog')?.favorite).toBe(true);
    store.toggleFavorite('p-blog');
    expect(store.projectById('p-blog')?.favorite).toBe(false);

    store.toggleFavorite('p-nas-monitor');
    store.viewFilter = 'favorites';
    expect(store.filteredProjects.map((p) => p.id)).toEqual(['p-personal-os', 'p-nas-monitor']);

    store.viewFilter = 'archived';
    expect(store.filteredProjects.every((p) => p.status === 'archived')).toBe(true);
    expect(store.filteredProjects.map((p) => p.id)).toEqual(['p-legacy-homepage']);

    store.viewFilter = 'all';
    expect(store.filteredProjects.length).toBe(store.projects.length);

    // 收藏状态随持久化恢复
    setActivePinia(createPinia());
    expect(useProjectStore().projectById('p-personal-os')?.favorite).toBe(true);
  });

  it('进度模式：自动按任务比例；切手动以当前值初始化并可手动设置；切回自动不覆盖手动值', () => {
    const store = useProjectStore();
    const id = 'p-personal-os';
    expect(store.projectById(id)?.progressMode).toBe('auto');

    // 切到手动：以当前自动进度（任务完成比例）初始化
    store.setProgressMode(id, 'manual', 33);
    expect(store.projectById(id)?.progressMode).toBe('manual');
    expect(store.projectById(id)?.manualProgress).toBe(33);

    store.setManualProgress(id, 80);
    expect(store.projectById(id)?.manualProgress).toBe(80);

    // 切回自动：手动值保留，但有效进度改用任务比例
    store.setProgressMode(id, 'auto', 33);
    expect(store.projectById(id)?.progressMode).toBe('auto');
    expect(store.projectById(id)?.manualProgress).toBe(80);

    // 手动进度越界被钳制
    store.setProgressMode(id, 'manual', 0);
    store.setManualProgress(id, 150);
    expect(store.projectById(id)?.manualProgress).toBe(100);
    store.setManualProgress(id, -5);
    expect(store.projectById(id)?.manualProgress).toBe(0);
  });

  it('删除两种策略：归档保留任务；永久删除级联清理任务与活动', () => {
    const store = useProjectStore();
    const taskStore = useTaskStore();
    const id = 'p-cli-toolkit';
    const taskCount = taskStore.tasksByProject(id).length;
    expect(taskCount).toBeGreaterThan(0);

    // 策略一：归档（保留任务）
    store.archiveProject(id);
    expect(store.projectById(id)?.status).toBe('archived');
    expect(taskStore.tasksByProject(id).length).toBe(taskCount);

    // 策略二：永久删除（先级联清理任务，再删项目）
    taskStore.removeByProject(id);
    store.deleteProject(id);
    expect(store.projectById(id)).toBeNull();
    expect(taskStore.tasksByProject(id)).toHaveLength(0);
    expect(store.projectActivities(id)).toHaveLength(0);
  });

  it('损坏数据安全恢复：JSON 损坏时回退种子并给出非阻塞提示', () => {
    localStorage.setItem(PROJECTS_KEY, '{broken json');
    const store = useProjectStore();
    expect(store.projects.length).toBe(SEED_PROJECTS.length);
    expect(store.storageWarning).toContain('无法读取');
  });

  it('损坏数据安全恢复：结构校验失败（缺字段）时回退种子', () => {
    localStorage.setItem(
      PROJECTS_KEY,
      JSON.stringify({ version: PROJECTS_VERSION, data: [{ id: 'x', name: 123 }] }),
    );
    const store = useProjectStore();
    expect(store.projects.length).toBe(SEED_PROJECTS.length);
    expect(store.storageWarning).not.toBeNull();
  });

  it('版本过新：拒绝读取并回退种子，提示升级', () => {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify({ version: PROJECTS_VERSION + 1, data: [] }));
    const store = useProjectStore();
    expect(store.projects.length).toBe(SEED_PROJECTS.length);
    expect(store.storageWarning).toContain('版本过新');
  });

  it('旧版本迁移：v1 裸数组自动升级为 v2 信封，旧 key 保留可回滚', () => {
    // 模拟 v1 数据：无 favorite / progressMode / manualProgress 字段
    const legacy = SEED_PROJECTS.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      ownerId: p.ownerId,
      tags: p.tags,
      techStack: p.techStack,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
    localStorage.setItem(PROJECTS_LEGACY_KEY, JSON.stringify(legacy));

    const store = useProjectStore();
    expect(store.projects.length).toBe(SEED_PROJECTS.length);
    // 迁移补全新字段默认值
    for (const p of store.projects) {
      expect(typeof p.favorite).toBe('boolean');
      expect(p.progressMode).toBe('auto');
    }
    expect(store.storageWarning).toContain('旧版本升级');

    // 新 key 已写入 v2 信封；旧 key 未删除（可回滚）
    const envelope = JSON.parse(localStorage.getItem(PROJECTS_KEY)!);
    expect(envelope.version).toBe(PROJECTS_VERSION);
    expect(localStorage.getItem(PROJECTS_LEGACY_KEY)).not.toBeNull();

    // 重新加载不再提示
    setActivePinia(createPinia());
    expect(useProjectStore().storageWarning).toBeNull();
  });

  it('写入失败不阻塞页面：操作仍在内存生效，并给出存储提示', () => {
    const store = useProjectStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });
    try {
      store.createProject({ name: '写失败的项目', status: 'active', tags: [], techStack: [] });
    } finally {
      spy.mockRestore();
    }
    expect(store.projects.some((p) => p.name === '写失败的项目')).toBe(true);
    expect(store.storageWarning).toContain('存储空间不足');
  });
});
