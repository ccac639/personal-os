/**
 * Chat 功能域 —— 3D 工作台结构校验（zod）
 *
 * 持久化信封 v2 { version: 2, data: { projects, ui, presets, templates } } 与
 * 项目 / 资产结构的严格校验：拒绝未知资产类型、未知材质、未知灯光种类、
 * 非法数值、非法颜色；损坏数据安全回退默认值（配合 domain.normalizeProject）。
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
  'metal',
  'plastic',
  'glass',
  'emissive',
  'wireframe',
  'translucent',
  'terrain',
]);

const materialParamsSchema = z.object({
  roughness: z.number().min(0).max(1),
  metalness: z.number().min(0).max(1),
  opacity: z.number().min(0).max(1),
  emissiveIntensity: z.number().min(0).max(5),
});

const lightKindSchema = z.enum(['ambient', 'directional', 'point', 'spot']);

const lightSettingsSchema = z.object({
  kind: lightKindSchema,
  enabled: z.boolean(),
  intensity: z.number().min(0).max(20),
  color: hexColorSchema,
  temperature: z.number().min(1500).max(12000).nullable(),
  shadowEnabled: z.boolean(),
  range: z.number().min(0).max(100),
  angle: z.number().min(0).max(90),
  target: vec3Schema,
});

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
    materialParams: materialParamsSchema.optional(),
    light: lightSettingsSchema.optional(),
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
    if (a.type === 'light' && !a.light) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: '灯光资产缺少 light 参数' });
    }
    if (a.type !== 'light' && a.light !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'light 参数只能用于灯光资产',
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

const personalPoseSchema = z.object({
  id: z.string().min(1),
  name: z.string().max(40),
  pose: z.enum(['stand', 'walk', 'run', 'alert', 'sit', 'combat']),
  createdAt: z.number(),
});

const characterSchema = z.object({
  codename: z.string().max(60),
  role: z.string().max(200),
  ageGroup: z.string().max(40),
  bodyType: z.string().max(40),
  style: z.string().max(60),
  personalityKeywords: z.string().max(500),
  appearanceKeywords: z.string().max(500),
  clothingKeywords: z.string().max(500),
  equipmentKeywords: z.string().max(500),
  bodyProportions: z.string().max(60),
  headRatio: z.number().min(0.5).max(2),
  shoulderWidth: z.number().min(0.5).max(2),
  legLength: z.number().min(0.5).max(2),
  primaryColor: hexColorSchema,
  secondaryColor: hexColorSchema,
  palette: z.array(hexColorSchema).max(8),
  equipment: z.array(z.string().max(60)).max(12),
  pose: z.enum(['stand', 'walk', 'run', 'alert', 'sit', 'combat']),
  personalPoses: z.array(personalPoseSchema).max(20),
});

const worldSchema = z.object({
  eraStyle: z.string().max(200),
  location: z.string().max(200),
  regionNotes: z.string().max(1000),
  atmosphere: z.string().max(500),
  timeOfDay: z.string().max(40),
  weather: z.string().max(40),
  scale: z.number().positive().max(1e6),
  shotLanguage: z.string().max(500),
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
    'group',
    'light',
    'region',
    'shot',
    'material',
    'environment',
    'pose',
    'template',
    'preset',
  ]),
  label: z.string().max(200),
  assetId: z.string().optional(),
  at: z.number(),
});

const regionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  purpose: z.string().max(200),
  style: z.string().max(200),
  dangerLevel: z.number().min(0).max(5),
  description: z.string().max(1000),
  color: hexColorSchema,
  assetIds: z.array(z.string()).max(60),
  center: vec3Schema,
  size: vec3Schema,
});

const shotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  position: vec3Schema,
  target: vec3Schema,
  fov: z.number().min(10).max(120),
  regionId: z.string().nullable(),
  notes: z.string().max(500),
  status: z.enum(['draft', 'planned', 'ready', 'final']),
  favorite: z.boolean(),
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
  selectedAssetIds: z.array(z.string()).max(60),
  cameraPreset: sceneSettingsSchema.shape.cameraPreset,
  thumbnailPreset: z.enum(['grid', 'wireframe', 'silhouette', 'topdown']),
  character: characterSchema.optional(),
  world: worldSchema.optional(),
  prop: propSchema.optional(),
  generationBrief: briefSchema,
  regions: z.array(regionSchema).max(24),
  shots: z.array(shotSchema).max(48),
  activeShotId: z.string().nullable(),
  environmentPreset: z.enum([
    'studio-day',
    'night-city',
    'foggy-forest',
    'desert-dusk',
    'showcase',
    'custom',
  ]),
  environmentCustomName: z.string().max(60),
  history: z.array(historyEntrySchema).max(50),
});

/** 个人资产预设（存储） */
export const assetPresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  category: z.string().max(20),
  description: z.string().max(200),
  keywords: z.array(z.string()).max(20),
  builtin: z.boolean(),
  favorite: z.boolean(),
  assets: z.array(assetSchema).max(40),
  createdAt: z.number(),
});

/** 个人项目模板（存储） */
export const projectTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  description: z.string().max(200),
  type: z.enum(['character', 'world', 'prop']),
  builtin: z.boolean(),
  sourceProject: projectSchema.nullable(),
  createdAt: z.number(),
});

const uiSchema = z.object({
  leftPanelOpen: z.boolean(),
  rightPanelOpen: z.boolean(),
  bottomOpen: z.boolean(),
  bottomTab: z.enum(['history', 'brief', 'storyboard']),
  tool: z.enum(['select', 'move', 'rotate', 'scale']),
  assetQuery: z.string().max(100),
  briefText: z.string().max(10000),
  noticeDismissed: z.boolean(),
  snap: z.object({
    grid: z.boolean(),
    gridStep: z.number().min(0.01).max(10),
    angle: z.boolean(),
    angleStep: z.number().min(1).max(90),
    scale: z.boolean(),
    scaleStep: z.number().min(0.01).max(1),
  }),
  coordSpace: z.enum(['world', 'local']),
  showBoundingBox: z.boolean(),
  isolation: z.boolean(),
  materialPreview: z.boolean(),
  assetPanelTab: z.enum(['tree', 'library', 'regions']),
  regionFilter: z.string().nullable(),
  assetLibraryQuery: z.string().max(100),
  assetLibraryCategory: z.string().max(40),
  designBoardOpen: z.boolean(),
  storyboardOpen: z.boolean(),
});

/** 存储信封 v2 */
export const storageEnvelopeSchema = z.object({
  version: z.literal(2),
  data: z.object({
    projects: z.array(projectSchema).max(40),
    ui: uiSchema,
    presets: z.array(assetPresetSchema).max(40).default([]),
    templates: z.array(projectTemplateSchema).max(24).default([]),
  }),
});

/** v1 存储信封（迁移读取用） */
export const storageEnvelopeV1Schema = z.object({
  version: z.literal(1),
  data: z.object({
    projects: z.array(z.unknown()),
    ui: uiSchema.partial(),
  }),
});

export type StoredAsset = z.infer<typeof assetSchema>;
export type StoredProject = z.infer<typeof projectSchema>;
export type StoredUi = z.infer<typeof uiSchema>;
export type StoredEnvelope = z.infer<typeof storageEnvelopeSchema>;
export type StoredPreset = z.infer<typeof assetPresetSchema>;
export type StoredTemplate = z.infer<typeof projectTemplateSchema>;
