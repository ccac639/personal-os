import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import { PageQueryDto } from '../../_shared/pagination.js';
import { ToArrayQuery } from '../../_shared/transform.js';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks.schema.js';

export const TASK_SORT_FIELDS = [
  'sortOrder',
  'createdAt',
  'updatedAt',
  'dueDate',
  'priority',
  'status',
] as const;
export type TaskSortField = (typeof TASK_SORT_FIELDS)[number];

export class QueryTasksDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '所属项目 ID；传 inbox 查询收件箱任务；不传查全部' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  projectId?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES, description: '按状态筛选' })
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, description: '按优先级筛选' })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: [String], description: '按标签筛选（任务包含任一标签即命中）' })
  @IsOptional()
  @ToArrayQuery()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '关键词搜索（匹配标题/描述/标签）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ description: '截止日期起（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  dueFrom?: string;

  @ApiPropertyOptional({ description: '截止日期止（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  dueTo?: string;

  @ApiPropertyOptional({ enum: TASK_SORT_FIELDS, description: '排序字段', default: 'sortOrder' })
  @IsOptional()
  @IsIn(TASK_SORT_FIELDS)
  sortBy?: TaskSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: '排序方向', default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
