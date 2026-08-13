import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../_shared/pagination.js';
import { RELEASE_STATUSES, type ReleaseStatus } from '../releases.schema.js';

export const RELEASE_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'version',
  'status',
  'releaseDate',
] as const;
export type ReleaseSortField = (typeof RELEASE_SORT_FIELDS)[number];

export class QueryReleasesDto extends PageQueryDto {
  @ApiPropertyOptional({ description: '关键词搜索（版本/摘要/说明）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ enum: RELEASE_STATUSES, description: '按状态筛选' })
  @IsOptional()
  @IsEnum(RELEASE_STATUSES)
  status?: ReleaseStatus;

  @ApiPropertyOptional({ description: '按项目筛选' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ enum: RELEASE_SORT_FIELDS, description: '排序字段', default: 'createdAt' })
  @IsOptional()
  @IsIn(RELEASE_SORT_FIELDS)
  sortBy?: ReleaseSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: '排序方向', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
