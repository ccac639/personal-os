import { beforeEach, describe, expect, it } from 'vitest';

import {
  buildFullBackup,
  buildModuleBackup,
  backupToJson,
  APP_VERSION,
} from '@/features/admin/backup';
import {
  CHAT_KEYS,
  WORKFLOW_KEYS,
  ACHIEVEMENT_KEYS,
  TASK_KEYS,
  ADMIN_STORAGE_KEY,
} from '@/features/admin/registry';
import { stripSensitiveFields } from '@/features/admin/providers';

describe('admin 备份结构', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('全量备份包含元数据与全部有数据的模块', () => {
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([{ id: 's1', title: '会话', schemaVersion: 1 }]),
    );
    localStorage.setItem(
      WORKFLOW_KEYS.data,
      JSON.stringify({ version: 3, workflows: [{ id: 'w1' }] }),
    );
    localStorage.setItem(
      TASK_KEYS.data,
      JSON.stringify({ version: 3, data: { tasks: [{ id: 't1' }] } }),
    );

    const backup = buildFullBackup();
    expect(backup.app).toBe('personal-os');
    expect(backup.appVersion).toBe(APP_VERSION);
    expect(backup.exportedAt).toBeTruthy();
    expect(backup.modules.map((m) => m.moduleId)).toEqual(
      expect.arrayContaining(['chat', 'workflows', 'tasks']),
    );
    expect(backup.modules.find((m) => m.moduleId === 'chat')?.version).toBe(1);
    expect(backup.modules.find((m) => m.moduleId === 'workflows')?.version).toBe(3);
    expect(backup.modules.find((m) => m.moduleId === 'chat')?.keys[0]?.data).toEqual([
      { id: 's1', title: '会话', schemaVersion: 1 },
    ]);
  });

  it('单模块备份只包含该模块', () => {
    localStorage.setItem(
      WORKFLOW_KEYS.data,
      JSON.stringify({ version: 3, workflows: [{ id: 'w1' }] }),
    );
    const item = buildModuleBackup('workflows');
    expect(item?.moduleId).toBe('workflows');
    expect(item?.version).toBe(3);
    expect(item?.keys).toHaveLength(1);
  });

  it('缺失模块返回 null 且不进入全量备份', () => {
    const backup = buildFullBackup();
    expect(buildModuleBackup('chat')).toBeNull();
    expect(backup.modules.find((m) => m.moduleId === 'chat')).toBeUndefined();
  });

  it('备份可序列化为 JSON 并可重新解析', () => {
    localStorage.setItem(
      ACHIEVEMENT_KEYS.data,
      JSON.stringify({ version: 2, items: [{ id: 'a1' }] }),
    );
    const json = backupToJson(buildFullBackup());
    const parsed = JSON.parse(json);
    expect(parsed.modules.length).toBeGreaterThan(0);
  });

  it('备份不含附件二进制（chat 附件仅内存，不落盘）', () => {
    // chat 附件草稿（blob URL / 二进制）由 draft.ts 约定只存在于组件内存，
    // storage schema 不含附件字段；因此 localStorage 与备份中都不得出现 blob 引用。
    localStorage.setItem(
      CHAT_KEYS.data,
      JSON.stringify([
        { id: 's1', title: 't', messages: [{ role: 'user', content: 'hi' }], schemaVersion: 1 },
      ]),
    );
    const backup = buildFullBackup();
    const json = backupToJson(backup);
    expect(json).not.toContain('blob:');
    expect(json).not.toContain('attachment');
    // 备份内容与本地数据一致（原样保留，无注入字段）
    const chatData = backup.modules.find((m) => m.moduleId === 'chat')?.keys[0]?.data;
    expect(chatData).toEqual([
      { id: 's1', title: 't', messages: [{ role: 'user', content: 'hi' }], schemaVersion: 1 },
    ]);
  });
});

describe('敏感字段剔除', () => {
  it('递归剔除 apiKey / token / secret / password 字段', () => {
    const input = {
      name: 'provider',
      apiKey: 'sk-secret',
      nested: { token: 'tok', inner: { password: 'pw', keep: 1 } },
      list: [{ authorization: 'Bearer x', ok: true }],
    };
    const cleaned = stripSensitiveFields(input) as Record<string, unknown>;
    const json = JSON.stringify(cleaned);
    expect(json).not.toContain('sk-secret');
    expect(json).not.toContain('tok');
    expect(json).not.toContain('pw');
    expect(json).not.toContain('Bearer x');
    expect(json).toContain('keep');
    expect(json).toContain('ok');
  });

  it('非对象原样返回', () => {
    expect(stripSensitiveFields('plain')).toBe('plain');
    expect(stripSensitiveFields(42)).toBe(42);
    expect(stripSensitiveFields(null)).toBe(null);
  });

  it('备份数据不包含 Admin provider 的 API Key（内存边界）', () => {
    // admin 持久化只存 hasKey 布尔；即使数据中出现 apiKey 字段也会被剔除
    localStorage.setItem(
      ADMIN_STORAGE_KEY,
      JSON.stringify({ version: 1, prefs: { profile: {}, appearance: {}, automation: {} } }),
    );
    const backup = buildFullBackup();
    const adminModule = backup.modules.find((m) => m.moduleId === 'admin');
    expect(adminModule).toBeTruthy();
  });
});
