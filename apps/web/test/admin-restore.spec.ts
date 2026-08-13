import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildFullBackup, backupToJson } from '@/features/admin/backup';
import { CHAT_KEYS, WORKFLOW_KEYS, ADMIN_STORAGE_KEY } from '@/features/admin/registry';
import {
  parseBackupJson,
  buildRestorePreview,
  applyRestore,
  buildRollbackSnapshot,
  getLastRollbackSnapshot,
  clearRollbackSnapshot,
} from '@/features/admin/restore';

describe('admin 备份解析', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRollbackSnapshot();
  });

  it('非法 JSON → 明确错误', () => {
    const parsed = parseBackupJson('{not json');
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toContain('JSON');
  });

  it('非 Personal OS 备份 → 拒绝', () => {
    const parsed = parseBackupJson(JSON.stringify({ app: 'other', modules: [] }));
    expect(parsed.valid).toBe(false);
  });

  it('缺少模块清单 → 拒绝', () => {
    const parsed = parseBackupJson(JSON.stringify({ app: 'personal-os' }));
    expect(parsed.valid).toBe(false);
  });

  it('包含未知模块 → 拒绝（白名单边界）', () => {
    const parsed = parseBackupJson(
      JSON.stringify({
        app: 'personal-os',
        modules: [{ moduleId: 'unknown-module', keys: [{ kind: 'data', key: 'x', data: {} }] }],
      }),
    );
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toContain('未识别');
  });

  it('合法备份解析出模块清单与版本', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      appVersion: '0.1.0',
      exportedAt: '2026-08-13T00:00:00.000Z',
      modules: [
        {
          moduleId: 'chat',
          keys: [
            {
              kind: 'data',
              key: CHAT_KEYS.data,
              data: [{ id: 's1', title: 't', schemaVersion: 1 }],
            },
          ],
        },
      ],
    });
    const parsed = parseBackupJson(text);
    expect(parsed.valid).toBe(true);
    expect(parsed.modules).toHaveLength(1);
    expect(parsed.modules[0]?.moduleId).toBe('chat');
    expect(parsed.modules[0]?.version).toBe(1);
  });
});

describe('admin 恢复预览', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRollbackSnapshot();
  });

  it('版本冲突判断：newer / same / older', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'chat',
          keys: [{ kind: 'data', key: CHAT_KEYS.data, data: [{ id: 's1', schemaVersion: 1 }] }],
        },
        {
          moduleId: 'workflows',
          keys: [{ kind: 'data', key: WORKFLOW_KEYS.data, data: { version: 4, workflows: [] } }],
        },
      ],
    });
    const preview = buildRestorePreview(parseBackupJson(text));
    expect(preview.valid).toBe(true);
    expect(preview.modules.find((m) => m.moduleId === 'chat')?.conflict).toBe('same');
    const wf = preview.modules.find((m) => m.moduleId === 'workflows')!;
    expect(wf.conflict).toBe('newer');
    // 版本过新默认建议跳过
    expect(wf.supportedModes).not.toContain('merge');
  });

  it('merge 仅对注册表声明支持的模块启用', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'chat',
          keys: [{ kind: 'data', key: CHAT_KEYS.data, data: [{ id: 'c1', schemaVersion: 1 }] }],
        },
        {
          moduleId: 'projects',
          keys: [
            {
              kind: 'data',
              key: 'personal-os.projects.v3',
              data: { version: 3, data: { projects: [] } },
            },
          ],
        },
      ],
    });
    const preview = buildRestorePreview(parseBackupJson(text));
    const chat = preview.modules.find((m) => m.moduleId === 'chat')!;
    const proj = preview.modules.find((m) => m.moduleId === 'projects')!;
    expect(chat.supportedModes).toContain('merge');
    expect(proj.supportedModes).not.toContain('merge');
  });

  it('摘要计数来自备份数据', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'chat',
          keys: [
            { kind: 'data', key: CHAT_KEYS.data, data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] },
          ],
        },
      ],
    });
    const preview = buildRestorePreview(parseBackupJson(text));
    expect(preview.modules[0]?.count).toBe(3);
  });
});

describe('admin 事务式恢复', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRollbackSnapshot();
  });

  function chatBackup(sessions: unknown[]): string {
    return JSON.stringify({
      app: 'personal-os',
      appVersion: '0.1.0',
      exportedAt: '2026-08-13T00:00:00.000Z',
      modules: [
        { moduleId: 'chat', keys: [{ kind: 'data', key: CHAT_KEYS.data, data: sessions }] },
      ],
    });
  }

  it('覆盖恢复：写入备份数据', () => {
    const parsed = parseBackupJson(chatBackup([{ id: 'new1', title: '恢复', schemaVersion: 1 }]));
    const result = applyRestore(parsed, { chat: 'overwrite' });
    expect(result.ok).toBe(true);
    expect(result.restored).toEqual(['chat']);
    const stored = JSON.parse(localStorage.getItem(CHAT_KEYS.data)!);
    expect(stored).toEqual([{ id: 'new1', title: '恢复', schemaVersion: 1 }]);
  });

  it('合并恢复：数组合并按 id 去重', () => {
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([{ id: 'a', title: '本地', schemaVersion: 1 }]),
    );
    const parsed = parseBackupJson(
      chatBackup([
        { id: 'a', title: '备份版', schemaVersion: 1 },
        { id: 'b', title: '新会话', schemaVersion: 1 },
      ]),
    );
    const result = applyRestore(parsed, { chat: 'merge' });
    expect(result.ok).toBe(true);
    const stored = JSON.parse(localStorage.getItem(CHAT_KEYS.data)!) as { id: string }[];
    expect(stored).toHaveLength(2);
    expect(stored.map((s) => s.id).sort()).toEqual(['a', 'b']);
  });

  it('全部跳过：不写任何数据', () => {
    const parsed = parseBackupJson(chatBackup([{ id: 'x' }]));
    const result = applyRestore(parsed, { chat: 'skip' });
    expect(result.ok).toBe(true);
    expect(result.skipped).toEqual(['chat']);
    expect(localStorage.getItem(CHAT_KEYS.data)).toBeNull();
  });

  it('版本过新模块拒绝恢复', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'workflows',
          keys: [{ kind: 'data', key: WORKFLOW_KEYS.data, data: { version: 9, workflows: [] } }],
        },
      ],
    });
    const parsed = parseBackupJson(text);
    const result = applyRestore(parsed, { workflows: 'overwrite' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('高于当前支持');
  });

  it('不支持 merge 的模块选择 merge → 拒绝且不写入', () => {
    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'tasks',
          keys: [
            {
              kind: 'data',
              key: 'personal-os.tasks.v3',
              data: { version: 3, data: { tasks: [] } },
            },
          ],
        },
      ],
    });
    const parsed = parseBackupJson(text);
    const result = applyRestore(parsed, { tasks: 'merge' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('不支持合并');
  });

  it('写入失败时事务回滚：已写入模块恢复原值', () => {
    const originalChat = [{ id: 'orig', title: '原值', schemaVersion: 1 }];
    localStorage.setItem(CHAT_KEYS.data, JSON.stringify(originalChat));
    localStorage.setItem(
      WORKFLOW_KEYS.data,
      JSON.stringify({ version: 3, workflows: [{ id: 'w0' }] }),
    );

    const text = JSON.stringify({
      app: 'personal-os',
      modules: [
        {
          moduleId: 'chat',
          keys: [{ kind: 'data', key: CHAT_KEYS.data, data: [{ id: 'new1', schemaVersion: 1 }] }],
        },
        {
          moduleId: 'workflows',
          keys: [
            {
              kind: 'data',
              key: WORKFLOW_KEYS.data,
              data: { version: 3, workflows: [{ id: 'newW' }] },
            },
          ],
        },
      ],
    });
    const parsed = parseBackupJson(text);

    // workflows key 写入时抛错（模拟配额/隐私模式）
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === WORKFLOW_KEYS.data) throw new Error('QuotaExceededError');
      return Storage.prototype.setItem.call(this, key, value);
    });
    try {
      const result = applyRestore(parsed, { chat: 'overwrite', workflows: 'overwrite' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('回滚');
    } finally {
      spy.mockRestore();
    }

    // chat 已写入的模块被回滚为原值
    expect(JSON.parse(localStorage.getItem(CHAT_KEYS.data)!)).toEqual(originalChat);
    expect(JSON.parse(localStorage.getItem(WORKFLOW_KEYS.data)!)).toEqual({
      version: 3,
      workflows: [{ id: 'w0' }],
    });
  });

  it('导入前自动创建回滚快照（内存态，可查看/丢弃）', () => {
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([{ id: 's1', title: 't', schemaVersion: 1 }]),
    );
    expect(getLastRollbackSnapshot()).toBeNull();

    const snapshot = buildRollbackSnapshot();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.modules.find((m) => m.moduleId === 'chat')?.keys[0]?.data).toEqual([
      { id: 's1', title: 't', schemaVersion: 1 },
    ]);
    expect(getLastRollbackSnapshot()).toBe(snapshot);

    clearRollbackSnapshot();
    expect(getLastRollbackSnapshot()).toBeNull();
  });

  it('备份→解析→预览→恢复 全链路（含 admin 自身）', () => {
    localStorage.setItem(
      ADMIN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        prefs: { profile: { displayName: 'x' }, appearance: {}, automation: {} },
      }),
    );
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([{ id: 's1', title: 't', schemaVersion: 1 }]),
    );

    const json = backupToJson(buildFullBackup());
    const parsed = parseBackupJson(json);
    expect(parsed.valid).toBe(true);
    expect(parsed.modules.map((m) => m.moduleId)).toContain('admin');

    // 恢复到空环境
    localStorage.clear();
    const result = applyRestore(
      parsed,
      Object.fromEntries(parsed.modules.map((m) => [m.moduleId, 'overwrite'])),
    );
    expect(result.ok).toBe(true);
    expect(JSON.parse(localStorage.getItem(CHAT_KEYS.data)!)).toHaveLength(1);
    expect(localStorage.getItem(ADMIN_STORAGE_KEY)).not.toBeNull();
  });
});
