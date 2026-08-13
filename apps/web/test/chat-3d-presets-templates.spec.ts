import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  applyTemplateToProject,
  createProject,
  insertAssetPreset,
  remapProjectIds,
} from '@/features/chat/three-d/domain';
import {
  BUILTIN_ASSET_PRESETS,
  BUILTIN_PROJECT_TEMPLATES,
  buildTemplateProject,
  findAssetPreset,
  findTemplate,
} from '@/features/chat/three-d/presets';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';

describe('3D 预设库：插入与 ID 隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('内置预设完全由 primitive / group 构成，无外链引用', () => {
    expect(BUILTIN_ASSET_PRESETS.length).toBeGreaterThanOrEqual(8);
    for (const preset of BUILTIN_ASSET_PRESETS) {
      const json = JSON.stringify(preset);
      expect(json).not.toMatch(/http|data:|\.glb|\.fbx/i);
      // 第一项为根 group，其余为 primitive 且引用根
      expect(preset.assets[0]!.type).toBe('group');
      for (const a of preset.assets.slice(1)) {
        expect(a.type).toBe('primitive');
        expect(a.parentId).toBe(preset.assets[0]!.id);
      }
    }
  });

  it('插入预设：全新 ID、合理命名、默认位置 + 根偏移', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '场景', type: 'prop' });
    const preset = BUILTIN_ASSET_PRESETS[0]!;
    const root = store.insertPresetAction(preset.id, [3, 0, 0]);
    expect(root).not.toBeNull();
    const p = store.activeProject!;
    expect(p.assets).toHaveLength(preset.assets.length);
    // 所有 ID 均为全新（不与预设共享）
    const presetIds = new Set(preset.assets.map((a) => a.id));
    for (const a of p.assets) {
      expect(presetIds.has(a.id)).toBe(false);
      expect(a.locked).toBe(false);
      expect(a.notes).toContain('来自预设');
    }
    expect(root!.transform.position[0]).toBe(3);
  });

  it('重复插入：每次独立 ID，互不干扰', () => {
    const p = createProject({ name: '场景', type: 'prop' });
    const preset = BUILTIN_ASSET_PRESETS[0]!;
    const rootA = insertAssetPreset(p, preset, [0, 0, 0])!;
    const rootB = insertAssetPreset(p, preset, [2, 0, 0])!;
    expect(rootA.id).not.toBe(rootB.id);
    const roots = p.assets.filter((a) => !a.parentId);
    expect(roots).toHaveLength(2);
  });

  it('从选择集保存个人预设：本地 ID 稳定化，可再次插入', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '场景', type: 'prop' });
    store.insertPresetAction(BUILTIN_ASSET_PRESETS[0]!.id);
    const saved = store.saveSelectionAsPreset('我的建筑', '建筑');
    expect(saved).not.toBeNull();
    expect(store.presets).toHaveLength(1);
    expect(store.presets[0]!.builtin).toBe(false);
    // 个人预设可再次插入
    const presetAssetsBefore = store.activeProject!.assets.filter((a) =>
      a.notes.includes('来自预设'),
    ).length;
    store.insertPresetAction(store.presets[0]!.id);
    const presetAssetsAfter = store.activeProject!.assets.filter((a) =>
      a.notes.includes('来自预设'),
    ).length;
    expect(presetAssetsAfter).toBe(presetAssetsBefore * 2);
  });

  it('个人预设：删除（内置不可删除）与收藏', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '场景', type: 'world' });
    store.insertPresetAction(BUILTIN_ASSET_PRESETS[0]!.id);
    store.saveSelectionAsPreset('收藏预设', '自定义');
    const id = store.presets[0]!.id;
    store.togglePresetFavorite(id);
    expect(store.presets[0]!.favorite).toBe(true);
    expect(store.deletePersonalPreset(BUILTIN_ASSET_PRESETS[0]!.id)).toBe(false);
    expect(store.deletePersonalPreset(id)).toBe(true);
    expect(store.presets).toHaveLength(0);
  });

  it('预设查找：内置 + 个人', () => {
    const personal = [{ ...BUILTIN_ASSET_PRESETS[0]!, id: 'personal-1', builtin: false }];
    expect(findAssetPreset(BUILTIN_ASSET_PRESETS[0]!.id, personal)).toBeDefined();
    expect(findAssetPreset('personal-1', personal)?.builtin).toBe(false);
    expect(findAssetPreset('nope', personal)).toBeUndefined();
  });
});

describe('3D 模板：内置工厂与个人模板 ID 隔离', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('内置模板：四种模板均可构建全新项目', () => {
    expect(BUILTIN_PROJECT_TEMPLATES).toHaveLength(4);
    for (const t of BUILTIN_PROJECT_TEMPLATES) {
      const p = buildTemplateProject(t.id);
      expect(p).not.toBeNull();
      expect(p!.type).toBe(t.type);
      expect(p!.id).not.toBe(t.id);
    }
  });

  it('模板工厂每次返回独立项目（不共享可变引用）', () => {
    const a = buildTemplateProject('template-character-basic')!;
    const b = buildTemplateProject('template-character-basic')!;
    expect(a.id).not.toBe(b.id);
    expect(a.assets[0]!.id).not.toBe(b.assets[0]!.id);
    a.assets[0]!.name = '改动';
    expect(b.assets[0]!.name).not.toBe('改动');
  });

  it('角色设定模板：档案 + 角色镜头', () => {
    const p = buildTemplateProject('template-character-basic')!;
    expect(p.character!.codename).toBe('无名旅者');
    expect(p.shots.map((s) => s.name)).toEqual(['全身', '半身', '肖像', '背面', '三视图']);
    expect(p.environmentPreset).toBe('showcase');
  });

  it('世界 / 分镜模板：区域与镜头完整且相互引用有效', () => {
    const world = buildTemplateProject('template-world-street')!;
    expect(world.regions).toHaveLength(3);
    const story = buildTemplateProject('template-storyboard')!;
    expect(story.regions).toHaveLength(3);
    expect(story.shots).toHaveLength(6);
    // 镜头关联区域引用有效
    for (const s of story.shots) {
      if (s.regionId) expect(story.regions.some((r) => r.id === s.regionId)).toBe(true);
    }
  });

  it('个人模板：快照 + 校验 + 全量 ID 重映射', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '源项目', type: 'character' });
    store.setPoseAction('combat');
    store.addRegionAction({ name: '区' });
    expect(store.saveCurrentAsTemplate('我的角色模板', '自定义角色')).toBe(true);
    const t = store.templates[0]!;
    expect(t.builtin).toBe(false);
    expect(t.sourceProject).not.toBeNull();

    const applied = applyTemplateToProject(t);
    expect(applied).not.toBeNull();
    expect(applied!.id).not.toBe(t.sourceProject!.id);
    expect(applied!.name).toBe('我的角色模板');
    // 资产 ID 全部重映射且父子引用一致
    const assetIds = new Set(applied!.assets.map((a) => a.id));
    expect(assetIds.has(t.sourceProject!.assets[0]!.id)).toBe(false);
    for (const a of applied!.assets) {
      if (a.parentId) expect(assetIds.has(a.parentId)).toBe(true);
    }
    // 模板快照不受应用影响
    expect(applied!.character!.pose).toBe('combat');
    expect(t.sourceProject!.character!.pose).toBe('combat');
  });

  it('store 创建项目：模板创建走上限控制与选中', () => {
    const store = useThreeDWorkspaceStore();
    const p = store.createFromTemplate('template-prop-showcase');
    expect(p).not.toBeNull();
    expect(store.activeProjectId).toBe(p!.id);
    expect(p!.environmentPreset).toBe('showcase');
    expect(p!.shots).toHaveLength(1);
  });

  it('个人模板：编辑 / 删除（内置不可删除）/ 上限', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: 'P', type: 'prop' });
    store.saveCurrentAsTemplate('T1');
    const id = store.templates[0]!.id;
    expect(store.updatePersonalTemplate(id, { name: 'T1 改' })).toBe(true);
    expect(store.templates[0]!.name).toBe('T1 改');
    expect(store.deletePersonalTemplate(BUILTIN_PROJECT_TEMPLATES[0]!.id)).toBe(false);
    expect(store.deletePersonalTemplate(id)).toBe(true);
    expect(store.templates).toHaveLength(0);
    // 上限 24
    for (let i = 0; i < 24; i += 1) {
      store.saveCurrentAsTemplate(`T${i}`);
    }
    expect(store.saveCurrentAsTemplate('超限')).toBe(false);
  });

  it('模板导出文件可再次导入（ID 隔离）', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '源', type: 'world' });
    store.saveCurrentAsTemplate('导出模板');
    const t = store.templates[0]!;
    const json = JSON.stringify({
      app: 'personal-os-3d',
      version: 1,
      kind: 'template',
      exportedAt: Date.now(),
      template: t,
    });
    expect(store.previewTemplateImport(json).ok).toBe(true);
    const imported = store.commitTemplateImport();
    expect(imported).not.toBeNull();
    expect(store.templates).toHaveLength(2);
    // 导入项目经过校验与重映射
    const applied = applyTemplateToProject(imported!);
    expect(applied).not.toBeNull();
    expect(applied!.id).not.toBe(imported!.sourceProject!.id);
    expect(store.templates.every((x) => x.sourceProject)).toBe(true);
  });

  it('remapProjectIds 保持引用一致（区域资产 / 镜头区域 / 选中）', async () => {
    const p = createProject({ name: '世界', type: 'world' });
    const m = await import('@/features/chat/three-d/domain');
    const a = m.addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' })!;
    const r = m.addRegionToProject(p, { name: '区', assetIds: [a.id] })!;
    const s = m.addShotToProject(
      p,
      { position: [1, 1, 1], target: [0, 0, 0], fov: 50 },
      { name: '镜', regionId: r.id },
    )!;
    p.activeAssetId = a.id;
    p.activeShotId = s.id;
    const remapped = remapProjectIds(p);
    const assetIds = new Set(remapped.assets.map((x) => x.id));
    expect(remapped.regions[0]!.assetIds.every((id) => assetIds.has(id))).toBe(true);
    expect(remapped.shots[0]!.regionId).toBe(remapped.regions[0]!.id);
    expect(assetIds.has(remapped.activeAssetId!)).toBe(true);
    expect(remapped.shots.some((x) => x.id === remapped.activeShotId)).toBe(true);
  });

  it('findTemplate：内置 + 个人', () => {
    const personal = [
      { ...BUILTIN_PROJECT_TEMPLATES[0]!, id: 'my-t', builtin: false, sourceProject: null },
    ];
    expect(findTemplate('template-character-basic', personal)).toBeDefined();
    expect(findTemplate('my-t', personal)?.builtin).toBe(false);
  });
});
