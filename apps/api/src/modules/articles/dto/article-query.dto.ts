import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

import { MAX_PAGE_SIZE } from '../../../common/pagination/pagination.js';
/**
 * articles 列表查询 DTO：
 * - 分页参数与平台 PageQueryDto 语义一致（page/pageSize/sortBy/sortOrder）；
 * - 不额外透传筛选字段（articles 为只读镜像，筛选由前端对列表结果处理）。
 */
export class ArticleListQueryDto {
  @ApiPropertyOptional({ description: '页码（从 1 开始）', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page: number = 1;

  @ApiPropertyOptional({ description: '每页数量', default: 20, maximum: MAX_PAGE_SIZE })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize 最大为 ${MAX_PAGE_SIZE}` })
  pageSize: number = 20;

  @ApiPropertyOptional({ description: '排序字段', default: 'date', enum: ['date', 'slug'] })
  @IsOptional()
  @IsIn(['date', 'slug'], { message: 'sortBy 仅支持 date / slug' })
  sortBy: 'date' | 'slug' = 'date';

  @ApiPropertyOptional({ description: '排序方向', default: 'desc', enum: ['asc', 'desc'] })
  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder 仅支持 asc / desc' })
  sortOrder: 'asc' | 'desc' = 'desc';
}
