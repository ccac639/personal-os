import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { INSPIRATION_SOURCES } from './inspiration.schema.js';
import type { InspirationSource } from './inspiration.schema.js';
import { PaginationQueryDto } from '../chat/chat.pagination.js';

export class CreateInspirationDto {
  @ApiProperty({ description: '标题', maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ description: '内容（仅文本）', maxLength: 20_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content!: string;

  @ApiPropertyOptional({ description: '分类', default: '未分类', maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: '标签', type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '来源', enum: INSPIRATION_SOURCES, default: 'manual' })
  @IsOptional()
  @IsIn(INSPIRATION_SOURCES)
  source?: InspirationSource;
}

export class UpdateInspirationDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ maxLength: 20_000 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content?: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];
}

export class PatchInspirationStateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  archived?: boolean;
}

export class InspirationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '分类精确匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: '标签精确匹配' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  tag?: string;

  @ApiPropertyOptional({ enum: INSPIRATION_SOURCES })
  @IsOptional()
  @IsIn(INSPIRATION_SOURCES)
  source?: InspirationSource;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: '归档状态（默认 false，传 null 查全部）' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  archived?: boolean | null;

  @ApiPropertyOptional({ description: '关键字（标题/内容模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

/** 导入条目（与导出格式一致；id 可选，缺省生成新 id） */
export class InspirationImportItemDto {
  @ApiPropertyOptional({ example: 'ins_xxx' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @ApiProperty({ maxLength: 20_000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20_000)
  content!: string;

  @ApiPropertyOptional({ maxLength: 50 })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ type: [String], maxItems: 10 })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ enum: INSPIRATION_SOURCES })
  @IsOptional()
  @IsIn(INSPIRATION_SOURCES)
  source?: InspirationSource;

  @ApiPropertyOptional({ description: '原始创建时间（ISO，可选）' })
  @IsOptional()
  @IsString()
  createdAt?: string;
}

export const DUPLICATE_POLICIES = ['skip', 'overwrite', 'keep-both'] as const;
export type DuplicatePolicy = (typeof DUPLICATE_POLICIES)[number];

export class ImportInspirationsDto {
  @ApiProperty({ type: [InspirationImportItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspirationImportItemDto)
  items!: InspirationImportItemDto[];

  @ApiProperty({
    description: '重复策略：skip 跳过 / overwrite 覆盖 / keep-both 保留两者',
    enum: DUPLICATE_POLICIES,
    default: 'skip',
  })
  @IsIn(DUPLICATE_POLICIES)
  duplicatePolicy!: DuplicatePolicy;

  @ApiPropertyOptional({ description: 'dryRun 只校验不落库' })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}

export class ImportResultDto {
  @ApiProperty()
  imported!: number;

  @ApiProperty()
  overwritten!: number;

  @ApiProperty()
  skipped!: number;

  @ApiProperty()
  failed!: number;

  @ApiPropertyOptional({ description: '逐条校验错误', type: [Object] })
  errors?: Array<{ index: number; message: string }>;
}

export class InspirationResponseDto {
  @ApiProperty({ example: 'ins_xxx' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiProperty()
  content!: string;

  @ApiProperty()
  category!: string;

  @ApiProperty({ enum: INSPIRATION_SOURCES })
  source!: InspirationSource;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty()
  favorite!: boolean;

  @ApiProperty()
  pinned!: boolean;

  @ApiProperty()
  archived!: boolean;

  @ApiPropertyOptional()
  sourceMessageId?: string | null;

  @ApiPropertyOptional()
  sourceConversationId?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
