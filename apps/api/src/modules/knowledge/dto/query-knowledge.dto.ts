import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsIn, IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../_shared/pagination.js';
import { ToArrayQuery } from '../../_shared/transform.js';
import { KNOWLEDGE_TYPES, type KnowledgeType } from '../knowledge.schema.js';

export const KNOWLEDGE_SORT_FIELDS = ['createdAt', 'updatedAt', 'title', 'type'] as const;
export type KnowledgeSortField = (typeof KNOWLEDGE_SORT_FIELDS)[number];

export class QueryKnowledgeDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: KNOWLEDGE_TYPES, description: '按类型筛选' })
  @IsOptional()
  @IsEnum(KNOWLEDGE_TYPES)
  type?: KnowledgeType;

  @ApiPropertyOptional({ description: '按关联项目筛选' })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ description: '按关联任务筛选' })
  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @ApiPropertyOptional({ description: '按关联里程碑筛选' })
  @IsOptional()
  @IsMongoId()
  milestoneId?: string;

  @ApiPropertyOptional({ type: [String], description: '按标签筛选（任一命中）' })
  @IsOptional()
  @ToArrayQuery()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '关键词搜索（标题/正文/标签）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({
    enum: KNOWLEDGE_SORT_FIELDS,
    description: '排序字段',
    default: 'updatedAt',
  })
  @IsOptional()
  @IsIn(KNOWLEDGE_SORT_FIELDS)
  sortBy?: KnowledgeSortField;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], description: '排序方向', default: 'desc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
