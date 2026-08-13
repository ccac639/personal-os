/**
 * Chat 功能域 —— 3D 工作台程序化姿态定义（纯函数，无 three 依赖）
 *
 * 姿态通过占位模型各部位的确定性旋转 / 位移体现，不需要真实骨骼：
 * 部位名称 → 部位键（head/torso/armL/armR/legL/legR），
 * 姿态键 → 每个部位相对「站立」姿态的偏移（旋转：度，位移：局部单位）。
 * 引擎在构建 / 同步角色资产时叠加这些偏移；领域测试可直接断言。
 */
import type { PoseKey, ThreeDTransform, Vec3Tuple } from './types';

export type CharacterPartKey = 'head' | 'torso' | 'armL' | 'armR' | 'legL' | 'legR';

/** 部位名称 → 部位键（启发式，与 characterPlaceholderAssets 命名一致） */
export function partKeyForName(name: string): CharacterPartKey | null {
  if (name.includes('头')) return 'head';
  if (name.includes('躯干')) return 'torso';
  if (name.includes('左臂')) return 'armL';
  if (name.includes('右臂')) return 'armR';
  if (name.includes('左腿')) return 'legL';
  if (name.includes('右腿')) return 'legR';
  return null;
}

export interface PosePartOffset {
  rotation: Vec3Tuple;
  position: Vec3Tuple;
}

const ZERO: PosePartOffset = { rotation: [0, 0, 0], position: [0, 0, 0] };

const STAND: Record<CharacterPartKey, PosePartOffset> = {
  head: ZERO,
  torso: ZERO,
  armL: ZERO,
  armR: ZERO,
  legL: ZERO,
  legR: ZERO,
};

/** 行走：双脚交替，手臂反向摆动 */
const WALK: Record<CharacterPartKey, PosePartOffset> = {
  head: { rotation: [0, 0, 0], position: [0, 0, 0] },
  torso: { rotation: [3, 0, 0], position: [0, 0, 0] },
  armL: { rotation: [-12, 0, 0], position: [0, 0, 0] },
  armR: { rotation: [12, 0, 0], position: [0, 0, 0] },
  legL: { rotation: [18, 0, 0], position: [0, 0, 0] },
  legR: { rotation: [-18, 0, 0], position: [0, 0, 0] },
};

/** 奔跑：大幅度跨步，前倾 */
const RUN: Record<CharacterPartKey, PosePartOffset> = {
  head: { rotation: [-6, 0, 0], position: [0, 0.02, 0] },
  torso: { rotation: [12, 0, 0], position: [0, 0, 0] },
  armL: { rotation: [-28, 0, 0], position: [0, 0, 0] },
  armR: { rotation: [28, 0, 0], position: [0, 0, 0] },
  legL: { rotation: [32, 0, 0], position: [0, -0.06, 0] },
  legR: { rotation: [-32, 0, 0], position: [0, -0.04, 0] },
};

/** 警戒：半蹲戒备，双臂外展 */
const ALERT: Record<CharacterPartKey, PosePartOffset> = {
  head: { rotation: [-4, 0, 0], position: [0, 0, 0] },
  torso: { rotation: [6, 0, 0], position: [0, -0.06, 0] },
  armL: { rotation: [-20, 0, 22], position: [0, -0.02, 0] },
  armR: { rotation: [-20, 0, -22], position: [0, -0.02, 0] },
  legL: { rotation: [0, 0, 8], position: [-0.04, 0, 0] },
  legR: { rotation: [0, 0, -8], position: [0.04, 0, 0] },
};

/** 坐姿：双腿屈膝，上身前倾，手臂扶膝 */
const SIT: Record<CharacterPartKey, PosePartOffset> = {
  head: { rotation: [2, 0, 0], position: [0, -0.02, 0] },
  torso: { rotation: [-8, 0, 0], position: [0, -0.12, 0] },
  armL: { rotation: [45, 0, 10], position: [0, -0.06, 0] },
  armR: { rotation: [45, 0, -10], position: [0, -0.06, 0] },
  legL: { rotation: [90, 0, 0], position: [0, -0.28, 0.1] },
  legR: { rotation: [90, 0, 0], position: [0, -0.28, 0.1] },
};

/** 战斗：格斗架势，前手护脸，后手护体，站距宽 */
const COMBAT: Record<CharacterPartKey, PosePartOffset> = {
  head: { rotation: [0, -8, 0], position: [0, 0, 0] },
  torso: { rotation: [0, 8, 0], position: [0, 0, 0] },
  armL: { rotation: [-55, 0, 25], position: [0, 0.04, 0.12] },
  armR: { rotation: [15, 0, -8], position: [0, -0.02, -0.06] },
  legL: { rotation: [0, 0, 10], position: [-0.06, 0, 0.04] },
  legR: { rotation: [-10, 0, -6], position: [0.04, 0, -0.04] },
};

const POSE_TABLE: Record<PoseKey, Record<CharacterPartKey, PosePartOffset>> = {
  stand: STAND,
  walk: WALK,
  run: RUN,
  alert: ALERT,
  sit: SIT,
  combat: COMBAT,
};

/** 姿态偏移（未知部位 / 未知姿态返回零偏移，保证确定性） */
export function poseOffsets(pose: PoseKey, partName: string): PosePartOffset {
  const part = partKeyForName(partName);
  if (!part) return ZERO;
  const offsets = POSE_TABLE[pose] ?? STAND;
  return offsets[part] ?? ZERO;
}

/** 将基础变换叠加姿态偏移（用于引擎与测试） */
export function applyPoseToTransform(
  base: ThreeDTransform,
  pose: PoseKey,
  partName: string,
): ThreeDTransform {
  const off = poseOffsets(pose, partName);
  return {
    position: [
      base.position[0] + off.position[0],
      base.position[1] + off.position[1],
      base.position[2] + off.position[2],
    ],
    rotation: [
      base.rotation[0] + off.rotation[0],
      base.rotation[1] + off.rotation[1],
      base.rotation[2] + off.rotation[2],
    ],
    scale: [...base.scale],
  };
}

export const CHARACTER_PART_LABELS: Record<CharacterPartKey, string> = {
  head: '头部',
  torso: '躯干',
  armL: '左臂',
  armR: '右臂',
  legL: '左腿',
  legR: '右腿',
};
