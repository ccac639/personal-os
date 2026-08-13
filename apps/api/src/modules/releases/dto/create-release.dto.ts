import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { RELEASE_STATUSES, type ReleaseStatus } from '../releases.schema.js';

export class ChecklistItemDto {
  @ApiProperty({ description: '检查项标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: '是否完成', default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreateReleaseDto {
  @ApiProperty({ description: '版本号（唯一）', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  version!: string;

  @ApiProperty({ description: '发布摘要', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional({ enum: RELEASE_STATUSES, description: '发布状态', default: 'planned' })
  @IsOptional()
  @IsEnum(RELEASE_STATUSES)
  status?: ReleaseStatus;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ type: [ChecklistItemDto], description: '发布检查单' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  checklist?: ChecklistItemDto[];

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  taskIds?: string[];

  @ApiPropertyOptional({ type: [String], description: '关联里程碑 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsMongoId({ each: true })
  milestoneIds?: string[];

  @ApiPropertyOptional({ description: '计划发布日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @ApiPropertyOptional({ description: '实际发布时间（ISO 时间）' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ description: '补充说明' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;
}
