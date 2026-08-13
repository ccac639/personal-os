import { describe, expect, it, vi } from 'vitest';
import { mount } from '@vue/test-utils';

import QuickCaptureInput from '@/features/tasks/quick-capture-input.vue';

describe('快速捕获输入组件（交互 / 可访问性）', () => {
  it('输入解析预览 + 回车提交解析结果', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-13T12:00:00+08:00'));

    const wrapper = mount(QuickCaptureInput);
    const input = wrapper.find('input');
    expect(input.attributes('placeholder')).toContain('快速输入');

    await input.setValue('#发布 写发布说明 明天 !高');
    // 预览区展示解析结果
    const text = wrapper.text();
    expect(text).toContain('写发布说明');
    expect(text).toContain('2026-08-14');
    expect(text).toContain('#发布');

    await input.trigger('keydown.enter');
    const emitted = wrapper.emitted('submit');
    expect(emitted).toHaveLength(1);
    const payload = emitted![0]![0] as {
      title: string;
      dueDate?: string;
      priority: string;
      tags: string[];
    };
    expect(payload.title).toBe('写发布说明');
    expect(payload.dueDate).toBe('2026-08-14');
    expect(payload.priority).toBe('high');
    expect(payload.tags).toEqual(['发布']);
    // 提交后清空
    expect((input.element as HTMLInputElement).value).toBe('');
    vi.useRealTimers();
  });

  it('空输入回车不提交', async () => {
    const wrapper = mount(QuickCaptureInput);
    await wrapper.find('input').trigger('keydown.enter');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('解析失败时不显示误导性预览', async () => {
    const wrapper = mount(QuickCaptureInput);
    await wrapper.find('input').setValue('!高');
    expect(wrapper.text()).not.toContain('截止：');
  });
});
