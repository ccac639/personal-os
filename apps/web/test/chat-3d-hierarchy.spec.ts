import { beforeEach, describe, expect, it } from 'vitest';

import {
  batchDelete,
  batchResetTransform,
  batchSetColor,
  batchSetLocked,
  batchSetVisible,
  batchTransform,
  canNest,
  createGroup,
  createProject,
  deleteGroupWithStrategy,
  groupSelection,
  nestAssets,
  reorderAssets,
  selectionWorldCenter,
  syncSelection,
} from '@/features/chat/three-d/domain';
import type { ThreeDProject } from '@/features/chat/three-d/types';

function makeProject(): ThreeDProject {
  return createProject({ name: '层级测试', type: 'prop' });
}

function addCube(p: ThreeDProject, name: string, parentId?: string) {
  const a = createGroup(p, { name, parentId });
  return a;
}

describe('3D 层级：group 创建与嵌套', () => {
  beforeEach(() => localStorage.clear());

  it('创建顶层 group 与嵌套 group', () => {
    const p = makeProject();
    const g1 = createGroup(p, { name: '建筑组' });
    expect(g1).not.toBeNull();
    expect(g1!.type).toBe('group');
    expect(p.assets).toHaveLength(1);
    const g2 = createGroup(p, { name: '内部组', parentId: g1!.id });
    expect(g2!.parentId).toBe(g1!.id);
    const children = p.assets.filter((a) => a.parentId === g1!.id);
    expect(children).toHaveLength(1);
  });

  it('嵌套阻止：不能成为自身或后代的父节点', () => {
    const p = makeProject();
    const g1 = createGroup(p, { name: '根' })!;
    const g2 = createGroup(p, { name: '子', parentId: g1.id })!;
    expect(canNest(p, [g1.id], g1.id)).toBe(false);
    expect(canNest(p, [g1.id], g2.id)).toBe(false); // g2 是 g1 后代
    expect(canNest(p, [g2.id], g1.id)).toBe(true);
    expect(canNest(p, [g1.id], null)).toBe(true);
    // nestAssets 同样拒绝
    const { moved } = nestAssets(p, [g1.id], g2.id);
    expect(moved).toBe(0);
    expect(g1.parentId).toBeUndefined();
  });

  it('移动资产到 group / 顶层，且记录历史', () => {
    const p = makeProject();
    const a = addCube(p, '立方体 A');
    const b = addCube(p, '立方体 B');
    const g = createGroup(p, { name: '组合' })!;
    const { moved } = nestAssets(p, [a!.id, b!.id], g.id);
    expect(moved).toBe(2);
    expect(a!.parentId).toBe(g.id);
    expect(b!.parentId).toBe(g.id);
    nestAssets(p, [a!.id], null);
    expect(a!.parentId).toBeUndefined();
    expect(p.history.some((h) => h.label.includes('移动 2 项资产'))).toBe(true);
  });

  it('reorder：同父级资产按给定顺序重排', () => {
    const p = makeProject();
    const a = addCube(p, 'A')!;
    const b = addCube(p, 'B')!;
    const c = addCube(p, 'C')!;
    expect(reorderAssets(p, null, [c.id, a.id, b.id])).toBe(true);
    const order = p.assets.map((x) => x.id);
    expect(order.indexOf(c.id)).toBeLessThan(order.indexOf(a.id));
    expect(order.indexOf(a.id)).toBeLessThan(order.indexOf(b.id));
  });

  it('删除 group：策略一删除子项；策略二保留并提升', () => {
    const p = makeProject();
    const a = addCube(p, 'A')!;
    const g = createGroup(p, { name: '组' })!;
    nestAssets(p, [a.id], g.id);
    expect(p.assets).toHaveLength(2);

    expect(deleteGroupWithStrategy(p, g.id, 'delete-children')).toBe(true);
    expect(p.assets).toHaveLength(0);

    // 重建后测试提升
    const b = addCube(p, 'B')!;
    const g2 = createGroup(p, { name: '组2' })!;
    nestAssets(p, [b.id], g2.id);
    expect(deleteGroupWithStrategy(p, g2.id, 'promote')).toBe(true);
    expect(p.assets).toHaveLength(1);
    expect(p.assets[0]!.parentId).toBeUndefined();
    expect(p.history.some((h) => h.label.includes('保留 1 个子项'))).toBe(true);
  });
});

describe('3D 层级：批量操作', () => {
  beforeEach(() => localStorage.clear());

  function projectWithThree(): { p: ThreeDProject; ids: string[] } {
    const p = makeProject();
    const a = addCube(p, 'A')!;
    const b = addCube(p, 'B')!;
    const c = addCube(p, 'C')!;
    return { p, ids: [a.id, b.id, c.id] };
  }

  it('批量显隐 / 锁定 / 改色 / 重置变换', () => {
    const { p, ids } = projectWithThree();
    expect(batchSetVisible(p, ids, false)).toBe(3);
    expect(p.assets.every((x) => !x.visible)).toBe(true);
    expect(batchSetLocked(p, ids, true)).toBe(3);
    expect(p.assets.every((x) => x.locked)).toBe(true);
    // 锁定资产不可再被批量修改
    expect(batchSetVisible(p, ids, true)).toBe(0);
    batchSetLocked(p, ids, false);
    expect(batchSetColor(p, ids, '#ff0000')).toBe(3);
    expect(p.assets.every((x) => x.color === '#ff0000')).toBe(true);
    for (const id of ids) {
      p.assets.find((x) => x.id === id)!.transform.position = [3, 3, 3];
    }
    expect(batchResetTransform(p, ids)).toBe(3);
    expect(p.assets.every((x) => x.transform.position.join(',') === '0,0,0')).toBe(true);
  });

  it('批量删除：跳过锁定资产，级联子树', () => {
    const { p, ids } = projectWithThree();
    const g = createGroup(p, { name: '组' })!;
    nestAssets(p, [ids[0]!], g.id);
    p.assets.find((x) => x.id === ids[1]!)!.locked = true;
    // 选择：组（含子树）、锁定项、普通项
    expect(batchDelete(p, [g.id, ids[1]!, ids[2]!])).toBe(2);
    expect(p.assets.some((x) => x.id === ids[1]!)).toBe(true); // 锁定保留
    expect(p.assets.some((x) => x.id === ids[2]!)).toBe(false);
    expect(p.assets.some((x) => x.id === g.id)).toBe(false);
  });

  it('批量分组：共同中心 + 局部坐标换算', () => {
    const p = makeProject();
    const a = addCube(p, 'A')!;
    const b = addCube(p, 'B')!;
    a.transform.position = [0, 0, 0];
    b.transform.position = [2, 0, 0];
    const g = groupSelection(p, [a.id, b.id], '组合');
    expect(g).not.toBeNull();
    expect(g!.transform.position).toEqual([1, 0, 0]); // 共同中心
    expect(a.parentId).toBe(g!.id);
    expect(a.transform.position[0]).toBeCloseTo(-1, 5);
    expect(b.transform.position[0]).toBeCloseTo(1, 5);
  });

  it('批量变换：移动叠加；旋转以共同中心调整位置偏移', () => {
    const p = makeProject();
    const a = addCube(p, 'A')!;
    const b = addCube(p, 'B')!;
    a.transform.position = [0, 0, 0];
    b.transform.position = [2, 0, 0];
    const ids = [a.id, b.id];
    const center = selectionWorldCenter(p, ids);
    expect(center).toEqual([1, 0, 0]);

    expect(batchTransform(p, ids, 'move', [1, 0, 0])).toBe(2);
    expect(a.transform.position[0]).toBe(1);
    expect(b.transform.position[0]).toBe(3);

    // 绕共同中心（移动后为 [2,0,0]）旋转 90°（Y 轴）：
    // B 相对中心偏移 [1,0,0] → 旋转到 [0,0,-1] → 世界位置 [2,0,-1]
    // A 相对中心偏移 [-1,0,0] → 旋转到 [0,0,1] → 世界位置 [2,0,1]
    expect(batchTransform(p, ids, 'rotate', [0, 90, 0])).toBe(2);
    expect(b.transform.position[0]).toBeCloseTo(2, 4);
    expect(b.transform.position[2]).toBeCloseTo(-1, 4);
    expect(b.transform.rotation[1]).toBeCloseTo(90, 4);
    expect(a.transform.position[0]).toBeCloseTo(2, 4);
    expect(a.transform.position[2]).toBeCloseTo(1, 4);
  });

  it('选择同步：多选集合 + 锚点', () => {
    const { p, ids } = projectWithThree();
    syncSelection(p, ids);
    expect(p.selectedAssetIds).toHaveLength(3);
    expect(p.activeAssetId).toBe(ids[2]);
    syncSelection(p, []);
    expect(p.activeAssetId).toBeNull();
  });
});
