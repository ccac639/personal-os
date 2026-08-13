import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { defaultPreferences } from '@/features/admin/storage';
import { useAdminStore } from '@/features/admin/store';
import {
  simulateNotification,
  simulateAllNotifications,
  NOTIFICATION_KIND_LABELS,
  NOTIFICATION_DISCLAIMER,
} from '@/features/admin/notifications';
import { clearRollbackSnapshot } from '@/features/admin/restore';
import type { AutomationPrefs } from '@/features/admin/types';

function defaultAutomation(): AutomationPrefs {
  return defaultPreferences().automation;
}

describe('admin 通知模拟', () => {
  beforeEach(() => {
    clearRollbackSnapshot();
  });

  it('按偏好开关生成通知：关闭的类型返回 null', () => {
    const prefs = defaultAutomation();
    prefs.notifyWorkflowComplete = false;
    expect(simulateNotification('workflow-complete', prefs)).toBeNull();
    expect(simulateNotification('workflow-failed', prefs)).not.toBeNull();
  });

  it('全部关闭时模拟结果为空数组', () => {
    const prefs = defaultAutomation();
    prefs.notifyWorkflowComplete = false;
    prefs.notifyWorkflowFailed = false;
    prefs.notifyHealthWarning = false;
    prefs.dailyPlanReminder = false;
    prefs.deadlineReminder = false;
    prefs.weeklyReviewReminder = false;
    expect(simulateAllNotifications(prefs)).toHaveLength(0);
  });

  it('默认偏好生成 6 类通知且含时间戳', () => {
    const prefs = defaultAutomation();
    const list = simulateAllNotifications(prefs);
    expect(list).toHaveLength(6);
    for (const n of list) {
      expect(n.title.length).toBeGreaterThan(0);
      expect(n.body.length).toBeGreaterThan(0);
      expect(n.time).toMatch(/^\d{2}:\d{2}$/);
      expect(NOTIFICATION_KIND_LABELS[n.kind]).toBeTruthy();
    }
  });

  it('通知 id 自增且互不相同', () => {
    const prefs = defaultAutomation();
    const list = simulateAllNotifications(prefs);
    const ids = new Set(list.map((n) => n.id));
    expect(ids.size).toBe(list.length);
  });

  it('提醒内容引用偏好中的提醒时间', () => {
    const prefs = defaultAutomation();
    prefs.dailyPlanTime = '07:30';
    prefs.deadlineTime = '19:15';
    prefs.weeklyReviewTime = '21:00';
    const list = simulateAllNotifications(prefs);
    expect(list.find((n) => n.kind === 'daily-plan')?.body).toContain('07:30');
    expect(list.find((n) => n.kind === 'deadline')?.body).toContain('19:15');
    expect(list.find((n) => n.kind === 'weekly-review')?.body).toContain('21:00');
  });

  it('免责声明明确本地 mock 定位', () => {
    expect(NOTIFICATION_DISCLAIMER).toContain('本地 mock');
    expect(NOTIFICATION_DISCLAIMER).toContain('未来本地服务接入');
  });

  it('store 偏好持久化后可恢复通知配置', () => {
    setActivePinia(createPinia());
    localStorage.clear();
    const admin = useAdminStore();
    admin.prefs.automation.notifyWorkflowFailed = false;
    admin.prefs.automation.weeklyReviewReminder = false;
    expect(admin.savePrefs()).toBe(true);

    setActivePinia(createPinia());
    const reloaded = useAdminStore();
    expect(reloaded.prefs.automation.notifyWorkflowFailed).toBe(false);
    expect(reloaded.prefs.automation.weeklyReviewReminder).toBe(false);
    const list = simulateAllNotifications(reloaded.prefs.automation);
    expect(list.some((n) => n.kind === 'workflow-failed')).toBe(false);
    expect(list.some((n) => n.kind === 'weekly-review')).toBe(false);
  });
});
