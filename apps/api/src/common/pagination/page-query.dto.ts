import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { DEFAULT_PAGE_SIZE, MAX_PAGE, MAX_PAGE_SIZE } from './pagination.js';

/**
 * 分页查询 DTO：业务 Controller 通过 `@Query() query: PageQueryDto` 使用。
 * 严格校验：非法值直接 400 VALIDATION_ERROR（由全局 ValidationPipe 处理）。
 */
export class PageQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  @Max(MAX_PAGE, { message: `page 最大为 ${MAX_PAGE}` })
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(MAX_PAGE_SIZE, { message: `pageSize 最大为 ${MAX_PAGE_SIZE}` })
  pageSize: number = DEFAULT_PAGE_SIZE;

  @IsOptional()
  @IsString({ message: 'sortBy 必须是字符串' })
  @MaxLength(64, { message: 'sortBy 过长' })
  sortBy?: string;

  @IsOptional()
  @IsIn(['asc', 'desc'], { message: 'sortOrder 仅支持 asc / desc' })
  sortOrder: 'asc' | 'desc' = 'desc';
}
