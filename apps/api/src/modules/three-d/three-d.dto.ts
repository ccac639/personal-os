import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { ASSET_KINDS, PROJECT_TEMPLATES } from './three-d.schema.js';
import type { AssetKind, AssetMeta, ProjectTemplate } from './three-d.schema.js';
import { PaginationQueryDto } from '../chat/chat.pagination.js';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '描述', maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional({ description: '模板', enum: PROJECT_TEMPLATES, default: 'blank' })
  @IsOptional()
  @IsIn(PROJECT_TEMPLATES)
  template?: ProjectTemplate;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateProjectDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class ProjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字（名称/描述）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: '标签' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @ApiPropertyOptional({ enum: PROJECT_TEMPLATES })
  @IsOptional()
  @IsIn(PROJECT_TEMPLATES)
  template?: ProjectTemplate;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: '归档状态（默认 false，传 null 查全部）' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  archived?: boolean | null;
}

export class AssetMetaDto {
  @ApiPropertyOptional({
    description: '元数据：仅允许标量（string/number/boolean），禁止二进制/外链',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  meta?: AssetMeta;
}

export class CreateAssetDto extends AssetMetaDto {
  @ApiPropertyOptional({ description: '父节点 id（null 为根节点）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string | null;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ enum: ASSET_KINDS })
  @IsIn(ASSET_KINDS)
  kind!: AssetKind;
}

export class UpdateAssetDto extends AssetMetaDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name?: string;
}

export class MoveAssetDto {
  @ApiProperty({ description: '新父节点 id（null 移为根节点）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  parentId?: string | null;
}

export class CharacterDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional({ description: '角色定位', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  role?: string;

  @ApiPropertyOptional({ description: '外观配置（键值均为短文本）', type: Object })
  @IsOptional()
  @IsObject()
  appearance?: Record<string, string>;

  @ApiPropertyOptional({ description: '道具列表', type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  props?: string[];
}

export class RegionBoundsDto {
  @ApiProperty({ default: 0 })
  @IsNumber()
  x!: number;

  @ApiProperty({ default: 0 })
  @IsNumber()
  y!: number;

  @ApiProperty({ default: 0 })
  @IsNumber()
  z!: number;

  @ApiProperty({ default: 10 })
  @IsNumber()
  w!: number;

  @ApiProperty({ default: 10 })
  @IsNumber()
  h!: number;

  @ApiProperty({ default: 10 })
  @IsNumber()
  d!: number;
}

export class WorldRegionDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional({ type: RegionBoundsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RegionBoundsDto)
  bounds?: RegionBoundsDto;

  @ApiPropertyOptional({ type: [String], maxItems: 20 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class CameraDto {
  @ApiProperty({ type: [Number], example: [0, 1.6, 3.5] })
  @IsArray()
  @IsNumber({}, { each: true })
  position!: number[];

  @ApiProperty({ type: [Number], example: [0, 1, 0] })
  @IsArray()
  @IsNumber({}, { each: true })
  target!: number[];

  @ApiProperty({ default: 45, minimum: 10, maximum: 120 })
  @IsNumber()
  @Min(10)
  @Max(120)
  fov!: number;
}

export class StoryboardShotDto {
  @ApiProperty({ maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  description?: string;

  @ApiPropertyOptional({ description: '分镜序号（默认追加到末尾）' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  sequence?: number;

  @ApiPropertyOptional({ description: '时长（秒）', default: 5, minimum: 1, maximum: 600 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(600)
  durationSeconds?: number;

  @ApiPropertyOptional({ type: CameraDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CameraDto)
  camera?: CameraDto;
}

export class GenerationBriefDto {
  @ApiProperty({ description: '生成提示词（仅文本）', maxLength: 4_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4_000)
  prompt!: string;

  @ApiPropertyOptional({ description: '负面提示词', maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  negativePrompt?: string;

  @ApiPropertyOptional({ description: '风格', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  style?: string;

  @ApiPropertyOptional({ description: '目标引擎', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetEngine?: string;

  @ApiPropertyOptional({ description: '画幅', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  aspectRatio?: string;

  @ApiPropertyOptional({ enum: ['draft', 'standard', 'high'], default: 'standard' })
  @IsOptional()
  @IsIn(['draft', 'standard', 'high'])
  quality?: 'draft' | 'standard' | 'high';
}

export class ProjectResponseDto {
  @ApiProperty({ example: 'd3p_xxx' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty({ enum: PROJECT_TEMPLATES })
  template!: ProjectTemplate;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty()
  favorite!: boolean;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty({ description: '资产节点数' })
  assetCount!: number;

  @ApiProperty({ description: '角色数' })
  characterCount!: number;

  @ApiProperty({ description: '世界区域数' })
  regionCount!: number;

  @ApiProperty({ description: '分镜数' })
  shotCount!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
