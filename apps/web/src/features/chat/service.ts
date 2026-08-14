/**
 * Chat 功能域 —— 回复服务边界
 *
 * UI / store 只依赖 {@link ChatReplyService} 接口，不关心底层实现。
 * 默认 {@link HttpChatReplyService}：真实后端优先（POST /api/ai/chat），
 * 后端不可达 / 未配置 / 超时 / 业务错误时降级 {@link MockChatReplyService}
 * （本地模板回复，保留离线演示可用）；用户主动取消透传，不降级。
 * 测试环境默认关闭真实请求（与 sync 引擎 isSyncEnabled 同模式），直接走 mock。
 */
import { HttpChatApiClient, isChatAbortError, type ChatApiClient } from './api';
import type { ChatApiTurn } from './api';
import { mockReply } from './mock';
import type { ChatOutputMode, ChatReplyLength } from './types';

/** 对话历史轮次（多轮上下文；后端 AiChatDto.messages 的 user/assistant 子集） */
export interface ChatHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface GenerateReplyOptions {
  /** 取消信号：真实 socket/API 场景下用于中断请求 */
  signal?: AbortSignal;
  /** 多轮历史（当前 prompt 之前的 user/assistant 轮次，按时间正序） */
  history?: ChatHistoryTurn[];
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
  /** 智能体上下文（启动智能体的会话） */
  agentId?: string;
  agentName?: string;
}

/** 聊天回复服务：输入用户消息，返回完整助手回复文本 */
export interface ChatReplyService {
  generateReply(input: string, options?: GenerateReplyOptions): Promise<string>;
}

/**
 * 后端 AiChatDto.messages 上限（ArrayMaxSize(20)，含 system 与末条 user）。
 * 超出时从历史末尾保留最近轮次（丢弃最旧）。
 */
const MAX_MESSAGES = 20;

/** 组装下发消息：system（可选） + 历史（裁剪到上限） + 当前 user（末条） */
export function buildChatMessages(input: string, options?: GenerateReplyOptions): ChatApiTurn[] {
  const messages: ChatApiTurn[] = [];
  if (options?.systemPrompt && options.systemPrompt.trim()) {
    messages.push({ role: 'system', content: options.systemPrompt });
  }
  const history = options?.history ?? [];
  const room = MAX_MESSAGES - messages.length - 1;
  if (room > 0) {
    for (const h of history.slice(-room)) {
      messages.push(h);
    }
  }
  messages.push({ role: 'user', content: input });
  return messages;
}

/** 本地 mock 实现：按输出模式与模型生成确定性的演示内容 */
export class MockChatReplyService implements ChatReplyService {
  generateReply(input: string, options?: GenerateReplyOptions): Promise<string> {
    return Promise.resolve(
      mockReply(input, {
        history: options?.history,
        mode: options?.mode,
        model: options?.model,
        replyLength: options?.replyLength,
        systemPrompt: options?.systemPrompt,
        presetName: options?.presetName,
        agentId: options?.agentId,
        agentName: options?.agentName,
      }),
    );
  }
}

export interface HttpChatReplyServiceOptions {
  /** 真实后端客户端（默认 ofetch 单例；测试注入 fake） */
  api?: ChatApiClient;
  /** 降级实现（默认本地 mock） */
  fallback?: ChatReplyService;
  /** 是否启用真实请求（默认非 test 模式启用，与 isSyncEnabled 同模式） */
  enabled?: boolean;
}

/**
 * 真实优先 + mock 降级的组合服务：接线运行态 store 到后端对话端点。
 * - 成功：返回模型回复（流式由 store 打字机推进，服务层保持「完整文本」契约）；
 * - 失败（网络 / 超时 / 未配置 / 业务错误）：降级 mock，保留离线演示；
 * - 用户主动取消：透传 ChatApiError('aborted')，由 store 静默收尾（不降级）。
 */
export class HttpChatReplyService implements ChatReplyService {
  private readonly api: ChatApiClient;
  private readonly fallback: ChatReplyService;
  private readonly enabled: boolean;

  constructor(options: HttpChatReplyServiceOptions = {}) {
    this.api = options.api ?? new HttpChatApiClient();
    this.fallback = options.fallback ?? new MockChatReplyService();
    this.enabled = options.enabled ?? import.meta.env.MODE !== 'test';
  }

  async generateReply(input: string, options?: GenerateReplyOptions): Promise<string> {
    if (!this.enabled) return this.fallback.generateReply(input, options);
    try {
      const result = await this.api.complete(
        { messages: buildChatMessages(input, options), model: options?.model },
        { signal: options?.signal },
      );
      return result.content;
    } catch (err) {
      if (isChatAbortError(err)) throw err; // 用户主动取消：透传，由 store 静默收尾
      // 后端不可达 / 未配置 / 超时 / 业务错误：降级本地模板，保留离线演示可用
      return this.fallback.generateReply(input, options);
    }
  }
}

let currentService: ChatReplyService = new HttpChatReplyService();

/** 替换回复服务实现（真实模型 / socket 接入点；测试注入用） */
export function setChatReplyService(service: ChatReplyService): void {
  currentService = service;
}

export function getChatReplyService(): ChatReplyService {
  return currentService;
}
