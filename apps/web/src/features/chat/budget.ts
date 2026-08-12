/**
 * Chat 功能域 —— 本地上下文预算估算
 *
 * 不调用真实 tokenizer（无后端、零依赖）：
 * - 中日韩字符按 1 字符 ≈ 1 token
 * - 其余字符按 4 字符 ≈ 1 token
 * - 每条消息附加固定开销（元数据）
 * 模型上下文上限从模型目录的 context 文案解析（如「128K 上下文」）。
 * 仅用于 UI 提示（过长警告 / 预算条），不是精确计费依据。
 */
import { modelById } from './models';
import type { ChatSession } from './types';

const CJK_RE = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/g;
/** 每条消息的元数据估算开销（token） */
const PER_MESSAGE_OVERHEAD = 8;
/** 预算警告阈值：达到上限 70% 提示「上下文较长」 */
export const CONTEXT_WARN_RATIO = 0.7;
/** 预算危险阈值：达到上限 90% 提示「接近上限」 */
export const CONTEXT_DANGER_RATIO = 0.9;

/** 启发式估算一段文本的 token 数（确定性，非真实 tokenizer） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(CJK_RE) ?? []).length;
  const rest = text.length - cjk;
  return cjk + Math.ceil(rest / 4) + 1;
}

/** 从模型目录文案解析上下文上限（如「128K 上下文」→ 131072） */
export function contextLimitOf(modelId?: string): number {
  const ctx = (modelId ? modelById(modelId)?.context : undefined) ?? '128K 上下文';
  const match = /(\d+(?:\.\d+)?)\s*K/i.exec(ctx);
  const k = match ? Number.parseFloat(match[1] ?? '128') : 128;
  return Math.round(k * 1024);
}

/** 估算整个会话的上下文用量（消息 + 系统提示词 + 消息开销） */
export function estimateSessionTokens(session: ChatSession): number {
  let total = 0;
  for (const m of session.messages) {
    total += estimateTokens(m.content);
  }
  if (session.systemPrompt?.text) {
    total += estimateTokens(session.systemPrompt.text);
  }
  total += session.messages.length * PER_MESSAGE_OVERHEAD;
  return total;
}

export type BudgetLevel = 'ok' | 'warn' | 'danger';

export interface BudgetInfo {
  used: number;
  limit: number;
  /** used / limit（limit 为 0 时按 0 处理） */
  ratio: number;
  level: BudgetLevel;
}

/** 会话上下文预算：ok < 70% ≤ warn < 90% ≤ danger */
export function budgetInfo(
  session: ChatSession | null,
  modelId?: string,
): BudgetInfo {
  const limit = contextLimitOf(modelId);
  const used = session ? estimateSessionTokens(session) : 0;
  const ratio = limit > 0 ? used / limit : 0;
  const level: BudgetLevel =
    ratio >= CONTEXT_DANGER_RATIO
      ? 'danger'
      : ratio >= CONTEXT_WARN_RATIO
        ? 'warn'
        : 'ok';
  return { used, limit, ratio, level };
}
