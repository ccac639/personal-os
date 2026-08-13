/**
 * Chat 功能域 —— 3D 生成服务边界
 *
 * ThreeDGenerationService 是未来真实 3D 生成服务的适配层：
 * UI / Store 只依赖该接口；当前实现为 deterministic mock（不生成真实 glTF/FBX）。
 * 未来接入时只需替换 setThreeDGenerationService 的注入实现。
 */
import { CAMERA_PRESETS, IDENTITY, NOW } from './constants';
import type {
  CameraPresetId,
  ThreeDGenerationDraft,
  ThreeDGenerationRequest,
  ThreeDGenerationService,
} from './types';

export const GENERATION_SERVICE_NOTE = '仅本地预览：尚未连接真实 3D 生成服务';

const PLAN_BY_TYPE: Record<
  ThreeDGenerationRequest['projectType'],
  (input: ThreeDGenerationRequest) => string[]
> = {
  character: (input) => [
    `解析角色简报：${input.briefText.slice(0, 120)}${input.briefText.length > 120 ? '…' : ''}`,
    '按体型比例生成基础人体拓扑（占位）',
    '应用配色与服装/材质关键词到占位材质',
    '布置装备占位并生成三视图相机',
    `输出 ${input.dimensions || '1024x1024'} 角色预览（未来接入真实服务）`,
  ],
  world: (input) => [
    `解析世界简报：${input.briefText.slice(0, 120)}${input.briefText.length > 120 ? '…' : ''}`,
    '按时代/风格与地点生成地面网格与区域块布局（占位）',
    '放置建筑 / 植被 / 路径占位物，按危险等级标记区域',
    `按时间 ${input.tags.includes('夜晚') ? '夜晚' : '白昼'} 设置环境光与主光`,
    `规划镜头：${input.shots.length > 0 ? `复用现有 ${input.shots.length} 个镜头` : '生成街道 / 鸟瞰镜头'}（未来接入真实服务）`,
    '输出鸟瞰 / 街道相机预设（未来接入真实服务）',
  ],
  prop: (input) => [
    `解析道具简报：${input.briefText.slice(0, 120)}${input.briefText.length > 120 ? '…' : ''}`,
    '组合基础几何体生成道具占位',
    '应用材质预设与尺寸提示',
    '输出道具正视图 / 45° 视角相机',
    `输出 ${input.dimensions || '512x512'} 道具预览（未来接入真实服务）`,
  ],
};

const CAMERA_NOTE: Partial<Record<CameraPresetId, string>> = {
  perspective: '默认透视，适合整体检查',
  closeup: '角色近景，突出细节',
  birdseye: '世界鸟瞰，检查布局',
  fullbody: '角色全身，检查比例',
  threeview: '三视图，检查轮廓',
  street: '街道视角，感受氛围',
};

/** 确定性 mock：输入项目类型 / 简报 / 资产配置 → 结构化生成计划（不联网、不生成模型） */
export class DeterministicMockGenerationService implements ThreeDGenerationService {
  createDraft(input: ThreeDGenerationRequest): Promise<ThreeDGenerationDraft> {
    const plan = PLAN_BY_TYPE[input.projectType](input);
    const suggestedAssets = this.suggestAssets(input);
    const suggestedLights = this.suggestLights(input.projectType);
    const preset = this.suggestCamera(input);
    const draft: ThreeDGenerationDraft = {
      requestId: IDENTITY(),
      status: 'draft',
      source: 'mock',
      projectType: input.projectType,
      plan,
      suggestedAssets,
      suggestedLights,
      suggestedCamera: { preset, note: CAMERA_NOTE[preset] ?? '建议镜头' },
      suggestedRegions: input.projectType === 'world' ? this.suggestRegions(input) : undefined,
      suggestedShots: this.suggestShots(input),
      createdAt: NOW(),
      note: GENERATION_SERVICE_NOTE,
    };
    // 模拟异步边界（未来真实服务为网络请求）
    return Promise.resolve(draft);
  }

  private suggestAssets(input: ThreeDGenerationRequest): ThreeDGenerationDraft['suggestedAssets'] {
    if (input.projectType === 'character') {
      return [
        { name: '头部', type: 'character-placeholder', reason: '角色头部占位' },
        { name: '躯干', type: 'character-placeholder', reason: '角色躯干占位' },
        { name: '装备挂点', type: 'group', reason: '装备占位组合' },
      ];
    }
    if (input.projectType === 'world') {
      return [
        { name: '区域地面', type: 'world-placeholder', reason: '世界地面块' },
        { name: '建筑群', type: 'world-placeholder', reason: '建筑占位' },
        { name: '植被带', type: 'world-placeholder', reason: '植被占位' },
      ];
    }
    return [
      { name: '主体', type: 'primitive', primitiveKind: 'cube', reason: '道具主体' },
      { name: '细节件', type: 'primitive', primitiveKind: 'cylinder', reason: '道具细节' },
    ];
  }

  private suggestLights(
    type: ThreeDGenerationRequest['projectType'],
  ): ThreeDGenerationDraft['suggestedLights'] {
    const base: ThreeDGenerationDraft['suggestedLights'] = [
      { kind: 'ambient', color: '#cbd5e1', intensity: 0.5 },
      { kind: 'key', color: '#ffffff', intensity: 1.4 },
    ];
    if (type === 'world') {
      return [...base, { kind: 'fill', color: '#60a5fa', intensity: 0.35 }];
    }
    if (type === 'character') {
      return [...base, { kind: 'fill', color: '#fbbf24', intensity: 0.4 }];
    }
    return base;
  }

  private suggestCamera(input: ThreeDGenerationRequest): CameraPresetId {
    if (input.projectType === 'character') {
      if (input.cameraPreset === 'threeview') return 'threeview';
      return 'fullbody';
    }
    if (input.projectType === 'world') {
      if (input.cameraPreset === 'street') return 'street';
      return 'birdseye';
    }
    return 'perspective';
  }

  /** 世界项目：按简报返回建议区域（本地模拟建议，不落盘） */
  private suggestRegions(
    input: ThreeDGenerationRequest,
  ): NonNullable<ThreeDGenerationDraft['suggestedRegions']> {
    const base: NonNullable<ThreeDGenerationDraft['suggestedRegions']> = [
      {
        name: '入口区',
        purpose: '玩家进入世界的起点，安全区',
        style: '开阔广场',
        dangerLevel: 0,
        color: '#22c55e',
      },
      {
        name: '中心市集',
        purpose: '主要交互区域，NPC 聚集',
        style: '热闹街市',
        dangerLevel: 1,
        color: '#f59e0b',
      },
      {
        name: '废弃边缘',
        purpose: '探索 / 战斗区域',
        style: '破败废墟',
        dangerLevel: 3,
        color: '#ef4444',
      },
    ];
    if (input.regions.length > 0)
      return input.regions.slice(0, 4).map((r) => ({
        name: r.name,
        purpose: r.purpose || '既有区域',
        style: r.style || '未设定风格',
        dangerLevel: r.dangerLevel,
        color: r.color,
      }));
    return base;
  }

  /** 建议镜头列表（角色全身/半身/面部/背面/三视图；世界街道/鸟瞰） */
  private suggestShots(
    input: ThreeDGenerationRequest,
  ): NonNullable<ThreeDGenerationDraft['suggestedShots']> {
    if (input.projectType === 'character') {
      return [
        { name: '全身镜头', preset: 'fullbody', note: '检查整体比例' },
        { name: '半身镜头', preset: 'halfbody', note: '强调上半身细节' },
        { name: '肖像镜头', preset: 'face', note: '面部特写' },
        { name: '背面镜头', preset: 'back', note: '检查背面轮廓' },
        { name: '三视图镜头', preset: 'threeview', note: '多角度轮廓' },
      ];
    }
    if (input.projectType === 'world') {
      return [
        { name: '街道镜头', preset: 'street', note: '感受步行氛围' },
        { name: '鸟瞰镜头', preset: 'birdseye', note: '检查整体布局' },
        { name: '建筑镜头', preset: 'building', note: '地标建筑视角' },
      ];
    }
    return [{ name: '产品镜头', preset: 'perspective', note: '45° 展示' }];
  }
}

let currentService: ThreeDGenerationService = new DeterministicMockGenerationService();

/** 注入真实服务（未来接入点） */
export function setThreeDGenerationService(service: ThreeDGenerationService): void {
  currentService = service;
}

export function getThreeDGenerationService(): ThreeDGenerationService {
  return currentService;
}

/** 相机预设中文标签（画布 / 简报共用） */
export function cameraPresetLabel(key: CameraPresetId): string {
  return CAMERA_PRESETS.find((c) => c.key === key)?.label ?? key;
}
