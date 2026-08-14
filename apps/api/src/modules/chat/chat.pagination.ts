import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** 通用分页查询参数（服务层统一做默认值与上限钳制） */
export class PaginationQueryDto {
  @ApiPropertyOptional({ description: '页码（从 1 开始）', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: '每页数量',
    default: PAGE_SIZE_DEFAULT,
    minimum: 1,
    maximum: PAGE_SIZE_MAX,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PAGE_SIZE_MAX)
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function normalizePage(value: number | undefined): number {
  return value && value > 0 ? Math.floor(value) : 1;
}

export function normalizePageSize(value: number | undefined): number {
  if (!value) return PAGE_SIZE_DEFAULT;
  return Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(value)));
}
