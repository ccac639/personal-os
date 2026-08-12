/**
 * Chat 功能域 —— 通用工具
 */

/** 生成短唯一 id（时间戳 + 随机段） */
export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 从首条用户消息生成会话标题：
 * - 确定性的本地逻辑，不调用模型
 * - 去除多余空白（连续空白 / 换行合并为单个空格）
 * - 超长截断，长度限制合理
 */
export function normalizeTitle(input: string, max = 24): string {
  const cleaned = input.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max)}…`;
}
