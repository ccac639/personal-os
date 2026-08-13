import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ThreeDCanvas from '@/features/chat/three-d/components/three-d-canvas.vue';
import ThreeDWorkspace from '@/features/chat/three-d/components/three-d-workspace.vue';
import { createProject, addAssetToProject } from '@/features/chat/three-d/domain';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';
import type { ThreeDProject } from '@/features/chat/three-d/types';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/** 确定性 WebGL 失败：jsdom 行为不一致时仍可测降级路径 */
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  return {
    ...actual,
    WebGLRenderer: class {
      constructor() {
        throw new Error('WebGL not supported (test mock)');
      }
    },
  };
});

function makeCanvasProject(): ThreeDProject {
  const p = createProject({ name: '画布项目', type: 'prop' });
  addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' });
  addAssetToProject(p, { type: 'primitive', primitiveKind: 'sphere' });
  return p;
}

describe('3D 画布：WebGL 初始化失败降级', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('jsdom 无 WebGL 上下文 → 显示可恢复降级界面并发出事件', async () => {
    const wrapper = mount(ThreeDCanvas, {
      props: { project: makeCanvasProject(), tool: 'select' },
      attachTo: document.body,
    });
    await wrapper.vm.$nextTick();
    // WebGL 不可用 → 降级 UI + 事件
    expect(wrapper.find('[data-testid="webgl-fallback"]').exists()).toBe(true);
    expect(wrapper.find('[role="alert"]').text()).toContain('WebGL');
    expect(wrapper.emitted('webgl-failed')).toBeTruthy();
    wrapper.unmount();
  });
});

describe('3D 工作台：交互（画布以桩替代）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  function mountWorkspace() {
    return mount(ThreeDWorkspace, {
      global: {
        stubs: {
          ThreeDCanvas: true,
          ThreeDAssetPanel: true,
          ThreeDInspector: true,
          ThreeDBriefPanel: true,
        },
      },
      attachTo: document.body,
    });
  }

  it('相机预设切换写入项目', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '相机项目', type: 'character' });
    const wrapper = mountWorkspace();
    const select = wrapper.find('select[aria-label^="相机预设"]');
    expect(select.exists()).toBe(true);
    await select.setValue('front');
    expect(store.activeProject!.cameraPreset).toBe('front');
    wrapper.unmount();
  });

  it('快捷键：W/E/R 工具切换、Delete 删除、Escape 取消选择', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '快捷键项目', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    store.selectAsset(cube.id);
    const wrapper = mountWorkspace();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(store.ui.tool).toBe('move');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
    expect(store.ui.tool).toBe('rotate');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    expect(store.ui.tool).toBe('scale');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }));
    expect(store.ui.tool).toBe('select');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(store.activeProject!.assets).toHaveLength(0);

    // Escape 取消选择
    const sphere = store.addAsset({ type: 'primitive', primitiveKind: 'sphere' })!;
    store.selectAsset(sphere.id);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(store.activeProject!.activeAssetId).toBeNull();
    wrapper.unmount();
  });

  it('快捷键：Ctrl+Z 撤销 / Ctrl+Shift+Z 重做', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '撤销项目', type: 'prop' });
    const wrapper = mountWorkspace();
    store.addAsset({ type: 'primitive', primitiveKind: 'cube' });
    expect(store.activeProject!.assets).toHaveLength(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
    expect(store.activeProject!.assets).toHaveLength(0);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true }));
    expect(store.activeProject!.assets).toHaveLength(1);
    wrapper.unmount();
  });

  it('快捷键：方向键微调变换（移动模式）', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '微调项目', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    store.selectAsset(cube.id);
    store.ui.tool = 'move';
    const wrapper = mountWorkspace();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(store.activeAsset!.transform.position[0]).toBeCloseTo(0.1);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp' }));
    expect(store.activeAsset!.transform.position[1]).toBeCloseTo(0.1);
    wrapper.unmount();
  });

  it('输入框聚焦时快捷键不劫持', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '输入项目', type: 'prop' });
    const wrapper = mountWorkspace();
    store.ui.tool = 'select';
    // 模拟在输入框内按键：不切换工具
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', bubbles: true }));
    expect(store.ui.tool).toBe('select');
    input.remove();
    wrapper.unmount();
  });

  it('移动端抽屉：打开资产面板与检查器', async () => {
    const wrapper = mountWorkspace();
    const leftBtn = wrapper.find('button[aria-label="打开资产面板"]');
    expect(leftBtn.exists()).toBe(true);
    await leftBtn.trigger('click');
    expect(wrapper.find('button[aria-label="关闭资产面板"]').exists()).toBe(true);
    await wrapper.find('button[aria-label="关闭资产面板"]').trigger('click');
    expect(wrapper.find('button[aria-label="关闭资产面板"]').exists()).toBe(false);

    const rightBtn = wrapper.find('button[aria-label="打开检查器"]');
    await rightBtn.trigger('click');
    expect(wrapper.find('button[aria-label="关闭检查器"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('撤销 / 重做按钮可用态与行为', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '按钮项目', type: 'prop' });
    const wrapper = mountWorkspace();
    store.addAsset({ type: 'primitive', primitiveKind: 'cube' });
    await wrapper.vm.$nextTick();
    const undoBtn = wrapper.find('button[aria-label="撤销"]');
    expect(undoBtn.attributes('disabled')).toBeUndefined();
    await undoBtn.trigger('click');
    expect(store.activeProject!.assets).toHaveLength(0);
    await wrapper.vm.$nextTick();
    const redoBtn = wrapper.find('button[aria-label="重做"]');
    await redoBtn.trigger('click');
    expect(store.activeProject!.assets).toHaveLength(1);
    wrapper.unmount();
  });

  it('新建项目对话框：输入名称与模式创建', async () => {
    const store = useThreeDWorkspaceStore();
    const wrapper = mountWorkspace();
    await wrapper.find('button[aria-label="新建 3D 项目"]').trigger('click');
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    const nameInput = wrapper.find('input[aria-label="项目名称"]');
    await nameInput.setValue('对话框项目');
    await wrapper.find('button[aria-label="创建项目"]').trigger('click');
    expect(store.projects.some((p) => p.name === '对话框项目')).toBe(true);
    wrapper.unmount();
  });
});
