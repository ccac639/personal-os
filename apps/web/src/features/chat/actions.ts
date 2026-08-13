/**
 * Chat 功能域 —— 生成结果操作分发
 *
 * 「加入任务 / 保存为成果 / 转为工作流草稿」：
 * 当前阶段只生成本地 action payload + toast 反馈，不修改其他模块 Store。
 * 未来集成任务 / 成果 / 工作流模块时，调用 setChatActionHandler() 注入
 * 真实回调即可，消息组件无需改动。
 */
import { pushToast } from './toast';
import type { ChatActionKind, ChatResultAction } from './types';

export type ChatActionHandler = (action: ChatResultAction) => void;

let currentHandler: ChatActionHandler | null = null;

/** 注入真实模块回调（未来接入点） */
export function setChatActionHandler(handler: ChatActionHandler | null): void {
  currentHandler = handler;
}

const FEEDBACK: Record<ChatActionKind, string> = {
  'add-task': '已生成任务草稿（本地演示）',
  'save-artifact': '已保存为成果草稿（本地演示）',
  'workflow-draft': '已生成工作流草稿（本地演示）',
  'save-inspiration': '已打开灵感保存表单',
  'create-agent-variant': '已打开智能体变体表单',
};

/** 无注入回调时的默认反馈文本（视图层组合 handler 兜底用） */
export function defaultActionFeedback(kind: ChatActionKind): string {
  return FEEDBACK[kind];
}

/** 分发结果操作：有注入回调则调用，否则本地 toast 演示 */
export function dispatchChatAction(action: ChatResultAction): void {
  if (currentHandler) {
    currentHandler(action);
    return;
  }
  pushToast(FEEDBACK[action.kind]);
}
