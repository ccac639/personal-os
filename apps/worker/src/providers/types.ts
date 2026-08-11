import type { z } from 'zod';

/** AI 对话消息（Provider 层基础契约，业务 Schema 后续在各 provider 内定义） */
export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Provider 适配器统一接口（本阶段仅定义契约，不实现业务逻辑） */
export interface AIProviderAdapter {
  readonly id: 'openai' | 'anthropic' | 'google' | 'openrouter';
  /** 预留：chat 方法签名，后续阶段实现 */
  chat(messages: ProviderMessage[]): Promise<string>;
  /** 预留：Provider 级配置 Schema（zod） */
  configSchema(): z.ZodType;
}
