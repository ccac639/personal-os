import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ThreeDWorkspace from '@/features/chat/three-d/components/three-d-workspace.vue';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

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

/** 快捷键不劫持输入框 / 下拉框 / 弹窗内编辑 */
describe('3D 工作台 v2：快捷键与输入边界', () => {
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
          ThreeDCharacterBoard: true,
        },
      },
      attachTo: document.body,
    });
  }

  it('在输入框内按 W / Delete / Ctrl+Z 不触发工具切换或删除', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '项目', type: 'prop' });
    const cube = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    store.selectAsset(cube.id);
    const wrapper = mountWorkspace();

    const input = wrapper.find('input[aria-label^="项目名称"]');
    expect(input.exists()).toBe(true);
    await input.trigger('keydown', { key: 'w' });
    expect(store.ui.tool).toBe('select'); // 未被 W 切换

    await input.trigger('keydown', { key: 'Delete' });
    expect(store.activeProject!.assets).toHaveLength(1); // 未被删除

    await input.trigger('keydown', { key: 'z', ctrlKey: true });
    expect(store.canUndo).toBe(true); // 未触发撤销（撤销栈未变）

    await input.trigger('keydown', { key: 'ArrowRight' });
    expect(store.activeAsset!.transform.position[0]).toBe(0); // 未微调

    wrapper.unmount();
  });

  it('快捷键在非输入区域正常工作', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '项目', type: 'prop' });
    const wrapper = mountWorkspace();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
    expect(store.ui.tool).toBe('move');
    wrapper.unmount();
  });

  it('多选时 Delete 批量删除（画布降级环境下可用）', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '项目', type: 'prop' });
    const a = store.addAsset({ type: 'primitive', primitiveKind: 'cube' })!;
    const b = store.addAsset({ type: 'primitive', primitiveKind: 'sphere' })!;
    store.selectMany([a.id, b.id]);
    const wrapper = mountWorkspace();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }));
    expect(store.activeProject!.assets).toHaveLength(0);
    wrapper.unmount();
  });
});

/** WebGL 降级：结构化编辑仍可用 */
describe('3D 工作台 v2：WebGL 降级结构化编辑', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('降级下仍可编辑项目结构、区域、镜头与模板', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '降级项目', type: 'world' });
    const wrapper = mount(ThreeDWorkspace, {
      global: {
        stubs: {
          ThreeDCanvas: true,
          ThreeDAssetPanel: true,
          ThreeDInspector: true,
          ThreeDBriefPanel: true,
          ThreeDCharacterBoard: true,
        },
      },
      attachTo: document.body,
    });

    // 结构化数据编辑不依赖 WebGL
    expect(store.addRegionAction({ name: '区域 A' })).not.toBeNull();
    expect(store.addLightAction('point')).not.toBeNull();
    expect(store.saveShotFromCamera('镜头 1')).not.toBeNull();
    expect(store.saveCurrentAsTemplate('降级模板')).toBe(true);
    expect(store.activeProject!.regions).toHaveLength(1);
    expect(store.activeProject!.shots).toHaveLength(1);
    expect(store.templates).toHaveLength(1);
    expect(store.activeProject!.assets.filter((a) => a.type === 'light')).toHaveLength(1);
    wrapper.unmount();
  });

  it('场景设置 / 环境预设 / 姿态在降级下可编辑', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '降级角色', type: 'character' });
    const wrapper = mount(ThreeDWorkspace, {
      global: {
        stubs: {
          ThreeDCanvas: true,
          ThreeDAssetPanel: true,
          ThreeDInspector: true,
          ThreeDBriefPanel: true,
          ThreeDCharacterBoard: true,
        },
      },
      attachTo: document.body,
    });
    store.updateScene({ background: '#102030' });
    expect(store.activeProject!.sceneSettings.background).toBe('#102030');
    expect(store.applyEnvironmentPresetAction('showcase')).toBe(true);
    expect(store.setPoseAction('alert')).toBe(true);
    expect(store.activeProject!.character!.pose).toBe('alert');
    wrapper.unmount();
  });
});

/** 移动端抽屉行为 */
describe('3D 工作台 v2：移动端抽屉', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('抽屉关闭按钮可关闭资产 / 检查器抽屉', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '项目', type: 'prop' });
    const wrapper = mount(ThreeDWorkspace, {
      global: {
        stubs: {
          ThreeDCanvas: true,
          ThreeDAssetPanel: true,
          ThreeDInspector: true,
          ThreeDBriefPanel: true,
          ThreeDCharacterBoard: true,
        },
      },
      attachTo: document.body,
    });
    // 点击移动端「打开资产面板」按钮
    const openLeft = wrapper.find('button[aria-label="打开资产面板"]');
    expect(openLeft.exists()).toBe(true);
    await openLeft.trigger('click');
    await wrapper.vm.$nextTick();
    const closeLeft = wrapper.find('button[aria-label="关闭资产面板"]');
    expect(closeLeft.exists()).toBe(true);
    await closeLeft.trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('button[aria-label="关闭资产面板"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
