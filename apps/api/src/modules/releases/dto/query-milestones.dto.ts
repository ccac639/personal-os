import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsMongoId, IsOptional } from 'class-validator';

import { PageQueryDto } from '../../_shared/pagination.js';
import { MILESTONE_STATUSES, type MilestoneStatus } from '../releases.schema.js';

export const MILESTONE_SORT_FIELDS = [
  'sortOrder',
  'targetDate',
  'name',
  'createdAt',
  'updatedAt',
] as const;
export type MilestoneSortField = (typeof MILESTONE_SORT_FIELDS)[number];

export class QueryMilestonesDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '按项目筛选' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES, description: '按状态筛选' })
  @IsOptional()
  @IsEnum(MILESTONE_STATUSES)
  status?: MilestoneStatus;

  @ApiPropertyOptional({
    enum: MILESTONE_SORT_FIELDS,
    description: '排序字段',
    default: 'sortOrder',
  })
  @IsOptional()
  @IsIn(MILESTONE_SORT_FIELDS)
  sortBy?: MilestoneSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: '排序方向', default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
