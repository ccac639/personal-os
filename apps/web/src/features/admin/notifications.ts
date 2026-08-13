/**
 * Admin 功能域 —— 自动化与通知偏好 + 模拟通知
 *
 * - 只管理前端偏好（不注册真实系统任务 / 定时器 / 浏览器推送）。
 * - 模拟通知使用应用内 toast 面板，不调用浏览器 Notification 权限。
 * - 明确文案：真实定时与推送能力需未来本地服务接入。
 */
import type { AutomationPrefs, SimulatedNotification, SimulatedNotificationKind } from './types';

export const NOTIFICATION_KIND_LABELS: Record<SimulatedNotificationKind, string> = {
  'workflow-complete': '工作流完成',
  'workflow-failed': '工作流失败',
  'health-warning': '健康预警',
  'daily-plan': '今日计划',
  deadline: '截止日期',
  'weekly-review': '周复盘',
};

let seq = 0;

function nowTime(): string {
  const d = new Date();
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** 根据偏好生成一条模拟通知（确定性：按偏好开关键过滤） */
export function simulateNotification(
  kind: SimulatedNotificationKind,
  prefs: AutomationPrefs,
): SimulatedNotification | null {
  const enabledByKind: Record<SimulatedNotificationKind, boolean> = {
    'workflow-complete': prefs.notifyWorkflowComplete,
    'workflow-failed': prefs.notifyWorkflowFailed,
    'health-warning': prefs.notifyHealthWarning,
    'daily-plan': prefs.dailyPlanReminder,
    deadline: prefs.deadlineReminder,
    'weekly-review': prefs.weeklyReviewReminder,
  };
  if (!enabledByKind[kind]) return null;

  const time = nowTime();
  seq += 1;
  switch (kind) {
    case 'workflow-complete':
      return {
        id: seq,
        kind,
        title: '工作流运行完成',
        body: '「发布检查」已在本地模拟环境运行完成，未发现阻断项。',
        time,
      };
    case 'workflow-failed':
      return {
        id: seq,
        kind,
        title: '工作流运行失败',
        body: '「每日备份」运行失败：模拟步骤 2 返回错误，请查看运行日志。',
        time,
      };
    case 'health-warning':
      return {
        id: seq,
        kind,
        title: '项目健康预警',
        body: '项目「Personal OS」健康分低于 60，建议复核依赖与测试状态。',
        time,
      };
    case 'daily-plan':
      return {
        id: seq,
        kind,
        title: '今日计划提醒',
        body: `你今日有 3 项计划任务待完成（提醒时间 ${prefs.dailyPlanTime}）。`,
        time,
      };
    case 'deadline':
      return {
        id: seq,
        kind,
        title: '截止日期提醒',
        body: `1 项任务将于明天截止（提醒时间 ${prefs.deadlineTime}）。`,
        time,
      };
    case 'weekly-review':
      return {
        id: seq,
        kind,
        title: '周复盘提醒',
        body: `本周复盘待完成（提醒时间 ${prefs.weeklyReviewTime}）。`,
        time,
      };
  }
}

/** 生成一组模拟通知（按偏好过滤；无可用项时返回空数组） */
export function simulateAllNotifications(prefs: AutomationPrefs): SimulatedNotification[] {
  const kinds: SimulatedNotificationKind[] = [
    'workflow-complete',
    'workflow-failed',
    'health-warning',
    'daily-plan',
    'deadline',
    'weekly-review',
  ];
  return kinds
    .map((k) => simulateNotification(k, prefs))
    .filter((n): n is SimulatedNotification => n !== null);
}

/** 真实定时 / 推送能力说明（固定文案） */
export const NOTIFICATION_DISCLAIMER =
  '当前为本地 mock 前端：以上通知仅为应用内模拟。真实定时任务与推送能力需未来本地服务接入后启用。';
