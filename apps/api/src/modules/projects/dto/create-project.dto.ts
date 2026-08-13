import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import {
  PROGRESS_MODES,
  PROJECT_STATUSES,
  type ProgressMode,
  type ProjectStatus,
} from '../projects.schema.js';

export class CreateProjectDto {
  @ApiProperty({ description: '项目名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '项目描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES, description: '项目状态', default: 'planning' })
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: '是否收藏', default: false })
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ enum: PROGRESS_MODES, description: '进度模式', default: 'manual' })
  @IsOptional()
  @IsEnum(PROGRESS_MODES)
  progressMode?: ProgressMode;

  @ApiPropertyOptional({ description: '进度百分比 0-100（手动模式）', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: '目标日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ type: [String], description: '技术栈' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  techStack?: string[];

  @ApiPropertyOptional({ type: [String], description: '标签' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];
}
