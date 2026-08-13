import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { THREE_D_STORAGE_KEY, THREE_D_STORAGE_KEY_V1 } from '@/features/chat/three-d';
import {
  normalizeProject,
  parseImportPreview,
  projectExportFile,
  validateImportedProject,
} from '@/features/chat/three-d/domain';
import { loadThreeDWorkspace, migrateThreeDV0 } from '@/features/chat/three-d/storage';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';

describe('3D 持久化：v1 → v2 迁移', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  function makeV1Project(): Record<string, unknown> {
    // 手工构造 v1 结构（缺少 v2 新增字段）
    return {
      id: 'v1-project-1',
      name: '旧版项目',
      description: 'v1 数据',
      type: 'character',
      status: 'draft',
      tags: [],
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      sceneSettings: {
        background: '#0f172a',
        groundColor: '#1e293b',
        groundVisible: true,
        gridVisible: true,
        axesVisible: false,
        ambientLight: { enabled: true, color: '#cbd5e1', intensity: 0.55 },
        mainLight: { enabled: true, color: '#ffffff', intensity: 1.6, position: [4, 8, 6] },
        fog: { enabled: false, color: '#0f172a', near: 24, far: 60 },
        cameraPreset: 'perspective',
      },
      assets: [
        {
          id: 'v1-asset-1',
          name: '头部',
          type: 'character-placeholder',
          visible: true,
          locked: false,
          transform: { position: [0, 1.62, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
          color: '#f1c27d',
          materialPreset: 'standard',
          tags: [],
          notes: '',
        },
        {
          id: 'v1-light',
          name: '灯光',
          type: 'light',
          visible: true,
          locked: false,
          transform: { position: [2, 3, 1], rotation: [0, 0, 0], scale: [1, 1, 1] },
          color: '#fbbf24',
          materialPreset: 'emissive',
          tags: [],
          notes: '',
        },
      ],
      activeAssetId: null,
      cameraPreset: 'perspective',
      thumbnailPreset: 'grid',
      generationBrief: { description: '', style: '', dimensions: '', targetPlatform: '' },
      character: {
        bodyProportions: 'average',
        pose: 'stand',
        palette: ['#475569'],
        equipment: [],
        role: '',
        appearanceKeywords: '',
        clothingKeywords: '',
      },
      history: [],
    };
  }

  it('v1 信封 → v2：自动迁移、幂等、字段补默认', () => {
    const v1Envelope = {
      version: 1,
      data: {
        projects: [makeV1Project()],
        ui: {
          leftPanelOpen: false,
          rightPanelOpen: true,
          bottomOpen: false,
          bottomTab: 'history',
          tool: 'select',
          assetQuery: '',
          briefText: '',
          noticeDismissed: false,
        },
      },
    };
    localStorage.setItem(THREE_D_STORAGE_KEY_V1, JSON.stringify(v1Envelope));
    const result = loadThreeDWorkspace();
    expect(result.migrated).toBe(true);
    const p = result.projects.find((x) => x.id === 'v1-project-1')!;
    expect(p).toBeDefined();
    // 新字段默认值齐全
    expect(p.selectedAssetIds).toEqual([]);
    expect(p.regions).toEqual([]);
    expect(p.shots).toEqual([]);
    expect(p.activeShotId).toBeNull();
    expect(p.environmentPreset).toBe('custom');
    expect(p.character!.headRatio).toBe(1);
    expect(p.character!.personalPoses).toEqual([]);
    expect(p.character!.codename).toBe('');
    // v1 灯光资产补齐默认 light 参数
    const light = p.assets.find((a) => a.id === 'v1-light')!;
    expect(light.light).toBeDefined();
    expect(light.light!.kind).toBe('point');
    // 资产材质参数默认值
    expect(p.assets[0]!.materialParams).toBeDefined();
    // 迁移后写入 v2 键
    expect(localStorage.getItem(THREE_D_STORAGE_KEY)).toContain('"version":2');
    // 幂等：再次读取不再迁移
    localStorage.removeItem(THREE_D_STORAGE_KEY_V1);
    const result2 = loadThreeDWorkspace();
    expect(result2.migrated).toBe(false);
  });

  it('normalizeProject：归一化幂等 + 损坏资产逐条丢弃', () => {
    const raw = makeV1Project();
    const p1 = normalizeProject(raw)!;
    const p2 = normalizeProject(p1)!;
    expect(JSON.stringify(p1)).toBe(JSON.stringify(p2)); // 幂等
    // 损坏资产丢弃，其余保留
    const withBad = makeV1Project();
    (withBad.assets as unknown[]).push({
      id: 'bad',
      name: '坏',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: 'not-a-color',
      materialPreset: 'standard',
      tags: [],
      notes: '',
    });
    const p3 = normalizeProject(withBad)!;
    expect(p3.assets.some((a) => a.id === 'bad')).toBe(false);
    expect(p3.assets).toHaveLength(2);
  });

  it('migrateThreeDV0：裸数组 / 信封 / 损坏', () => {
    const p = normalizeProject(makeV1Project())!;
    const projects = migrateThreeDV0([p, { foo: 1 }]);
    expect(projects).not.toBeNull();
    expect(projects!.map((x) => x.id)).toEqual([p.id]);
    expect(migrateThreeDV0('garbage')).toBeNull();
    expect(migrateThreeDV0([])).toBeNull();
  });

  it('旧项目绝不打不开：v1 数据缺失新字段也能安全打开', () => {
    // 模拟用户本地只有 v1 数据（含缺失 v2 字段），读取后自动迁移并保留项目
    localStorage.setItem(
      THREE_D_STORAGE_KEY_V1,
      JSON.stringify({ version: 1, data: { projects: [makeV1Project()], ui: {} } }),
    );
    setActivePinia(createPinia());
    const store2 = useThreeDWorkspaceStore();
    expect(store2.migrated).toBe(true);
    expect(store2.projects.some((x) => x.name === '旧版项目')).toBe(true);
    const p = store2.projects.find((x) => x.name === '旧版项目')!;
    expect(p.regions).toEqual([]);
    expect(p.shots).toEqual([]);
    expect(p.selectedAssetIds).toEqual([]);
    expect(p.character!.headRatio).toBe(1);
  });

  it('写入失败：内存保留 + 不崩溃', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '内存项目', type: 'prop' });
    expect(store.projects.some((x) => x.name === '内存项目')).toBe(true);
    spy.mockRestore();
  });
});

describe('3D 导入校验：严格拒绝', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  function rawProject(): Record<string, unknown> {
    const p = normalizeProject({ id: 'x', name: '项目', type: 'prop', assets: [] })!;
    return JSON.parse(JSON.stringify(projectExportFile(p))).project;
  }

  it('未知材质预设拒绝', () => {
    const raw = rawProject();
    (raw.assets as unknown[]).push({
      id: 'a1',
      name: '件',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'marble-9000',
      tags: [],
      notes: '',
    });
    const r = validateImportedProject(raw);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('材质');
  });

  it('未知灯光种类拒绝；非灯光资产携带 light 拒绝', () => {
    const raw = rawProject();
    (raw.assets as unknown[]).push({
      id: 'l1',
      name: '灯',
      type: 'light',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'emissive',
      light: {
        kind: 'lava',
        enabled: true,
        intensity: 1,
        color: '#ffffff',
        temperature: null,
        shadowEnabled: false,
        range: 0,
        angle: 0,
        target: [0, 0, 0],
      },
      tags: [],
      notes: '',
    });
    expect(validateImportedProject(raw).valid).toBe(false);
    const raw2 = rawProject();
    (raw2.assets as unknown[]).push({
      id: 'c1',
      name: '件',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'standard',
      light: {
        kind: 'point',
        enabled: true,
        intensity: 1,
        color: '#ffffff',
        temperature: null,
        shadowEnabled: false,
        range: 0,
        angle: 0,
        target: [0, 0, 0],
      },
      tags: [],
      notes: '',
    });
    expect(validateImportedProject(raw2).valid).toBe(false);
  });

  it('非法数值（NaN / Infinity）拒绝', () => {
    const raw = rawProject();
    (raw.assets as unknown[]).push({
      id: 'n1',
      name: '坏',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, Number.NaN, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'standard',
      tags: [],
      notes: '',
    });
    const r = validateImportedProject(raw);
    expect(r.valid).toBe(false);
  });

  it('循环 parentId 拒绝', () => {
    const raw = rawProject();
    (raw.assets as unknown[]).push(
      {
        id: 'a',
        name: 'A',
        type: 'group',
        visible: true,
        locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        color: '#ffffff',
        materialPreset: 'standard',
        parentId: 'b',
        tags: [],
        notes: '',
      },
      {
        id: 'b',
        name: 'B',
        type: 'group',
        visible: true,
        locked: false,
        transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
        color: '#ffffff',
        materialPreset: 'standard',
        parentId: 'a',
        tags: [],
        notes: '',
      },
    );
    const r = validateImportedProject(raw);
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.reason).toContain('循环');
  });

  it('父资产不存在拒绝', () => {
    const raw = rawProject();
    (raw.assets as unknown[]).push({
      id: 'orphan',
      name: '孤儿',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'standard',
      parentId: 'missing-parent',
      tags: [],
      notes: '',
    });
    expect(validateImportedProject(raw).valid).toBe(false);
  });

  it('版本过新 / 非 3D 文件拒绝导入', () => {
    expect(
      'error' in
        parseImportPreview(
          JSON.stringify({ app: 'personal-os-3d', version: 99, kind: 'projects', projects: [] }),
        ),
    ).toBe(true);
    expect('error' in parseImportPreview(JSON.stringify({ app: 'other' }))).toBe(true);
    expect('error' in parseImportPreview('not json')).toBe(true);
  });
});
