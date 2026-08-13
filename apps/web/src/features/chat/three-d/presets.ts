/**
 * Chat 功能域 —— 3D 工作台本地预设库与项目模板
 *
 * 资产预设完全由已有 primitive 组合构成（无外链模型 / 贴图），插入时复制为全新 ID。
 * 内置项目模板由工厂函数构建（每次全新 ID，不共享可变引用）；
 * 个人模板存 sourceProject 快照，应用时走导入校验 + ID 重映射（见 domain）。
 */
import {
  IDENTITY,
  NOW,
  defaultCharacterSettings,
  defaultShot,
  makeAsset,
  worldPlaceholderAssets,
} from './constants';
import { createProject } from './domain';
import type {
  AssetPreset,
  PrimitiveKind,
  ThreeDAsset,
  ThreeDProject,
  ThreeDProjectTemplate,
} from './types';

/* ============================================================
 * 内置资产预设
 * ============================================================ */

let presetSeq = 0;
const P = (n: number): string => `P${n}`;

interface PartSpec {
  name: string;
  kind: PrimitiveKind;
  position: [number, number, number];
  rotation?: [number, number, number];
  scale: [number, number, number];
  color: string;
  material?: ThreeDAsset['materialPreset'];
  opacity?: number;
}

function presetAssets(parts: PartSpec[], rootName: string, rootColor = '#94a3b8'): ThreeDAsset[] {
  const root = makeAsset({
    id: P(1),
    name: rootName,
    type: 'group',
    color: rootColor,
    tags: ['预设'],
    notes: '本地资产预设（由基础几何体组合）',
  });
  const out: ThreeDAsset[] = [root];
  parts.forEach((part, i) => {
    out.push(
      makeAsset({
        id: P(i + 2),
        name: part.name,
        type: 'primitive',
        primitiveKind: part.kind,
        parentId: P(1),
        color: part.color,
        materialPreset: part.material ?? 'standard',
        transform: {
          position: part.position,
          rotation: part.rotation ?? [0, 0, 0],
          scale: part.scale,
        },
        ...(part.opacity !== undefined
          ? {
              materialParams: {
                roughness: 0.4,
                metalness: 0.1,
                opacity: part.opacity,
                emissiveIntensity: 0,
              },
            }
          : {}),
      }),
    );
  });
  return out;
}

function builtinPreset(
  id: string,
  name: string,
  category: string,
  description: string,
  keywords: string[],
  parts: PartSpec[],
): AssetPreset {
  presetSeq += 1;
  return {
    id,
    name,
    category,
    description,
    keywords,
    builtin: true,
    favorite: false,
    assets: presetAssets(parts, name),
    createdAt: NOW() - presetSeq, // 保持稳定排序
  };
}

export const BUILTIN_ASSET_PRESETS: AssetPreset[] = [
  builtinPreset(
    'preset-building',
    '基础建筑',
    '建筑',
    '立方体主体 + 屋顶 + 门，适合街区填充',
    ['建筑', '房屋', '街区', '民居'],
    [
      {
        name: '主体',
        kind: 'cube',
        position: [0, 1.2, 0],
        scale: [2, 2.4, 2],
        color: '#b45309',
        material: 'matte',
      },
      {
        name: '屋顶',
        kind: 'cone',
        position: [0, 2.95, 0],
        scale: [1.7, 0.9, 1.7],
        color: '#7c2d12',
        material: 'matte',
      },
      {
        name: '门',
        kind: 'cube',
        position: [0, 0.5, 1.01],
        scale: [0.5, 1, 0.1],
        color: '#451a03',
      },
    ],
  ),
  builtinPreset(
    'preset-road',
    '道路段',
    '道路',
    '路面 + 车道线，可拼接成长街',
    ['道路', '路面', '街道', '车道'],
    [
      {
        name: '路面',
        kind: 'plane',
        position: [0, 0, 0],
        scale: [1.8, 1, 8],
        color: '#334155',
        material: 'terrain',
      },
      {
        name: '车道线左',
        kind: 'cube',
        position: [-0.45, 0.02, 0],
        scale: [0.06, 0.02, 7.6],
        color: '#e2e8f0',
      },
      {
        name: '车道线右',
        kind: 'cube',
        position: [0.45, 0.02, 0],
        scale: [0.06, 0.02, 7.6],
        color: '#e2e8f0',
      },
    ],
  ),
  builtinPreset(
    'preset-tree',
    '树木',
    '自然',
    '树干 + 双层树冠，适合植被填充',
    ['树', '树木', '植被', '森林', '自然'],
    [
      {
        name: '树干',
        kind: 'cylinder',
        position: [0, 0.4, 0],
        scale: [0.14, 0.8, 0.14],
        color: '#78350f',
        material: 'matte',
      },
      {
        name: '树冠下',
        kind: 'cone',
        position: [0, 1.35, 0],
        scale: [0.7, 0.9, 0.7],
        color: '#15803d',
      },
      {
        name: '树冠上',
        kind: 'cone',
        position: [0, 2.15, 0],
        scale: [0.5, 0.7, 0.5],
        color: '#16a34a',
      },
    ],
  ),
  builtinPreset(
    'preset-rock',
    '岩石',
    '自然',
    '三块扁球体堆叠的岩石组',
    ['岩石', '石头', '地形', '自然'],
    [
      {
        name: '岩块 A',
        kind: 'sphere',
        position: [0, 0.25, 0],
        scale: [0.8, 0.5, 0.7],
        color: '#78716c',
        material: 'terrain',
      },
      {
        name: '岩块 B',
        kind: 'sphere',
        position: [0.7, 0.12, 0.2],
        scale: [0.5, 0.24, 0.45],
        color: '#57534e',
        material: 'terrain',
      },
      {
        name: '岩块 C',
        kind: 'cube',
        position: [-0.55, 0.1, -0.15],
        scale: [0.55, 0.2, 0.4],
        color: '#a8a29e',
        material: 'terrain',
      },
    ],
  ),
  builtinPreset(
    'preset-table',
    '木桌',
    '家具',
    '桌面 + 四条桌腿',
    ['桌子', '家具', '木桌', '室内'],
    [
      {
        name: '桌面',
        kind: 'cube',
        position: [0, 0.8, 0],
        scale: [1.6, 0.12, 0.9],
        color: '#92400e',
        material: 'matte',
      },
      {
        name: '桌腿 A',
        kind: 'cube',
        position: [-0.7, 0.34, -0.35],
        scale: [0.1, 0.68, 0.1],
        color: '#78350f',
      },
      {
        name: '桌腿 B',
        kind: 'cube',
        position: [0.7, 0.34, -0.35],
        scale: [0.1, 0.68, 0.1],
        color: '#78350f',
      },
      {
        name: '桌腿 C',
        kind: 'cube',
        position: [-0.7, 0.34, 0.35],
        scale: [0.1, 0.68, 0.1],
        color: '#78350f',
      },
      {
        name: '桌腿 D',
        kind: 'cube',
        position: [0.7, 0.34, 0.35],
        scale: [0.1, 0.68, 0.1],
        color: '#78350f',
      },
    ],
  ),
  builtinPreset(
    'preset-chair',
    '木椅',
    '家具',
    '椅面 + 椅背 + 四条椅腿',
    ['椅子', '家具', '木椅', '室内'],
    [
      {
        name: '椅面',
        kind: 'cube',
        position: [0, 0.5, 0],
        scale: [0.5, 0.08, 0.5],
        color: '#92400e',
        material: 'matte',
      },
      {
        name: '椅背',
        kind: 'cube',
        position: [0, 0.85, -0.22],
        scale: [0.5, 0.62, 0.08],
        color: '#92400e',
      },
      {
        name: '椅腿 A',
        kind: 'cube',
        position: [-0.2, 0.22, 0.18],
        scale: [0.06, 0.44, 0.06],
        color: '#78350f',
      },
      {
        name: '椅腿 B',
        kind: 'cube',
        position: [0.2, 0.22, 0.18],
        scale: [0.06, 0.44, 0.06],
        color: '#78350f',
      },
      {
        name: '椅腿 C',
        kind: 'cube',
        position: [-0.2, 0.22, -0.18],
        scale: [0.06, 0.44, 0.06],
        color: '#78350f',
      },
      {
        name: '椅腿 D',
        kind: 'cube',
        position: [0.2, 0.22, -0.18],
        scale: [0.06, 0.44, 0.06],
        color: '#78350f',
      },
    ],
  ),
  builtinPreset(
    'preset-sword',
    '长剑',
    '武器',
    '剑刃 + 护手 + 剑柄',
    ['武器', '剑', '长剑', '装备'],
    [
      {
        name: '剑刃',
        kind: 'cube',
        position: [0, 0.85, 0],
        rotation: [0, 0, 0],
        scale: [0.12, 1.5, 0.04],
        color: '#e2e8f0',
        material: 'metal',
      },
      {
        name: '护手',
        kind: 'cylinder',
        position: [0, 0.12, 0],
        rotation: [90, 0, 0],
        scale: [0.22, 0.05, 0.22],
        color: '#b45309',
        material: 'metal',
      },
      {
        name: '剑柄',
        kind: 'cylinder',
        position: [0, -0.18, 0],
        rotation: [90, 0, 0],
        scale: [0.06, 0.55, 0.06],
        color: '#451a03',
      },
    ],
  ),
  builtinPreset(
    'preset-pedestal',
    '道具台',
    '道具台',
    '柱形底座 + 展示顶面',
    ['道具台', '展示台', '底座', '陈列'],
    [
      {
        name: '底座',
        kind: 'cylinder',
        position: [0, 0.35, 0],
        scale: [0.9, 0.7, 0.9],
        color: '#475569',
        material: 'matte',
      },
      {
        name: '顶面',
        kind: 'cylinder',
        position: [0, 0.78, 0],
        scale: [0.95, 0.06, 0.95],
        color: '#64748b',
        material: 'plastic',
      },
    ],
  ),
  builtinPreset(
    'preset-helmet',
    '头盔',
    '装备',
    '半圆盔体 + 顶冠，角色装备占位',
    ['头盔', '装备', '角色', '防具'],
    [
      {
        name: '盔体',
        kind: 'sphere',
        position: [0, 0.18, 0],
        scale: [0.5, 0.42, 0.5],
        color: '#64748b',
        material: 'metal',
      },
      {
        name: '顶冠',
        kind: 'cone',
        position: [0, 0.62, 0],
        scale: [0.18, 0.3, 0.18],
        color: '#b91c1c',
        material: 'plastic',
      },
      {
        name: '护颈',
        kind: 'torus',
        position: [0, 0.02, 0],
        rotation: [90, 0, 0],
        scale: [0.62, 0.14, 0.62],
        color: '#475569',
        material: 'metal',
      },
    ],
  ),
  builtinPreset(
    'preset-streetlamp',
    '路灯',
    '道路',
    '灯柱 + 横臂 + 灯头',
    ['路灯', '街道', '照明', '道路'],
    [
      {
        name: '灯柱',
        kind: 'cylinder',
        position: [0, 1.6, 0],
        scale: [0.08, 3.2, 0.08],
        color: '#334155',
        material: 'metal',
      },
      {
        name: '横臂',
        kind: 'cylinder',
        position: [0.55, 3.15, 0],
        rotation: [0, 0, 90],
        scale: [0.05, 1.1, 0.05],
        color: '#334155',
        material: 'metal',
      },
      {
        name: '灯头',
        kind: 'sphere',
        position: [1.05, 3.05, 0],
        scale: [0.16, 0.2, 0.16],
        color: '#fef3c7',
        material: 'emissive',
        opacity: 0.9,
      },
    ],
  ),
  builtinPreset(
    'preset-arch',
    '拱门',
    '建筑',
    '双柱 + 拱顶，入口标识',
    ['拱门', '门', '建筑', '入口'],
    [
      {
        name: '左柱',
        kind: 'cube',
        position: [-0.8, 1.4, 0],
        scale: [0.3, 2.8, 0.5],
        color: '#a16207',
        material: 'matte',
      },
      {
        name: '右柱',
        kind: 'cube',
        position: [0.8, 1.4, 0],
        scale: [0.3, 2.8, 0.5],
        color: '#a16207',
        material: 'matte',
      },
      {
        name: '横梁',
        kind: 'cube',
        position: [0, 2.85, 0],
        scale: [2, 0.4, 0.6],
        color: '#854d0e',
        material: 'matte',
      },
      {
        name: '拱顶',
        kind: 'torus',
        position: [0, 2.85, 0],
        rotation: [0, 0, 90],
        scale: [0.85, 0.16, 0.85],
        color: '#ca8a04',
        material: 'matte',
      },
    ],
  ),
];

/** 合并查找：内置 + 个人预设 */
export function findAssetPreset(id: string, personal: AssetPreset[]): AssetPreset | undefined {
  return BUILTIN_ASSET_PRESETS.find((p) => p.id === id) ?? personal.find((p) => p.id === id);
}

export const ASSET_PRESET_CATEGORIES = [
  '建筑',
  '道路',
  '自然',
  '家具',
  '武器',
  '道具台',
  '装备',
] as const;

/* ============================================================
 * 内置项目模板（工厂函数：每次全新 ID，不共享可变引用）
 * ============================================================ */

export const BUILTIN_TEMPLATE_IDS = [
  'template-character-basic',
  'template-world-street',
  'template-prop-showcase',
  'template-storyboard',
] as const;

function templateMeta(
  id: string,
  name: string,
  description: string,
  type: ThreeDProject['type'],
): ThreeDProjectTemplate {
  return { id, name, description, type, builtin: true, sourceProject: null, createdAt: 0 };
}

export const BUILTIN_PROJECT_TEMPLATES: ThreeDProjectTemplate[] = [
  templateMeta(
    'template-character-basic',
    '角色设定',
    '基础人体占位 + 档案字段 + 角色镜头，快速开始角色设计',
    'character',
  ),
  templateMeta(
    'template-world-street',
    '世界概念',
    '街区占位 + 三个区域 + 街道/鸟瞰镜头，快速开始世界布局',
    'world',
  ),
  templateMeta('template-prop-showcase', '道具展示', '空道具场景 + 展示台预设 + 产品镜头', 'prop'),
  templateMeta(
    'template-storyboard',
    '镜头分镜',
    '世界场景 + 分区 + 完整分镜镜头列表，专注镜头语言规划',
    'world',
  ),
];

/** 工厂：按模板 id 构建全新项目（内置模板不可删除，返回新实例） */
export function buildTemplateProject(templateId: string): ThreeDProject | null {
  const now = NOW();
  if (templateId === 'template-character-basic') {
    const p = createProject({
      name: '角色设定模板',
      description: '由「角色设定」模板创建',
      type: 'character',
      tags: ['模板'],
    });
    p.environmentPreset = 'showcase';
    p.character = {
      ...defaultCharacterSettings(),
      codename: '无名旅者',
      role: '探索者',
      bodyProportions: 'average',
      style: '写实',
      palette: ['#3b5b92', '#f1c27d', '#2f4468'],
    };
    p.shots = [
      defaultShot({
        name: '全身',
        position: [0, 1.3, 4.5],
        target: [0, 1.1, 0],
        fov: 45,
        at: now + 1,
      }),
      defaultShot({
        name: '半身',
        position: [0, 1.5, 2.2],
        target: [0, 1.4, 0],
        fov: 50,
        at: now + 2,
      }),
      defaultShot({
        name: '肖像',
        position: [0, 1.7, 1.1],
        target: [0, 1.62, 0],
        fov: 55,
        at: now + 3,
      }),
      defaultShot({
        name: '背面',
        position: [0, 1.1, -4.5],
        target: [0, 1.1, 0],
        fov: 45,
        at: now + 4,
      }),
      defaultShot({
        name: '三视图',
        position: [3.2, 1.6, 3.2],
        target: [0, 1.1, 0],
        fov: 50,
        at: now + 5,
      }),
    ];
    return p;
  }
  if (templateId === 'template-world-street') {
    const p = createProject({
      name: '世界概念模板',
      description: '由「世界概念」模板创建',
      type: 'world',
      tags: ['模板'],
    });
    p.environmentPreset = 'studio-day';
    p.world = {
      ...p.world!,
      eraStyle: '现代都市',
      location: '沿海旧城',
      atmosphere: '热闹',
      shotLanguage: '中远景为主，节奏舒缓',
    };
    p.regions = [
      {
        id: IDENTITY(),
        name: '主街入口',
        purpose: '玩家进入世界的起点',
        style: '开阔广场',
        dangerLevel: 0,
        description: '安全区',
        color: '#22c55e',
        assetIds: [],
        center: [0, 0.3, 2],
        size: [4, 0.6, 4],
      },
      {
        id: IDENTITY(),
        name: '中心市集',
        purpose: 'NPC 聚集与交易',
        style: '热闹街市',
        dangerLevel: 1,
        description: '人流密集',
        color: '#f59e0b',
        assetIds: [],
        center: [0, 0.3, -2],
        size: [5, 0.6, 5],
      },
      {
        id: IDENTITY(),
        name: '废弃码头',
        purpose: '探索 / 战斗区域',
        style: '破败工业',
        dangerLevel: 3,
        description: '危险',
        color: '#ef4444',
        assetIds: [],
        center: [4, 0.3, -3],
        size: [4, 0.6, 4],
      },
    ];
    p.shots = [
      defaultShot({
        name: '街道',
        position: [0, 1.8, 6],
        target: [0, 0.5, 0],
        fov: 50,
        at: now + 1,
      }),
      defaultShot({
        name: '鸟瞰',
        position: [0, 12, 8],
        target: [0, 0.5, 0],
        fov: 45,
        at: now + 2,
      }),
      defaultShot({
        name: '建筑',
        position: [-5, 4, -3],
        target: [0, 1.5, 0],
        fov: 48,
        at: now + 3,
      }),
    ];
    return p;
  }
  if (templateId === 'template-prop-showcase') {
    const p = createProject({
      name: '道具展示模板',
      description: '由「道具展示」模板创建',
      type: 'prop',
      tags: ['模板'],
    });
    p.environmentPreset = 'showcase';
    p.prop = { ...p.prop!, description: '待设计道具', usage: '展示', sizeHint: '40cm' };
    p.shots = [
      defaultShot({
        name: '产品镜头',
        position: [3.2, 2.2, 4],
        target: [0, 0.6, 0],
        fov: 45,
        at: now + 1,
      }),
    ];
    return p;
  }
  if (templateId === 'template-storyboard') {
    const p = createProject({
      name: '镜头分镜模板',
      description: '由「镜头分镜」模板创建',
      type: 'world',
      tags: ['模板', '分镜'],
    });
    p.environmentPreset = 'foggy-forest';
    p.world = {
      ...p.world!,
      eraStyle: '蒸汽奇幻',
      location: '雾中峡谷',
      atmosphere: '神秘',
      shotLanguage: '近景特写 + 远景交代，节奏先紧后松',
    };
    p.regions = [
      {
        id: IDENTITY(),
        name: '峡谷入口',
        purpose: '开场场景',
        style: '狭窄山道',
        dangerLevel: 1,
        description: '开场镜头区域',
        color: '#06b6d4',
        assetIds: [],
        center: [0, 0.3, 3],
        size: [4, 0.6, 4],
      },
      {
        id: IDENTITY(),
        name: '废弃车站',
        purpose: '主要事件区域',
        style: '工业废墟',
        dangerLevel: 3,
        description: '中段高潮',
        color: '#f97316',
        assetIds: [],
        center: [3, 0.3, -2],
        size: [5, 0.6, 5],
      },
      {
        id: IDENTITY(),
        name: '崖顶灯塔',
        purpose: '结局场景',
        style: '孤高建筑',
        dangerLevel: 2,
        description: '尾声',
        color: '#a855f7',
        assetIds: [],
        center: [-3, 0.3, -4],
        size: [4, 0.6, 4],
      },
    ];
    p.shots = [
      defaultShot({
        name: '开场·远景',
        position: [0, 2.5, 8],
        target: [0, 0.5, 2],
        fov: 42,
        regionId: p.regions[0]!.id,
        notes: '交代环境',
        at: now + 1,
      }),
      defaultShot({
        name: '开场·特写',
        position: [0.8, 1.2, 2.2],
        target: [0.2, 0.8, 2.8],
        fov: 60,
        regionId: p.regions[0]!.id,
        notes: '角色出场',
        at: now + 2,
      }),
      defaultShot({
        name: '中段·中景',
        position: [3.5, 1.6, 1.5],
        target: [3, 0.8, -1],
        fov: 50,
        regionId: p.regions[1]!.id,
        notes: '发现线索',
        at: now + 3,
      }),
      defaultShot({
        name: '中段·冲突',
        position: [2.2, 1.4, -0.5],
        target: [3.2, 0.9, -2.2],
        fov: 55,
        regionId: p.regions[1]!.id,
        notes: '动作场面',
        at: now + 4,
      }),
      defaultShot({
        name: '结尾·仰望',
        position: [-2.4, 1.1, -2.6],
        target: [-3, 2.4, -4],
        fov: 45,
        regionId: p.regions[2]!.id,
        notes: '灯塔近景',
        at: now + 5,
      }),
      defaultShot({
        name: '结尾·大全景',
        position: [-6, 5, -1],
        target: [-3, 0.5, -3],
        fov: 40,
        regionId: p.regions[2]!.id,
        notes: '收尾留白',
        at: now + 6,
      }),
    ];
    return p;
  }
  return null;
}

export function findTemplate(
  templateId: string,
  personal: ThreeDProjectTemplate[],
): ThreeDProjectTemplate | undefined {
  return (
    BUILTIN_PROJECT_TEMPLATES.find((t) => t.id === templateId) ??
    personal.find((t) => t.id === templateId)
  );
}

/** 世界模板占位资产（供模板工厂复用街区） */
export function streetBlockAssets(): ThreeDAsset[] {
  return worldPlaceholderAssets();
}
