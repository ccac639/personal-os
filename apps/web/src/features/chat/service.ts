/**
 * Chat 功能域 —— 回复服务边界
 *
 * UI / store 只依赖 {@link ChatReplyService} 接口，不关心底层实现。
 * 当前提供 {@link MockChatReplyService}（本地模板回复 + 打字机式流式输出），
 * 未来接入真实 LLM（HTTP SSE / WebSocket）时：
 *   1. 实现同一接口（可改为逐段回调推送，或返回 AsyncIterable）
 *   2. 在应用启动处调用 setChatReplyService() 注入
 * store 与组件无需改动。
 */
import { mockReply } from './mock';
import type {
  ChatOutputMode,
  ChatReplyLength,
} from './types';

export interface GenerateReplyOptions {
  /** 取消信号：真实 socket/API 场景下用于中断请求 */
  signal?: AbortSignal;
  /** 创作控制台输出模式 */
  mode?: ChatOutputMode;
  /** 当前模型 id */
  model?: string;
  /** 回复长度档位 */
  replyLength?: ChatReplyLength;
  /** 会话级系统提示词文本 */
  systemPrompt?: string;
  /** 提示词预设展示名 */
  presetName?: string;
}

/** 聊天回复服务：输入用户消息，返回完整助手回复文本 */
export interface ChatReplyService {
  generateReply(input: string, options?: GenerateReplyOptions): Promise<string>;
}

/** 本地 mock 实现：按输出模式与模型生成确定性的演示内容 */
export class MockChatReplyService implements ChatReplyService {
  generateReply(input: string, options?: GenerateReplyOptions): Promise<string> {
    return Promise.resolve(
      mockReply(input, {
        mode: options?.mode,
        model: options?.model,
        replyLength: options?.replyLength,
        systemPrompt: options?.systemPrompt,
        presetName: options?.presetName,
      }),
    );
  }
}

let currentService: ChatReplyService = new MockChatReplyService();

/** 替换回复服务实现（真实模型 / socket 接入点；测试注入用） */
export function setChatReplyService(service: ChatReplyService): void {
  currentService = service;
}

export function getChatReplyService(): ChatReplyService {
  return currentService;
}
