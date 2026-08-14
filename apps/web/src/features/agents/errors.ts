/**
 * Agents 管理功能域 —— API 错误归一化
 *
 * 把任意异常转成用户可读的 {@link AgentErrorInfo}，并保留服务端 requestId
 * 供排障（对应后端 AllExceptionsFilter 的 x-request-id 链路）。
 */
import { AgentApiError } from '@/services/agents';

export interface AgentErrorInfo {
  /** 用户可读提示 */
  message: string;
  /** 服务端请求链路 ID（排障用） */
  requestId?: string;
  code?: string;
  statusCode?: number;
}

/** 按 HTTP 状态码兜底文案（服务端 message 缺失时使用） */
const FALLBACK_BY_STATUS: Record<number, string> = {
  400: '请求参数有误，请检查输入后重试',
  401: '未授权访问，请检查 API Key 配置',
  403: '没有权限执行该操作',
  404: '目标不存在或已被删除',
  409: '数据冲突，请刷新后重试',
  413: '内容超出长度限制，请精简后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务暂时不可用，请稍后再试',
  502: '服务暂时不可用，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
  504: '服务暂时不可用，请稍后再试',
};

const DEFAULT_FALLBACK = '操作失败，请稍后再试';

/** 归一化异常 → 用户可读错误信息（服务端中文 message 优先） */
export function toAgentErrorInfo(err: unknown, fallback = DEFAULT_FALLBACK): AgentErrorInfo {
  if (err instanceof AgentApiError) {
    const status = err.statusCode ?? 0;
    const message = err.message.length > 0 ? err.message : (FALLBACK_BY_STATUS[status] ?? fallback);
    return {
      message,
      requestId: err.requestId,
      code: err.code,
      statusCode: err.statusCode,
    };
  }
  if (err instanceof TypeError) {
    return { message: '无法连接服务，请确认后端已启动后重试' };
  }
  return { message: fallback };
}

/** 追加 requestId 到提示文案（展示用） */
export function requestIdSuffix(info: AgentErrorInfo | null): string {
  return info?.requestId ? `（requestId: ${info.requestId}）` : '';
}
