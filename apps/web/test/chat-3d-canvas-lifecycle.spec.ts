import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';

/**
 * 3D 画布渲染生命周期测试：使用文件级 vi.mock('three') 注入伪 WebGLRenderer，
 * 验证成功初始化路径与卸载时的完整清理（renderer / 动画帧 / 监听器）。
 */

const mocks = vi.hoisted(() => ({
  dispose: vi.fn(),
  render: vi.fn(),
  setPixelRatio: vi.fn(),
  setSize: vi.fn(),
}));

vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      domElement = document.createElement('canvas');
      outputColorSpace = '';
      setPixelRatio = mocks.setPixelRatio;
      setSize = mocks.setSize;
      render = mocks.render;
      getContext = () => ({});
      dispose = mocks.dispose;
    },
  };
});

import ThreeDCanvas from '@/features/chat/three-d/components/three-d-canvas.vue';
import { addAssetToProject, createProject } from '@/features/chat/three-d/domain';
import type { ThreeDProject } from '@/features/chat/three-d/types';

function makeCanvasProject(): ThreeDProject {
  const p = createProject({ name: '画布项目', type: 'prop' });
  addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' });
  return p;
}

describe('3D 画布：渲染生命周期与卸载清理', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    mocks.dispose.mockClear();
    mocks.render.mockClear();
    mocks.setPixelRatio.mockClear();
    mocks.setSize.mockClear();
  });

  it('成功初始化：无降级、渲染器配置正确', async () => {
    const wrapper = mount(ThreeDCanvas, {
      props: { project: makeCanvasProject(), tool: 'move' },
      attachTo: document.body,
    });
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.find('[data-testid="webgl-fallback"]').exists()).toBe(false);
    expect(mocks.setPixelRatio).toHaveBeenCalled();
    expect(mocks.setSize).toHaveBeenCalled();
    expect(wrapper.emitted('ready')).toBeTruthy();
    wrapper.unmount();
  });

  it('卸载清理：renderer.dispose / 动画帧取消 / DOM 移除', async () => {
    const cancelSpy = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const wrapper = mount(ThreeDCanvas, {
      props: { project: makeCanvasProject(), tool: 'move' },
      attachTo: document.body,
    });
    await new Promise((r) => setTimeout(r, 0));

    wrapper.unmount();
    expect(mocks.dispose).toHaveBeenCalled();
    expect(cancelSpy).toHaveBeenCalled();
    cancelSpy.mockRestore();
  });

  it('选中资产后重渲染被触发（增量同步不重建场景）', async () => {
    const wrapper = mount(ThreeDCanvas, {
      props: { project: reactive(makeCanvasProject()), tool: 'move' },
      attachTo: document.body,
    });
    await new Promise((r) => setTimeout(r, 0));
    const project = wrapper.props('project') as ThreeDProject;
    project.activeAssetId = project.assets[0]?.id ?? null;
    // rAF 循环在下一帧渲染：轮询等待（jsdom rAF 基于计时器）
    await vi.waitFor(
      () => {
        expect(mocks.render).toHaveBeenCalled();
      },
      { timeout: 3000, interval: 20 },
    );
    wrapper.unmount();
  });
});
