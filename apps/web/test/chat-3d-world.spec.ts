import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addRegionToProject,
  addShotToProject,
  assetsInRegion,
  buildBriefText,
  copyShot,
  createProject,
  deleteRegion,
  deleteShot,
  reorderShots,
  storyboardJson,
  storyboardMarkdown,
  toggleShotFavorite,
  updateRegion,
  updateShot,
} from '@/features/chat/three-d/domain';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';
import type { ThreeDProject } from '@/features/chat/three-d/types';

function makeWorld(): ThreeDProject {
  const p = createProject({ name: '集市街区', type: 'world' });
  const region = addRegionToProject(p, {
    name: '主街',
    purpose: '入口',
    style: '开阔',
    dangerLevel: 0,
    color: '#22c55e',
    center: [0, 0.3, 0],
    size: [5, 0.6, 5],
  })!;
  addShotToProject(
    p,
    { position: [0, 1.8, 6], target: [0, 0.5, 0], fov: 50 },
    { name: '街道', regionId: region.id, notes: '开场' },
  );
  return p;
}

describe('3D 世界：区域 CRUD 与过滤', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('区域创建 / 更新 / 关联资产 / 删除', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    const region = store.addRegionAction({ name: '码头', dangerLevel: 3 });
    expect(region).not.toBeNull();
    expect(store.activeProject!.regions).toHaveLength(1);
    store.addAsset({ type: 'primitive', primitiveKind: 'cube' });
    const cubeId = store.activeAsset!.id;
    store.toggleRegionAsset(region!.id, cubeId);
    expect(store.activeProject!.regions[0]!.assetIds).toContain(cubeId);
    store.updateRegionAction(region!.id, { purpose: '探索' });
    expect(store.activeProject!.regions[0]!.purpose).toBe('探索');
    expect(store.removeRegionAction(region!.id)).toBe(true);
    expect(store.activeProject!.regions).toHaveLength(0);
  });

  it('区域过滤：返回区域内资产', async () => {
    const { addAssetToProject } = await import('@/features/chat/three-d/domain');
    const p = createProject({ name: '世界', type: 'world' });
    const a = addAssetToProject(p, { type: 'primitive', primitiveKind: 'cube' })!;
    const region = addRegionToProject(p, { name: '区', assetIds: [a.id] })!;
    expect(assetsInRegion(p, region.id)).toEqual([a.id]);
    updateRegion(p, region.id, { assetIds: [] });
    expect(assetsInRegion(p, region.id)).toEqual([]);
  });

  it('区域数量上限与危险等级钳制', () => {
    const p = createProject({ name: '世界', type: 'world' });
    for (let i = 0; i < 24; i += 1) {
      expect(addRegionToProject(p)).not.toBeNull();
    }
    expect(addRegionToProject(p)).toBeNull();
    updateRegion(p, p.regions[0]!.id, { dangerLevel: 99 });
    expect(p.regions[0]!.dangerLevel).toBe(5);
  });

  it('删除区域解除镜头绑定', () => {
    const p = makeWorld();
    const regionId = p.regions[0]!.id;
    expect(p.shots[0]!.regionId).toBe(regionId);
    expect(deleteRegion(p, regionId)).toBe(true);
    expect(p.shots[0]!.regionId).toBeNull();
  });
});

describe('3D 世界：镜头保存 / 应用 / 排序 / 收藏 / 分镜导出', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('镜头 CRUD：保存 / 应用 / 复制 / 删除 / 收藏', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    store.setLastCamera({ position: [0, 12, 8], target: [0, 0.5, 0], fov: 45 });
    const shot = store.saveShotFromCamera('鸟瞰');
    expect(shot).not.toBeNull();
    expect(store.activeProject!.activeShotId).toBe(shot!.id);
    // 应用（切走再应用）
    store.applyShot(shot!.id);
    expect(store.activeProject!.activeShotId).toBe(shot!.id);
    expect(store.toggleShotFavoriteAction(shot!.id)).toBe(true);
    expect(store.activeProject!.shots[0]!.favorite).toBe(true);
    const copy = store.duplicateShotAction(shot!.id);
    expect(copy).not.toBeNull();
    expect(store.activeProject!.shots).toHaveLength(2);
    expect(store.removeShotAction(copy!.id)).toBe(true);
    expect(store.activeProject!.shots).toHaveLength(1);
  });

  it('镜头排序与状态 / 备注更新', () => {
    const p = makeWorld();
    addShotToProject(p, { position: [1, 1, 1], target: [0, 0, 0], fov: 50 }, { name: '第二镜' });
    const [first, second] = p.shots;
    updateShot(p, first!.id, { status: 'final', notes: '定稿镜头' });
    expect(p.shots[0]!.status).toBe('final');
    expect(reorderShots(p, [second!.id, first!.id])).toBe(true);
    expect(p.shots[0]!.id).toBe(second!.id);
    expect(reorderShots(p, ['bad-id'])).toBe(false);
    expect(toggleShotFavorite(p, first!.id)).toBe(true);
    expect(copyShot(p, first!.id)!.name).toContain('（副本）');
    expect(deleteShot(p, first!.id)).toBe(true);
    expect(p.shots).toHaveLength(2);
  });

  it('应用镜头后退出镜头模式', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    store.saveShotFromCamera('镜头 A');
    expect(store.activeProject!.activeShotId).not.toBeNull();
    store.exitShotMode();
    expect(store.activeProject!.activeShotId).toBeNull();
  });

  it('分镜导出：Markdown / JSON 覆盖镜头与区域', () => {
    const p = makeWorld();
    const md = storyboardMarkdown(p);
    expect(md).toContain('分镜板');
    expect(md).toContain('街道');
    expect(md).toContain('主街');
    expect(md).toContain('危险 0/5');
    const json = JSON.parse(storyboardJson(p)) as {
      kind: string;
      shots: unknown[];
      regions: unknown[];
    };
    expect(json.kind).toBe('storyboard');
    expect(json.shots).toHaveLength(1);
    expect(json.regions).toHaveLength(1);
  });

  it('世界简报：包含地点 / 镜头语言 / 区域 / 镜头', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    store.updateWorldFields({ location: '沿海旧城', shotLanguage: '中远景为主' });
    store.addRegionAction({ name: '主街' });
    store.saveShotFromCamera('街道');
    const text = buildBriefText(store.activeProject!);
    expect(text).toContain('地点：沿海旧城');
    expect(text).toContain('镜头语言：中远景为主');
    expect(text).toContain('区域');
    expect(text).toContain('镜头');
  });

  it('mock 生成服务：世界简报返回建议区域与镜头（仅本地）', async () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '世界', type: 'world' });
    const draft = await store.runGenerationDraft();
    expect(draft!.suggestedRegions).toBeDefined();
    expect(draft!.suggestedRegions!.length).toBeGreaterThan(0);
    expect(draft!.suggestedShots!.length).toBeGreaterThan(0);
    expect(draft!.note).toContain('仅本地预览');
    // 角色类型返回镜头列表
    store.addProject({ name: '角色', type: 'character' });
    const draft2 = await store.runGenerationDraft();
    expect(draft2!.suggestedShots!.some((s) => s.preset === 'fullbody')).toBe(true);
  });
});
