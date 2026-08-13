/**
 * Chat 功能域 —— 3D 工作台结构校验（zod）
 *
 * 持久化信封 { version, data } 与项目 / 资产结构的严格校验：
 * 拒绝未知资产类型、非法数值、非法颜色；损坏数据安全回退默认值。
 */
import { z } from 'zod';

export const vec3Schema = z
  .tuple([z.number(), z.number(), z.number()])
  .refine((v) => v.every((n) => Number.isFinite(n) && Math.abs(n) < 1e6), '非法数值');

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, '非法颜色');

const transformSchema = z.object({
  position: vec3Schema,
  rotation: vec3Schema,
  scale: vec3Schema,
});

const materialPresetSchema = z.enum([
  'standard',
  'matte',
  'glossy',
  'emissive',
  'wireframe',
  'translucent',
]);

const assetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.enum([
      'primitive',
      'character-placeholder',
      'world-placeholder',
      'light',
      'camera-marker',
      'group',
    ]),
    primitiveKind: z.enum(['cube', 'sphere', 'cylinder', 'cone', 'plane', 'torus']).optional(),
    visible: z.boolean(),
    locked: z.boolean(),
    transform: transformSchema,
    color: hexColorSchema,
    materialPreset: materialPresetSchema,
    parentId: z.string().optional(),
    tags: z.array(z.string()).max(12).default([]),
    notes: z.string().max(500).default(''),
  })
  .superRefine((a, ctx) => {
    if (a.type === 'primitive' && !a.primitiveKind) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'primitive 资产缺少 primitiveKind' });
    }
    if (a.type !== 'primitive' && a.primitiveKind !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'primitiveKind 只能用于 primitive 资产',
      });
    }
  });

const sceneSettingsSchema = z.object({
  background: hexColorSchema,
  groundColor: hexColorSchema,
  groundVisible: z.boolean(),
  gridVisible: z.boolean(),
  axesVisible: z.boolean(),
  ambientLight: z.object({
    enabled: z.boolean(),
    color: hexColorSchema,
    intensity: z.number().min(0).max(3),
  }),
  mainLight: z.object({
    enabled: z.boolean(),
    color: hexColorSchema,
    intensity: z.number().min(0).max(20),
    position: vec3Schema,
  }),
  fog: z.object({
    enabled: z.boolean(),
    color: hexColorSchema,
    near: z.number().min(0),
    far: z.number().min(0).max(1000),
  }),
  cameraPreset: z.enum([
    'perspective',
    'front',
    'side',
    'top',
    'closeup',
    'birdseye',
    'fullbody',
    'halfbody',
    'face',
    'back',
    'threeview',
    'street',
    'ground',
    'building',
  ]),
});

const characterSchema = z.object({
  bodyProportions: z.string().max(60),
  pose: z.string().max(60),
  palette: z.array(hexColorSchema).max(8),
  equipment: z.array(z.string().max(60)).max(12),
  role: z.string().max(200),
  appearanceKeywords: z.string().max(500),
  clothingKeywords: z.string().max(500),
});

const worldSchema = z.object({
  eraStyle: z.string().max(200),
  regionNotes: z.string().max(1000),
  atmosphere: z.string().max(500),
  timeOfDay: z.string().max(40),
  weather: z.string().max(40),
  scale: z.number().positive().max(1e6),
});

const propSchema = z.object({
  description: z.string().max(500),
  usage: z.string().max(500),
  sizeHint: z.string().max(200),
});

const briefSchema = z.object({
  description: z.string().max(2000),
  style: z.string().max(500),
  dimensions: z.string().max(100),
  targetPlatform: z.string().max(100),
});

const historyEntrySchema = z.object({
  id: z.string().min(1),
  kind: z.enum([
    'create',
    'update',
    'delete',
    'duplicate',
    'transform',
    'color',
    'scene',
    'project',
    'brief',
    'undo',
    'redo',
  ]),
  label: z.string().max(200),
  assetId: z.string().optional(),
  at: z.number(),
});

export const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(1000),
  type: z.enum(['character', 'world', 'prop']),
  status: z.enum(['draft', 'exploring', 'ready', 'archived']),
  tags: z.array(z.string()).max(12),
  createdAt: z.number(),
  updatedAt: z.number(),
  sceneSettings: sceneSettingsSchema,
  assets: z.array(assetSchema).max(150),
  activeAssetId: z.string().nullable(),
  cameraPreset: sceneSettingsSchema.shape.cameraPreset,
  thumbnailPreset: z.enum(['grid', 'wireframe', 'silhouette', 'topdown']),
  character: characterSchema.optional(),
  world: worldSchema.optional(),
  prop: propSchema.optional(),
  generationBrief: briefSchema,
  history: z.array(historyEntrySchema).max(50),
});

const uiSchema = z.object({
  leftPanelOpen: z.boolean(),
  rightPanelOpen: z.boolean(),
  bottomOpen: z.boolean(),
  bottomTab: z.enum(['history', 'brief']),
  tool: z.enum(['select', 'move', 'rotate', 'scale']),
  assetQuery: z.string().max(100),
  briefText: z.string().max(10000),
  noticeDismissed: z.boolean(),
});

export const storageEnvelopeSchema = z.object({
  version: z.literal(1),
  data: z.object({
    projects: z.array(projectSchema).max(40),
    ui: uiSchema,
  }),
});

export type StoredAsset = z.infer<typeof assetSchema>;
export type StoredProject = z.infer<typeof projectSchema>;
export type StoredUi = z.infer<typeof uiSchema>;
export type StoredEnvelope = z.infer<typeof storageEnvelopeSchema>;
