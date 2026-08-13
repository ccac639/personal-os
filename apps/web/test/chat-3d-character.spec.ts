import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import {
  addPersonalPose,
  applyPersonalPose,
  characterBriefJson,
  characterBriefMarkdown,
  copyPersonalPose,
  createProject,
  deletePersonalPose,
  prefillCharacterFromText,
  setCharacterPose,
} from '@/features/chat/three-d/domain';
import { applyPoseToTransform, partKeyForName, poseOffsets } from '@/features/chat/three-d/poses';
import { useThreeDWorkspaceStore } from '@/features/chat/three-d/store';

describe('3D 角色：姿态程序化偏移', () => {
  beforeEach(() => localStorage.clear());

  it('部位识别：名称 → 部位键', () => {
    expect(partKeyForName('头部')).toBe('head');
    expect(partKeyForName('左臂')).toBe('armL');
    expect(partKeyForName('右腿')).toBe('legR');
    expect(partKeyForName('未知件')).toBeNull();
  });

  it('站立为零偏移，其他姿态确定性旋转 / 位移', () => {
    expect(poseOffsets('stand', '头部')).toEqual({ rotation: [0, 0, 0], position: [0, 0, 0] });
    const runLeg = poseOffsets('run', '左腿');
    expect(runLeg.rotation[0]).toBe(32);
    const sitLeg = poseOffsets('sit', '左腿');
    expect(sitLeg.rotation[0]).toBe(90);
    expect(sitLeg.position[1]).toBe(-0.28);
    const combatArm = poseOffsets('combat', '左臂');
    expect(combatArm.rotation[2]).toBe(25);
    // 未知部位零偏移
    expect(poseOffsets('combat', '未知')).toEqual({ rotation: [0, 0, 0], position: [0, 0, 0] });
  });

  it('姿态叠加到基础变换（applyPoseToTransform）', () => {
    const base = { position: [0, 1.2, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
    const transformed = applyPoseToTransform(base, 'alert', '右臂');
    expect(transformed.rotation[2]).toBe(-22);
    expect(transformed.position[1]).toBeCloseTo(1.18, 5);
    expect(transformed.scale).toEqual([1, 1, 1]);
  });
});

describe('3D 角色：档案 / 姿态预设', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('角色配置：档案字段更新 + 占位模型同步字段', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '剑士', type: 'character' });
    store.updateCharacterFields({
      codename: '凛',
      ageGroup: 'young',
      bodyType: 'muscular',
      style: '赛博',
      personalityKeywords: '冷静、孤傲',
      headRatio: 1.1,
      shoulderWidth: 1.2,
      legLength: 1.05,
      primaryColor: '#ef4444',
      secondaryColor: '#0f172a',
    });
    const c = store.activeProject!.character!;
    expect(c.codename).toBe('凛');
    expect(c.headRatio).toBe(1.1);
    expect(c.primaryColor).toBe('#ef4444');
    // 角色占位资产仍存在（配置同步到占位模型，不重建）
    expect(store.activeProject!.assets.some((a) => a.type === 'character-placeholder')).toBe(true);
  });

  it('姿态应用：setPose 记录历史并可撤销', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '角色', type: 'character' });
    expect(store.setPoseAction('combat')).toBe(true);
    expect(store.activeProject!.character!.pose).toBe('combat');
    store.undo();
    expect(store.activeProject!.character!.pose).toBe('stand');
  });

  it('个人姿态预设：保存 / 复制 / 删除 / 应用', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '角色', type: 'character' });
    store.setPoseAction('walk');
    const saved = store.savePersonalPoseAction('巡逻步');
    expect(saved).not.toBeNull();
    const poses = store.activeProject!.character!.personalPoses;
    expect(poses).toHaveLength(1);
    const id = poses[0]!.id;
    // 复制
    store.copyPersonalPoseAction(id);
    expect(store.activeProject!.character!.personalPoses).toHaveLength(2);
    // 应用
    store.setPoseAction('stand');
    store.applyPersonalPoseAction(id);
    expect(store.activeProject!.character!.pose).toBe('walk');
    // 删除
    store.deletePersonalPoseAction(id);
    expect(store.activeProject!.character!.personalPoses).toHaveLength(1);
  });

  it('领域层：个人姿态数量上限与非法姿态拒绝', () => {
    let p = createProject({ name: '角色', type: 'character' });
    for (let i = 0; i < 20; i += 1) {
      p = addPersonalPose(p, `姿态 ${i}`, 'stand')!;
    }
    expect(p.character!.personalPoses).toHaveLength(20);
    expect(addPersonalPose(p, '超限', 'stand')).toBeNull();
    const before = p.character!.pose;
    const next = setCharacterPose(p, '未知姿态' as never);
    expect(next.character!.pose).toBe(before); // 非法拒绝
    expect(applyPersonalPose(p, 'missing-id')).toBe(p);
    const afterDelete = deletePersonalPose(p, p.character!.personalPoses[0]!.id);
    expect(afterDelete.character!.personalPoses).toHaveLength(19);
    const copied = copyPersonalPose(afterDelete, afterDelete.character!.personalPoses[0]!.id);
    expect(copied!.character!.personalPoses).toHaveLength(20);
  });

  it('角色镜头预设：相机预设切换与保存镜头', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '角色', type: 'character' });
    store.setCameraPreset('threeview');
    expect(store.activeProject!.cameraPreset).toBe('threeview');
    store.setLastCamera({ position: [3, 1.6, 3], target: [0, 1.1, 0], fov: 50 });
    const shot = store.saveShotFromCamera('三视图');
    expect(shot).not.toBeNull();
    expect(store.activeProject!.shots).toHaveLength(1);
    expect(store.activeProject!.activeShotId).toBe(shot!.id);
    expect(shot!.position).toEqual([3, 1.6, 3]);
  });

  it('角色简报导出：Markdown / JSON 结构完整', () => {
    const store = useThreeDWorkspaceStore();
    store.addProject({ name: '角色', type: 'character' });
    store.updateCharacterFields({ codename: '凛', role: '前锋', personalityKeywords: '冷静' });
    const md = characterBriefMarkdown(store.activeProject!);
    expect(md).toContain('角色设计板');
    expect(md).toContain('姓名 / 代号：凛');
    expect(md).toContain('定位：前锋');
    expect(md).toContain('姿态');
    const json = JSON.parse(characterBriefJson(store.activeProject!));
    expect(json.kind).toBe('character-brief');
    expect(json.character.codename).toBe('凛');
  });

  it('从 Chat 文本草稿预填角色档案（确定性，不自动生成）', () => {
    const prefill = prefillCharacterFromText('凛\n赛博赏金猎人\n性格「冷静」「孤傲」，穿铠甲');
    expect(prefill.codename).toContain('凛');
    expect(prefill.role).toContain('赛博赏金猎人');
    expect(prefill.style).toBe('赛博');
    expect(prefill.personalityKeywords).toContain('冷静');
    expect(prefill.personalityKeywords).toContain('孤傲');
    expect(prefill.appearanceKeywords).toContain('铠甲');
    // store 联动：从消息创建时预填
    const store = useThreeDWorkspaceStore();
    store.pendingFromMessage = {
      messageId: 'm1',
      name: '凛',
      description: '赛博赏金猎人',
      sourceText: '凛\n赛博赏金猎人\n性格「冷静」',
    } as never;
    const project = store.commitFromMessage({ name: '凛', type: 'character', description: '' });
    // 返回的即预填后的项目（store 已替换活动项目）
    expect(store.activeProject!.character!.style).toBe('赛博');
    expect(store.activeProject!.character!.personalityKeywords).toContain('冷静');
    expect(project!.character!.style).toBe('赛博');
    expect(store.generationDraft).toBeNull(); // 不自动生成
  });
});
