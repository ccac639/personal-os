import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addAssetToProject,
  addLightToProject,
  applyEnvironmentPreset,
  applySnap,
  createProject,
  setMaterialPreset,
  updateMaterialParams,
} from '@/features/chat/three-d/domain';
import { normalizeMaterialParams } from '@/features/chat/three-d/constants';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';

describe('3D 编辑辅助：吸附 / 坐标系 / 材质归一化 / 灯光限制 / 环境预设撤销', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('吸附：网格 / 角度 / 缩放步长', () => {
    const snap = {
      grid: true,
      gridStep: 0.5,
      angle: true,
      angleStep: 15,
      scale: true,
      scaleStep: 0.25,
    };
    expect(applySnap(0.12, 'grid', snap)).toBe(0);
    expect(applySnap(0.6, 'grid', snap)).toBe(0.5);
    expect(applySnap(10, 'angle', snap)).toBe(15);
    expect(applySnap(0.3, 'scale', snap)).toBe(0.25);
    // 关闭后不吸附
    const off = { ...snap, grid: false, angle: false, scale: false };
    expect(applySnap(0.12, 'grid', off)).toBe(0.12);
    expect(applySnap(10, 'angle', off)).toBe(10);
  });

  it('方向键微调受吸附开关影响（store）', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '吸附', type: 'prop' });
    store.addAsset({ type: 'primitive', primitiveKind: 'cube' });
    store.ui.tool = 'move';
    // 默认吸附关闭：精确 0.1
    store.nudgeAsset(0, 1, 0.1);
    expect(store.activeAsset!.transform.position[0]).toBeCloseTo(0.1, 5);
    // 开启网格吸附 0.5：0.2 → 吸附到 0
    store.ui.snap.grid = true;
    store.nudgeAsset(0, 1, 0.1);
    expect(store.activeAsset!.transform.position[0]).toBeCloseTo(0, 5);
  });

  it('坐标系偏好持久化（world/local）', () => {
    const store = useThreeDWorkspaceStore();
    expect(store.ui.coordSpace).toBe('world');
    store.ui.coordSpace = 'local';
    store.flushSave();
    setActivePinia(createPinia());
    const store2 = useThreeDWorkspaceStore();
    expect(store2.ui.coordSpace).toBe('local');
  });

  it('材质参数归一化：范围钳制与默认值', () => {
    expect(normalizeMaterialParams(undefined)).toEqual({
      roughness: 0.6,
      metalness: 0.12,
      opacity: 1,
      emissiveIntensity: 0,
    });
    expect(
      normalizeMaterialParams({
        roughness: 99,
        metalness: -5,
        opacity: 0.5,
        emissiveIntensity: 100,
      }),
    ).toEqual({ roughness: 1, metalness: 0, opacity: 0.5, emissiveIntensity: 5 });
    expect(normalizeMaterialParams({ roughness: Number.NaN } as never)).toEqual({
      roughness: 0.6,
      metalness: 0.12,
      opacity: 1,
      emissiveIntensity: 0,
    });
  });

  it('设置材质预设重置受控参数；单独调整参数进入历史', () => {
    const p = createProject({ name: '材质', type: 'prop' });
    const asset = addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' })!;
    setMaterialPreset(p, asset.id, 'metal');
    expect(p.assets[0]!.materialParams).toEqual({
      roughness: 0.35,
      metalness: 0.9,
      opacity: 1,
      emissiveIntensity: 0,
    });
    updateMaterialParams(p, asset.id, { roughness: 0.1, metalness: 2 });
    expect(p.assets[0]!.materialParams!.metalness).toBe(1); // 钳制
    expect(p.history.some((h) => h.kind === 'material')).toBe(true);
  });

  it('灯光数量上限：第 13 盏被拒绝', () => {
    const p = createProject({ name: '灯光', type: 'prop' });
    for (let i = 0; i < 12; i += 1) {
      expect(addLightToProject(p, 'point')).not.toBeNull();
    }
    expect(addLightToProject(p, 'spot')).toBeNull();
    expect(p.assets.filter((a) => a.type === 'light')).toHaveLength(12);
  });

  it('store 新增灯光：上限提示不崩溃', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '灯', type: 'prop' });
    for (let i = 0; i < 12; i += 1) store.addLightAction('point');
    const light = store.addLightAction('spot');
    expect(light).toBeNull();
    expect(store.activeProject!.assets.filter((a) => a.type === 'light')).toHaveLength(12);
  });

  it('环境预设：应用可撤销，场景设置被替换', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '环境', type: 'world' });
    const before = store.activeProject!.sceneSettings.background;
    expect(store.applyEnvironmentPresetAction('night-city')).toBe(true);
    expect(store.activeProject!.environmentPreset).toBe('night-city');
    expect(store.activeProject!.sceneSettings.background).toBe('#0b1120');
    store.undo();
    expect(store.activeProject!.sceneSettings.background).toBe(before);
    expect(store.activeProject!.environmentPreset).toBe('custom');
    store.redo();
    expect(store.activeProject!.environmentPreset).toBe('night-city');
  });

  it('保存自定义环境：标记 custom 并命名；领域层同样可撤销', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '环境', type: 'prop' });
    store.updateScene({ background: '#123456' });
    store.saveCustomEnvironmentAction('我的展台');
    expect(store.activeProject!.environmentPreset).toBe('custom');
    expect(store.activeProject!.environmentCustomName).toBe('我的展台');
    // 领域层：应用预设返回新项目且记录环境历史
    const p = createProject({ name: '域', type: 'world' });
    const next = applyEnvironmentPreset(p, 'desert-dusk');
    expect(next.environmentPreset).toBe('desert-dusk');
    expect(next.history.some((h) => h.kind === 'environment')).toBe(true);
  });
});
