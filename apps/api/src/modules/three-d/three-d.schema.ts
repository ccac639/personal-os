import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

import { DEFAULT_OWNER_ID, newId } from '../chat/chat.constants.js';

/** 资产节点元数据：仅允许标量（字符串/数字/布尔），禁止任何二进制引用 */
export type AssetMetaValue = string | number | boolean;
export type AssetMeta = Record<string, AssetMetaValue>;

export const ASSET_KINDS = [
  'folder',
  'mesh',
  'material',
  'texture',
  'animation',
  'light',
  'camera',
  'other',
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

export const PROJECT_TEMPLATES = ['blank', 'character-showcase', 'storyboard'] as const;
export type ProjectTemplate = (typeof PROJECT_TEMPLATES)[number];

export interface AssetNodeData {
  id: string;
  parentId: string | null;
  name: string;
  kind: AssetKind;
  meta: AssetMeta;
}

export interface CharacterConfig {
  id: string;
  name: string;
  description: string;
  role: string;
  appearance: Record<string, string>;
  props: string[];
}

export interface WorldRegionBounds {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
}

export interface WorldRegion {
  id: string;
  name: string;
  description: string;
  bounds: WorldRegionBounds;
  tags: string[];
}

export interface CameraConfig {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface StoryboardShot {
  id: string;
  name: string;
  description: string;
  sequence: number;
  durationSeconds: number;
  camera: CameraConfig;
}

export interface GenerationBrief {
  prompt: string;
  negativePrompt: string;
  style: string;
  targetEngine: string;
  aspectRatio: string;
  quality: 'draft' | 'standard' | 'high';
  createdAt: string;
}

@Schema({ collection: 'three_d_projects', timestamps: true, versionKey: false })
export class ThreeDProject {
  @Prop({ required: true, unique: true, index: true })
  id!: string;

  @Prop({ required: true, index: true, default: DEFAULT_OWNER_ID })
  ownerId!: string;

  @Prop({ required: true, maxlength: 200 })
  name!: string;

  @Prop({ default: '', maxlength: 1_000 })
  description!: string;

  @Prop({ type: String, required: true, enum: PROJECT_TEMPLATES, default: 'blank', index: true })
  template!: ProjectTemplate;

  @Prop({ type: [String], default: () => [], index: true })
  tags!: string[];

  @Prop({ default: false, index: true })
  favorite!: boolean;

  @Prop({ default: false, index: true })
  archived!: boolean;

  /** 资产树（扁平存储，parentId 关联，服务层组装树并校验循环） */
  @Prop({ type: [Object], default: () => [] })
  assets!: AssetNodeData[];

  @Prop({ type: [Object], default: () => [] })
  characters!: CharacterConfig[];

  @Prop({ type: [Object], default: () => [] })
  worldRegions!: WorldRegion[];

  @Prop({ type: [Object], default: () => [] })
  storyboards!: StoryboardShot[];

  @Prop({ type: Object, default: null })
  brief!: GenerationBrief | null;

  /** schema timestamps:true 自动维护（仅类型声明，不参与 schema 定义） */
  createdAt!: Date;
  updatedAt!: Date;
}

export type ThreeDProjectDocument = HydratedDocument<ThreeDProject>;

export const ThreeDProjectSchema = SchemaFactory.createForClass(ThreeDProject);

export const threeDIndexes = (): void => {
  const schema = ThreeDProjectSchema;
  void schema.index({ ownerId: 1, archived: 1, updatedAt: -1 });
  void schema.index({ ownerId: 1, favorite: 1, updatedAt: -1 });
  void schema.index({ ownerId: 1, template: 1 });
};

export function newProjectId(): string {
  return newId('d3p');
}

export function newAssetId(): string {
  return newId('ast');
}

export function newCharacterId(): string {
  return newId('chr');
}

export function newRegionId(): string {
  return newId('reg');
}

export function newShotId(): string {
  return newId('shot');
}
