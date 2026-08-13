import { beforeEach, describe, expect, it } from 'vitest';

import {
  MAX_HISTORY_PER_PROJECT,
  PRIMITIVE_KINDS,
  seedProjects,
} from '@/features/chat/three-d/constants';
import {
  addAssetToProject,
  appendHistory,
  buildBriefText,
  chatDraftText,
  createProject,
  deleteAsset,
  draftFromMessageContent,
  duplicateAsset,
  isDraftableMessageContent,
  mergeImportedProjects,
  parseImportPreview,
  projectExportFile,
  setColor,
  setTransform,
  updateAsset,
  updateBrief,
  updateSceneSettings,
  validateImportedProject,
} from '@/features/chat/three-d/domain';
import type { ThreeDProject } from '@/features/chat/three-d/types';

function makeProject(): ThreeDProject {
  return createProject({ name: '测试项目', type: 'prop', tags: ['测试'] });
}

describe('3D 领域：项目创建与种子', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('角色项目创建：基础人体占位 + 默认 transform + 初始历史', () => {
    const p = createProject({ name: '  角色 A  ', type: 'character', tags: ['角色', '角色'] });
    expect(p.name).toBe('角色 A');
    expect(p.type).toBe('character');
    expect(p.status).toBe('draft');
    expect(p.tags).toEqual(['角色']);
    expect(p.assets.length).toBe(7);
    // 根 group 使用默认变换；部件为有效 transform 且默认缩放 / 旋转
    const root = p.assets[0]!;
    expect(root.type).toBe('group');
    expect(root.transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    for (const a of p.assets) {
      expect(a.transform.position).toHaveLength(3);
      expect(a.transform.position.every((n) => Number.isFinite(n))).toBe(true);
      expect(a.transform.scale).toHaveLength(3);
      expect(a.transform.scale.every((n) => Number.isFinite(n) && n > 0)).toBe(true);
      expect(a.transform.rotation).toHaveLength(3);
      expect(a.transform.rotation.every((n) => Number.isFinite(n))).toBe(true);
      expect(a.visible).toBe(true);
      expect(a.locked).toBe(false);
    }
    // 部件挂载到根 group
    const children = p.assets.filter((a) => a.parentId === root.id);
    expect(children).toHaveLength(6);
    expect(p.history.length).toBeGreaterThan(0);
    expect(p.character).toBeDefined();
  });

  it('世界项目创建：地面 / 道路 / 建筑 / 植被占位', () => {
    const p = createProject({ name: '世界', type: 'world' });
    const names = p.assets.map((a) => a.name);
    expect(names).toContain('地面');
    expect(names).toContain('道路');
    expect(names).toContain('建筑块 A');
    expect(names).toContain('植被占位 A');
    expect(p.world).toBeDefined();
    expect(p.world?.scale).toBe(1);
  });

  it('道具项目创建：空场景起步', () => {
    const p = createProject({ name: '道具', type: 'prop' });
    expect(p.assets).toHaveLength(0);
    expect(p.prop).toBeDefined();
  });

  it('种子项目包含角色 / 世界 / 道具三种概念', () => {
    const seeds = seedProjects();
    expect(seeds.map((s) => s.type).sort()).toEqual(['character', 'prop', 'world']);
    // 种子资产全部由基础形体构成，无外链引用
    const json = JSON.stringify(seeds);
    expect(json).not.toMatch(/http|\.glb|\.fbx|\.obj|data:/i);
  });
});

describe('3D 领域：资产操作', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('新增 primitive：默认命名 / 颜色 / 材质 / 历史', () => {
    const p = makeProject();
    const cube = addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' });
    expect(cube).not.toBeNull();
    expect(cube!.name).toBe('立方体');
    expect(cube!.primitiveKind).toBe('cube');
    expect(cube!.color).toBe('#6366f1');
    expect(cube!.transform).toEqual({ position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] });
    expect(p.history.some((h) => h.kind === 'create' && h.assetId === cube!.id)).toBe(true);
  });

  it('新增灯光 / 镜头标记：专属默认颜色与材质', () => {
    const p = makeProject();
    const light = addAssetToProject(p, { type: 'light' });
    expect(light!.color).toBe('#fbbf24');
    expect(light!.materialPreset).toBe('emissive');
    const cam = addAssetToProject(p, { type: 'camera-marker' });
    expect(cam!.materialPreset).toBe('wireframe');
  });

  it('角色 / 世界占位创建', () => {
    const p = makeProject();
    const ch = addAssetToProject(p, { type: 'character-placeholder' });
    expect(ch!.type).toBe('character-placeholder');
    const w = addAssetToProject(p, { type: 'world-placeholder' });
    expect(w!.type).toBe('world-placeholder');
    expect(w!.color).toBe('#16a34a');
  });

  it('更新 / 变换 / 颜色：写入与历史标记', () => {
    const p = makeProject();
    const asset = addAssetToProject(p, { type: 'primitive', primitiveKind: 'sphere' })!;
    setTransform(p, asset.id, { position: [1, 2, 3], rotation: [0, 0, 0], scale: [1, 1, 1] });
    expect(p.assets.find((a) => a.id === asset.id)!.transform.position).toEqual([1, 2, 3]);
    setColor(p, asset.id, '#ff0000');
    expect(p.assets.find((a) => a.id === asset.id)!.color).toBe('#ff0000');
    const kinds = p.history.map((h) => h.kind);
    expect(kinds).toContain('transform');
    expect(kinds).toContain('color');
  });

  it('重命名与备注更新', () => {
    const p = makeProject();
    const asset = addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' })!;
    updateAsset(p, asset.id, { name: '改名', notes: '备注内容' }, '重命名资产');
    const after = p.assets.find((a) => a.id === asset.id)!;
    expect(after.name).toBe('改名');
    expect(after.notes).toBe('备注内容');
  });

  it('复制：新 id / 副本后缀 / 子树同步 / 位置偏移', () => {
    const p = createProject({ name: '角色', type: 'character' });
    const root = p.assets.find((a) => a.type === 'group')!;
    const childrenBefore = p.assets.filter((a) => a.parentId === root.id).length;
    const copy = duplicateAsset(p, root.id);
    expect(copy).not.toBeNull();
    expect(copy!.id).not.toBe(root.id);
    expect(copy!.name).toContain('（副本）');
    const copiedChildren = p.assets.filter((a) => a.parentId === copy!.id);
    expect(copiedChildren).toHaveLength(childrenBefore);
    expect(copy!.transform.position[0]).toBe(root.transform.position[0] + 0.6);
    expect(p.history.some((h) => h.kind === 'duplicate')).toBe(true);
  });

  it('删除：级联删除子树并清理选中', () => {
    const p = createProject({ name: '角色', type: 'character' });
    const root = p.assets.find((a) => a.type === 'group')!;
    const total = p.assets.length;
    p.activeAssetId = root.id;
    expect(deleteAsset(p, root.id)).toBe(true);
    expect(p.assets).toHaveLength(total - 7);
    expect(p.activeAssetId).toBeNull();
  });

  it('历史记录数量上限', () => {
    const p = makeProject();
    for (let i = 0; i < MAX_HISTORY_PER_PROJECT + 10; i += 1) {
      p.history = appendHistory(p.history, 'update', `操作 ${i}`);
    }
    expect(p.history.length).toBe(MAX_HISTORY_PER_PROJECT);
  });

  it('资产数量上限：超出返回 null', () => {
    const p = makeProject();
    for (let i = 0; i < 151; i += 1) {
      const a = addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' });
      if (i >= 150) expect(a).toBeNull();
    }
    expect(p.assets.length).toBe(150);
  });
});

describe('3D 领域：场景 / 简报', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('场景设置更新进入历史', () => {
    let p = makeProject();
    p = updateSceneSettings(p, { background: '#112233', gridVisible: false });
    expect(p.sceneSettings.background).toBe('#112233');
    expect(p.sceneSettings.gridVisible).toBe(false);
    expect(p.history.some((h) => h.kind === 'scene')).toBe(true);
  });

  it('简报更新：字段写入与历史标记', () => {
    let p = makeProject();
    p = updateBrief(p, {
      description: '一个复古收音机',
      style: '复古',
      dimensions: '512x512',
      targetPlatform: 'web',
    });
    expect(p.generationBrief.style).toBe('复古');
    expect(p.history.some((h) => h.kind === 'brief')).toBe(true);
  });

  it('角色简报文本：包含角色设定与资产清单', () => {
    const p = createProject({ name: '旅行者', type: 'character' });
    p.character = {
      ...p.character!,
      role: '游侠',
      appearanceKeywords: '兜帽',
      clothingKeywords: '皮革',
    };
    p.generationBrief.style = '写实';
    const text = buildBriefText(p);
    expect(text).toContain('旅行者');
    expect(text).toContain('角色定位：游侠');
    expect(text).toContain('外观关键词：兜帽');
    expect(text).toContain('服装/材质关键词：皮革');
    expect(text).toContain('资产清单');
  });

  it('世界简报文本：包含世界设定字段', () => {
    const p = createProject({ name: '集市街区', type: 'world' });
    p.world = { ...p.world!, eraStyle: '中世纪', atmosphere: '热闹', weather: 'rain' };
    const text = buildBriefText(p);
    expect(text).toContain('时代/风格：中世纪');
    expect(text).toContain('氛围：热闹');
    expect(text).toContain('天气：rain');
  });

  it('道具简报文本：包含用途与尺寸', () => {
    const p = makeProject();
    p.prop = { ...p.prop!, usage: '桌面摆件', sizeHint: '30cm' };
    const text = buildBriefText(p);
    expect(text).toContain('用途：桌面摆件');
    expect(text).toContain('尺寸：30cm');
  });
});

describe('3D 领域：导入导出校验', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function validProjectJson(): string {
    const p = createProject({ name: '导出项目', type: 'prop' });
    addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' });
    return JSON.stringify(projectExportFile(p));
  }

  it('导出文件结构：app / version / kind / project', () => {
    const p = makeProject();
    const parsed = JSON.parse(JSON.stringify(projectExportFile(p))) as Record<string, unknown>;
    expect(parsed.app).toBe('personal-os-3d');
    expect(parsed.version).toBe(1);
    expect(parsed.kind).toBe('project');
    const json = JSON.stringify(parsed);
    expect(json).not.toMatch(/data:|base64|apiKey|token|http/i);
  });

  it('解析合法单项目导出：预览 1 项有效', () => {
    const result = parseImportPreview(validProjectJson());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.preview.total).toBe(1);
      expect(result.preview.validCount).toBe(1);
      expect(result.projects).toHaveLength(1);
    }
  });

  it('非法 JSON / 非 3D 文件拒绝', () => {
    expect('error' in parseImportPreview('not json')).toBe(true);
    expect('error' in parseImportPreview(JSON.stringify({ app: 'other', items: [] }))).toBe(true);
  });

  it('版本过新拒绝导入', () => {
    const text = JSON.stringify({
      app: 'personal-os-3d',
      version: 99,
      kind: 'projects',
      projects: [],
    });
    const result = parseImportPreview(text);
    expect('error' in result).toBe(true);
  });

  it('未知资产类型拒绝；非法 transform 数值拒绝', () => {
    const p = createProject({ name: '坏项目', type: 'prop' });
    const raw = JSON.parse(JSON.stringify(projectExportFile(p))) as {
      project: Record<string, unknown>;
    };
    const badType = structuredClone(raw.project);
    (badType.assets as unknown[]).push({
      id: 'bad-1',
      name: '未知',
      type: 'mesh-import',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: '#ffffff',
      materialPreset: 'standard',
      tags: [],
      notes: '',
    });
    const r1 = validateImportedProject(badType);
    expect(r1.valid).toBe(false);

    const badNum = structuredClone(raw.project);
    (badNum.assets as unknown[]).push({
      id: 'bad-2',
      name: '坏数值',
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
    const r2 = validateImportedProject(badNum);
    expect(r2.valid).toBe(false);

    const badColor = structuredClone(raw.project);
    (badColor.assets as unknown[]).push({
      id: 'bad-3',
      name: '坏颜色',
      type: 'primitive',
      primitiveKind: 'cube',
      visible: true,
      locked: false,
      transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      color: 'url(https://evil)',
      materialPreset: 'standard',
      tags: [],
      notes: '',
    });
    const r3 = validateImportedProject(badColor);
    expect(r3.valid).toBe(false);
  });

  it('重复 id 合并：复制为新项目，绝不覆盖', () => {
    const existing = [createProject({ name: '原项目', type: 'prop' })];
    const incoming = [
      { ...createProject({ name: '新项目', type: 'prop' }), id: existing[0]!.id },
      createProject({ name: '全新', type: 'world' }),
    ];
    const { projects, result } = mergeImportedProjects(existing, incoming);
    expect(result.added).toBe(1);
    expect(result.copied).toBe(1);
    expect(projects).toHaveLength(3);
    expect(projects.filter((p) => p.name.includes('原项目'))).toHaveLength(1);
    const copy = projects.find((p) => p.name.includes('（导入）'));
    expect(copy).toBeDefined();
    expect(copy!.id).not.toBe(existing[0]!.id);
  });
});

describe('3D 领域：Chat 联动草稿', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('从消息内容构建草稿：首行命名、纯文本、无附件', () => {
    const d = draftFromMessageContent('赛博武士\n\n红色兜帽，机械手臂');
    expect(d.name).toContain('赛博武士');
    expect(d.description).toContain('红色兜帽');
    expect(d.sourceText.length).toBeGreaterThan(0);
  });

  it('拒绝附件 / 二进制占位内容', () => {
    expect(isDraftableMessageContent('data:image/png;base64,AAAA')).toBe(false);
    expect(isDraftableMessageContent('[附件] 图片.png')).toBe(false);
    expect(isDraftableMessageContent('   ')).toBe(false);
    expect(isDraftableMessageContent('正常文本内容')).toBe(true);
  });

  it('返回 Chat 草稿：包含项目名与简报', () => {
    const p = createProject({ name: '集市街区', type: 'world' });
    const text = chatDraftText(p);
    expect(text).toContain('集市街区');
    expect(text).toContain('3D 工作台');
  });

  it('PRIMITIVE_KINDS 覆盖六种基础几何体', () => {
    expect(PRIMITIVE_KINDS.map((k) => k.key)).toEqual([
      'cube',
      'sphere',
      'cylinder',
      'cone',
      'plane',
      'torus',
    ]);
  });
});
