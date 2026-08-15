import { describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { mount } from '@vue/test-utils';

import AppErrorBoundary from '@/components/AppErrorBoundary.vue';

/** 渲染时抛错的子组件（render 阶段抛错 → 触发 onErrorCaptured） */
const BoomComponent = defineComponent({
  name: 'BoomComponent',
  setup() {
    return () => {
      throw new Error('boom-render-failure');
    };
  },
});

/** 正常子组件（重试后渲染） */
const OkComponent = defineComponent({
  name: 'OkComponent',
  setup() {
    return () => h('p', { 'data-testid': 'ok-content' }, '正常内容');
  },
});

describe('AppErrorBoundary 全局错误边界', () => {
  it('捕获渲染错误：降级 UI 出现，错误不白屏', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(AppErrorBoundary, {
      props: { name: 'test' },
      slots: { default: () => h(BoomComponent) },
    });
    // onErrorCaptured 设置 error ref 后，降级 UI 在下一 tick 渲染
    await nextTick();

    // 降级 UI：role=alert + 错误消息 + 重试按钮
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('页面渲染出错');
    expect(wrapper.text()).toContain('boom-render-failure');
    expect(wrapper.find('button').text()).toContain('重试');
    // 捕获并上报（console.error 带边界名前缀）
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[AppErrorBoundary:test]'),
      expect.any(Error),
      expect.any(String),
    );
    consoleSpy.mockRestore();
  });

  it('无错误时正常渲染 slot 内容', () => {
    const wrapper = mount(AppErrorBoundary, {
      props: { name: 'test' },
      slots: { default: () => h(OkComponent) },
    });
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ok-content"]').text()).toBe('正常内容');
  });

  it('重试：清空错误并 emit retry（父级 key bump 重建子树）', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let broken = true;

    const Parent = defineComponent({
      name: 'BoundaryParent',
      setup() {
        const boundaryKey = ref(0);
        return () =>
          h(
            AppErrorBoundary,
            {
              name: 'parent',
              key: boundaryKey.value,
              onRetry: () => {
                broken = false;
                boundaryKey.value += 1;
              },
            },
            {
              default: () => (broken ? h(BoomComponent) : h(OkComponent)),
            },
          );
      },
    });

    const wrapper = mount(Parent);
    await nextTick();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);

    await wrapper.find('button').trigger('click');
    await nextTick();
    // retry → 父级 key bump → 子树重建为正常组件
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ok-content"]').text()).toBe('正常内容');
    consoleSpy.mockRestore();
  });
});
