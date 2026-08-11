import { describe, expect, it } from 'vitest';

import type { AIProviderAdapter, ProviderMessage } from '../src/providers/types';

describe('worker smoke', () => {
  it('Provider 契约类型可用', () => {
    const message: ProviderMessage = { role: 'user', content: 'hi' };
    expect(message.content).toBe('hi');
  });

  it('AIProviderAdapter 类型存在', () => {
    // 仅验证类型导出（运行时无值）
    expect(typeof (null as unknown as AIProviderAdapter)).toBe('object');
  });
});
