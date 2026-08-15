import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';

import { setSyncEnabled } from '@/features/projects/sync';
import { createProjectSync } from '@/features/projects/sync';
import { createReleasesSync } from '@/features/projects/sync';
import { createTaskSync } from '@/features/tasks/sync';
import type { ReleaseRecord } from '@/features/projects/types';

// ── 同步引擎 handle 级测试：hydrate / 乐观更新 / 离线队列三态 ──

const projectsApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const milestonesApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const releasesApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const tasksApiMock = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));
const focusApiMock = vi.hoisted(() => ({
  listPlans: vi.fn(),
  upsertPlan: vi.fn(),
}));

vi.mock('@/features/projects/api', () => ({
  projectsApi: projectsApiMock,
  milestonesApi: milestonesApiMock,
  releasesApi: releasesApiMock,
}));
vi.mock('@/features/tasks/api', () => ({
  tasksApi: tasksApiMock,
  focusApi: focusApiMock,
}));

const projectItem = (id: string, name: string) => ({
  id,
  name,
  status: 'active',
  archived: false,
  description: null,
});

describe('createProjectSync（projects + milestones 引擎 handle）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setSyncEnabled(true);
    projectsApiMock.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    milestonesApiMock.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    projectsApiMock.create.mockImplementation(async (p: { name: string }) => ({
      ...projectItem(`srv-${p.name}`, p.name),
    }));
    milestonesApiMock.create.mockImplementation(async (p: { title: string }) => ({
      id: `srv-ms-${p.title}`,
      title: p.title,
      projectId: 'srv-p1',
      status: 'pending',
      dueDate: null,
    }));
  });

  it('start 后 hydrate：服务端数据接管本地 refs（source=server）', async () => {
    projectsApiMock.list.mockResolvedValue({
      items: [projectItem('srv-1', '项目A'), projectItem('srv-2', '项目B')],
      total: 2,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const projects = ref<{ id: string; name: string; status: string; archived: boolean }[]>([]);
    const milestones = ref<{ id: string; title: string }[]>([]);
    const handle = createProjectSync({
      projects: projects as never,
      milestones: milestones as never,
    });
    handle.retry(); // source=local → hydrate
    await vi.waitFor(() => {
      expect(projects.value).toHaveLength(2);
    });
    expect(projectsApiMock.list).toHaveBeenCalled();
    expect(handle.projects.source).toBe('server');
    setSyncEnabled(false);
  });

  it('本地新建 → 乐观更新 + flush 推送 create，成功后快照更新（dirty 归零）', async () => {
    const projects = ref<{ id: string; name: string; status: string; archived: boolean }[]>([]);
    const milestones = ref<{ id: string; title: string }[]>([]);
    const handle = createProjectSync({
      projects: projects as never,
      milestones: milestones as never,
    });
    handle.retry();
    await vi.waitFor(() => expect(handle.projects.source).toBe('server'));

    projects.value.push(projectItem('p-local-new', '新项目'));
    await handle.retry(); // dirty>0 → flush
    await vi.waitFor(() => expect(projectsApiMock.create).toHaveBeenCalledTimes(1));
    expect(handle.projects.dirty).toBe(0);
    setSyncEnabled(false);
  });

  it('推送网络错误：offline + dirty 保留，本地变更不丢（离线队列）', async () => {
    projectsApiMock.create.mockRejectedValue(new Error('network down'));
    const projects = ref<{ id: string; name: string; status: string; archived: boolean }[]>([]);
    const milestones = ref<{ id: string; title: string }[]>([]);
    const handle = createProjectSync({
      projects: projects as never,
      milestones: milestones as never,
    });
    handle.retry();
    await vi.waitFor(() => expect(handle.projects.source).toBe('server'));

    projects.value.push(projectItem('p-offline', '离线创建'));
    await handle.retry();
    await vi.waitFor(() => expect(projectsApiMock.create).toHaveBeenCalled());
    expect(handle.projects.status).toBe('offline');
    expect(handle.projects.dirty).toBeGreaterThan(0);
    // 本地数据保留（不因失败回滚）
    expect(projects.value.some((p) => p.name === '离线创建')).toBe(true);
    setSyncEnabled(false);
  });
});

describe('createTaskSync（tasks 引擎 handle 基础三态）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setSyncEnabled(true);
    tasksApiMock.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
    focusApiMock.listPlans.mockResolvedValue([]);
    tasksApiMock.create.mockImplementation(async (p: { title: string }) => ({
      id: `srv-t-${p.title}`,
      title: p.title,
      status: 'todo',
      projectId: null,
    }));
  });

  it('hydrate + 本地新建推送 create（tasks 引擎）', async () => {
    tasksApiMock.list.mockResolvedValue({
      items: [{ id: 'srv-t1', title: '后端任务', status: 'todo', projectId: null }],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const tasks = ref<{ id: string; title: string; status: string; projectId: string | null }[]>(
      [],
    );
    const handle = createTaskSync({
      tasks: tasks as never,
      focus: ref([]) as never,
      focusDone: ref([]) as never,
      focusHistory: ref([]) as never,
      focusSessions: ref([]) as never,
      titleOf: () => '',
    });
    handle.retry();
    await vi.waitFor(() => {
      expect(tasks.value).toHaveLength(1);
    });
    expect(handle.tasks.source).toBe('server');

    tasks.value.push({
      id: 't-local',
      title: '新任务',
      status: 'todo',
      projectId: null,
      priority: 'medium',
      tags: [],
      dueDate: null,
      estimatedMinutes: 0,
      actualMinutes: 0,
      dod: '',
      blockedReason: '',
      subtasks: [],
      dependsOn: [],
      order: 0,
    });
    await handle.retry();
    await vi.waitFor(() => expect(tasksApiMock.create).toHaveBeenCalledTimes(1));
    expect(handle.tasks.dirty).toBe(0);
    setSyncEnabled(false);
  });
});

describe('createReleasesSync（releases 引擎 handle）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setSyncEnabled(true);
    releasesApiMock.list.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 0,
    });
  });

  it('hydrate 服务端发布记录', async () => {
    releasesApiMock.list.mockResolvedValue({
      items: [
        {
          id: 'srv-r1',
          projectId: 'srv-p1',
          version: '1.2.0',
          summary: '发版',
          createdAt: '2026-08-15T08:00:00Z',
          releaseDate: '2026-08-15',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    });
    const records = ref<ReleaseRecord[]>([]);
    const handle = createReleasesSync(records);
    handle.retry();
    await vi.waitFor(() => {
      expect(records.value).toHaveLength(1);
    });
    expect(handle.state.source).toBe('server');
    setSyncEnabled(false);
  });
});
