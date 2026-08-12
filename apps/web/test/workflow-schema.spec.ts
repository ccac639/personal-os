import { describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import {
  delayToSeconds,
  isValidCron,
  normalizeDelay,
  resetToDefaults,
  secondsToDelayInput,
  validateNodeData,
  getNodeSchema,
} from '@/features/workflows/schema';
import { useWorkflowStore } from '@/features/workflows/store';
import type { WorkflowNodeData } from '@/features/workflows/types';

describe('workflow 节点配置 schema', () => {
  it('每种节点都有 schema 与默认值', () => {
    for (const kind of [
      'trigger',
      'prompt',
      'ai',
      'code',
      'condition',
      'delay',
      'notify',
      'output',
    ] as const) {
      const schema = getNodeSchema(kind);
      expect(schema.fields.length).toBeGreaterThan(0);
      expect(schema.defaults).toBeTruthy();
    }
  });

  it('恢复默认值：不含 label/kind，含类型默认字段', () => {
    const d = resetToDefaults('ai');
    expect(d.model).toBe('deepseek-v3');
    expect(d.temperature).toBe(0.7);
    expect(d.maxTokens).toBe(2048);
    expect('label' in d).toBe(false);
  });

  it('字段校验：必填、范围、Cron 格式', () => {
    const ai: WorkflowNodeData = { kind: 'ai', label: '', status: 'idle', prompt: '' };
    const errs = validateNodeData(ai);
    expect(errs.label).toBeTruthy();
    expect(errs.prompt).toBeTruthy();

    const badTemp: WorkflowNodeData = {
      kind: 'ai',
      label: 'x',
      status: 'idle',
      prompt: 'p',
      temperature: 3,
    };
    expect(validateNodeData(badTemp).temperature).toContain('0 ~ 2');

    const badCron: WorkflowNodeData = { kind: 'trigger', label: 't', status: 'idle', cron: '每天' };
    expect(validateNodeData(badCron).cron).toBeTruthy();
  });

  it('Cron 校验：合法 5 段通过，非法拒绝', () => {
    expect(isValidCron('0 9 * * *')).toBe(true);
    expect(isValidCron('*/5 * * * *')).toBe(true);
    expect(isValidCron('0 9 * *')).toBe(false);
    expect(isValidCron('a b c d e')).toBe(false);
  });

  it('延迟单位换算：ms / s / min', () => {
    expect(delayToSeconds(500, 'ms')).toBe(1); // 0.5s → 四舍五入 1
    expect(delayToSeconds(1000, 'ms')).toBe(1);
    expect(delayToSeconds(30, 's')).toBe(30);
    expect(delayToSeconds(2, 'min')).toBe(120);
    expect(delayToSeconds(-5, 's')).toBe(0);
  });

  it('秒 → 展示单位换算（自动选择自然单位）', () => {
    expect(secondsToDelayInput(0.5)).toEqual({ value: 500, unit: 'ms' });
    expect(secondsToDelayInput(30)).toEqual({ value: 30, unit: 's' });
    expect(secondsToDelayInput(120)).toEqual({ value: 2, unit: 'min' });
    expect(secondsToDelayInput(90)).toEqual({ value: 90, unit: 's' });
    expect(secondsToDelayInput(500)).toEqual({ value: 500, unit: 's' });
  });

  it('normalizeDelay：value+unit 规范化为 seconds', () => {
    const d: WorkflowNodeData = {
      kind: 'delay',
      label: 'd',
      status: 'idle',
      delayValue: 5,
      delayUnit: 'min',
    };
    const norm = normalizeDelay(d);
    expect(norm.seconds).toBe(300);
    expect(norm.delayUnit).toBe('min');
  });

  it('节点配置序列化：status 被剥离（store 导出）', () => {
    setActivePinia(createPinia());
    localStorage.clear();
    const store = useWorkflowStore();
    store.addNode('ai');
    store.updateNodeData('n-1', { temperature: 1.5, maxTokens: 4096 });
    const parsed = JSON.parse(store.exportJson());
    expect(parsed.nodes[0]!.data.temperature).toBe(1.5);
    expect(parsed.nodes[0]!.data.maxTokens).toBe(4096);
    expect(parsed.nodes[0]!.data.status).toBe('idle');
  });
});
