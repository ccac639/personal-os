import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks.schema.js';

export class SubtaskDto {
  @ApiProperty({ description: '子任务标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: '是否完成', default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class CreateTaskDto {
  @ApiPropertyOptional({ description: '所属项目 ID；不传则为收件箱任务', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiProperty({ description: '任务标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES, description: '任务状态', default: 'todo' })
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, description: '优先级', default: 'medium' })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: [String], description: '标签' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '截止日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '预估耗时（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: '实际耗时（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  @ApiPropertyOptional({ description: '完成定义（DoD）' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  dod?: string;

  @ApiPropertyOptional({ description: '是否被阻塞', default: false })
  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @ApiPropertyOptional({ description: '阻塞原因' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockedReason?: string;

  @ApiPropertyOptional({ type: [SubtaskDto], description: '子任务' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubtaskDto)
  subtasks?: SubtaskDto[];

  @ApiPropertyOptional({
    type: [String],
    description: '依赖的任务 ID 列表（禁止自依赖/重复/循环）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique({ message: '依赖列表不能包含重复任务' })
  @IsMongoId({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ description: '手动排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;
}
