import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MODULE_REGISTRY,
  allManagedKeys,
  cacheKeys,
  scanAllModules,
  scanModule,
  clearModuleData,
  clearCacheOnly,
  clearAllManagedData,
  CHAT_KEYS,
  WORKFLOW_KEYS,
  PROJECT_KEYS,
  TASK_KEYS,
  ACHIEVEMENT_KEYS,
  ADMIN_STORAGE_KEY,
} from '@/features/admin/registry';

describe('admin 存储注册表', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('注册表包含 Chat / 工作流 / 开发中 / 任务 / 已完成 / 管理系统', () => {
    const ids = MODULE_REGISTRY.map((m) => m.id);
    expect(ids).toEqual(
      expect.arrayContaining(['chat', 'workflows', 'projects', 'tasks', 'achievements', 'admin']),
    );
  });

  it('全部受管 key 均为白名单，无通配符', () => {
    const keys = allManagedKeys();
    expect(keys.length).toBeGreaterThan(5);
    for (const k of keys) {
      expect(k).not.toMatch(/[*?]/);
      expect(k.startsWith('personal-os')).toBe(true);
    }
  });

  it('版本识别：chat 裸数组信封（schemaVersion）', () => {
    const chat = MODULE_REGISTRY.find((m) => m.id === 'chat')!;
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([
        {
          id: 's1',
          title: 't',
          messages: [],
          model: 'm',
          createdAt: 1,
          updatedAt: 1,
          schemaVersion: 1,
        },
      ]),
    );
    const snap = scanModule(chat);
    expect(snap.status).toBe('ok');
    expect(snap.version).toBe(1);
    expect(snap.summary?.detail).toBe('1 条会话');
  });

  it('版本识别：workflows / achievements 信封 version 字段', () => {
    const wf = MODULE_REGISTRY.find((m) => m.id === 'workflows')!;
    localStorage.setItem(
      WORKFLOW_KEYS.data,
      JSON.stringify({ version: 3, workflows: [{ id: 'w1' }, { id: 'w2' }] }),
    );
    const wfSnap = scanModule(wf);
    expect(wfSnap.status).toBe('ok');
    expect(wfSnap.version).toBe(3);
    expect(wfSnap.summary?.count).toBe(2);

    const ach = MODULE_REGISTRY.find((m) => m.id === 'achievements')!;
    localStorage.setItem(
      ACHIEVEMENT_KEYS.data,
      JSON.stringify({ version: 2, items: [{ id: 'a1' }] }),
    );
    const achSnap = scanModule(ach);
    expect(achSnap.status).toBe('ok');
    expect(achSnap.version).toBe(2);
    expect(achSnap.summary?.count).toBe(1);
  });

  it('projects v3 信封：data.projects 摘要', () => {
    const proj = MODULE_REGISTRY.find((m) => m.id === 'projects')!;
    localStorage.setItem(
      PROJECT_KEYS.data,
      JSON.stringify({
        version: 3,
        data: { projects: [{ id: 'p1' }, { id: 'p2' }], milestones: [] },
      }),
    );
    const snap = scanModule(proj);
    expect(snap.status).toBe('ok');
    expect(snap.version).toBe(3);
    expect(snap.summary?.count).toBe(2);
  });

  it('损坏数据 → corrupt；版本过新 → newer', () => {
    const wf = MODULE_REGISTRY.find((m) => m.id === 'workflows')!;
    localStorage.setItem(WORKFLOW_KEYS.data, '{broken json');
    expect(scanModule(wf).status).toBe('corrupt');

    localStorage.setItem(WORKFLOW_KEYS.data, JSON.stringify({ version: 99, workflows: [] }));
    const snap = scanModule(wf);
    expect(snap.status).toBe('newer');
    expect(snap.version).toBe(99);
  });

  it('缺失模块 → missing；不可读 → unreadable', () => {
    const tasks = MODULE_REGISTRY.find((m) => m.id === 'tasks')!;
    expect(scanModule(tasks).status).toBe('missing');

    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    try {
      const snap = scanModule(tasks);
      expect(snap.status).toBe('missing');
      expect(snap.keysFound).toHaveLength(0);
    } finally {
      get.mockRestore();
    }
  });

  it('全量扫描统计各模块用量', () => {
    localStorage.setItem(CHAT_KEYS.data, JSON.stringify([{ id: 's1', schemaVersion: 1 }]));
    localStorage.setItem(TASK_KEYS.data, JSON.stringify({ version: 3, data: { tasks: [] } }));
    const { snapshots, totalBytes } = scanAllModules();
    expect(snapshots.find((s) => s.moduleId === 'chat')?.present).toBe(true);
    expect(snapshots.find((s) => s.moduleId === 'tasks')?.present).toBe(true);
    expect(snapshots.find((s) => s.moduleId === 'workflows')?.present).toBe(false);
    expect(totalBytes).toBeGreaterThan(0);
  });
});

describe('admin 数据清理边界', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('单模块清理只删该模块白名单 key', () => {
    localStorage.setItem(CHAT_KEYS.data, 'x');
    localStorage.setItem(WORKFLOW_KEYS.data, 'y');
    localStorage.setItem('unknown-key-not-managed', 'z');

    const result = clearModuleData('chat');
    expect(result.removed).toContain(CHAT_KEYS.data);
    expect(localStorage.getItem(CHAT_KEYS.data)).toBeNull();
    // 其他模块与未知 key 不受影响
    expect(localStorage.getItem(WORKFLOW_KEYS.data)).toBe('y');
    expect(localStorage.getItem('unknown-key-not-managed')).toBe('z');
  });

  it('未知 key 永不进入清理范围（全量清理也不删）', () => {
    localStorage.setItem('personal-os-unknown-module-v9', 'secret');
    localStorage.setItem('completely-random-key', 'secret');
    const result = clearAllManagedData();
    expect(result.removed).toHaveLength(allManagedKeys().length);
    expect(localStorage.getItem('personal-os-unknown-module-v9')).toBe('secret');
    expect(localStorage.getItem('completely-random-key')).toBe('secret');
  });

  it('仅清理缓存类数据：不碰业务数据与遗留 key', () => {
    localStorage.setItem(CHAT_KEYS.data, 'data');
    localStorage.setItem(CHAT_KEYS.prefs, 'prefs');
    localStorage.setItem(WORKFLOW_KEYS.legacyV1, 'legacy');
    localStorage.setItem(TASK_KEYS.ui, 'ui');

    const cacheKeysList = cacheKeys();
    expect(cacheKeysList).toContain(CHAT_KEYS.prefs);
    expect(cacheKeysList).toContain(TASK_KEYS.ui);

    const result = clearCacheOnly();
    expect(result.removed).toEqual(expect.arrayContaining([CHAT_KEYS.prefs, TASK_KEYS.ui]));
    expect(localStorage.getItem(CHAT_KEYS.data)).toBe('data');
    expect(localStorage.getItem(WORKFLOW_KEYS.legacyV1)).toBe('legacy');
  });

  it('全量清理包含全部注册表 key 并清空受管数据', () => {
    localStorage.setItem(CHAT_KEYS.data, 'a');
    localStorage.setItem(PROJECT_KEYS.data, 'b');
    localStorage.setItem(ADMIN_STORAGE_KEY, 'c');
    localStorage.setItem(PROJECT_KEYS.snapshots, 'd');

    const result = clearAllManagedData();
    expect(result.removed).toHaveLength(allManagedKeys().length);
    expect(localStorage.getItem(CHAT_KEYS.data)).toBeNull();
    expect(localStorage.getItem(PROJECT_KEYS.data)).toBeNull();
    expect(localStorage.getItem(ADMIN_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PROJECT_KEYS.snapshots)).toBeNull();
  });

  it('遗留 key（legacy）纳入白名单可清理', () => {
    localStorage.setItem(PROJECT_KEYS.legacyProjectsV1, 'old');
    localStorage.setItem(TASK_KEYS.legacyV1, 'old');
    const result = clearAllManagedData();
    expect(result.removed).toContain(PROJECT_KEYS.legacyProjectsV1);
    expect(result.removed).toContain(TASK_KEYS.legacyV1);
  });
});
