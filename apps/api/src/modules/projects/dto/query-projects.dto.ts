import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../_shared/pagination.js';
import { ToBoolean } from '../../_shared/transform.js';
import { PROJECT_STATUSES, type ProjectStatus } from '../projects.schema.js';

export const PROJECT_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'targetDate',
  'progress',
] as const;
export type ProjectSortField = (typeof PROJECT_SORT_FIELDS)[number];

export class QueryProjectsDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '关键词搜索（匹配名称/描述/标签）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES, description: '按状态筛选' })
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ description: '按收藏筛选' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: '是否只显示已归档；默认 false（不含归档）' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ description: '是否同时包含已归档（传 true 时忽略 archived 参数）' })
  @IsOptional()
  @ToBoolean()
  @IsBoolean()
  includeArchived?: boolean;

  @ApiPropertyOptional({ enum: PROJECT_SORT_FIELDS, description: '排序字段', default: 'updatedAt' })
  @IsOptional()
  @IsIn(PROJECT_SORT_FIELDS)
  sortBy?: ProjectSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: '排序方向', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
