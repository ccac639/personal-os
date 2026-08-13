import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

import { MILESTONE_STATUSES, type MilestoneStatus } from '../releases.schema.js';

export class CreateMilestoneDto {
  @ApiProperty({ description: '里程碑名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: '目标日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES, description: '状态', default: 'planned' })
  @IsOptional()
  @IsEnum(MILESTONE_STATUSES)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsMongoId({ each: true })
  taskIds?: string[];

  @ApiPropertyOptional({ description: '手动排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;
}
