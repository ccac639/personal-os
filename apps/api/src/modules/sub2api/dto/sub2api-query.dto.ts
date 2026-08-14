import { IsOptional, IsString, MaxLength } from 'class-validator';

import { PageQueryDto } from '../../../common/pagination/page-query.dto.js';

/**
 * Sub2API 列表查询 DTO：
 * - 分页参数复用平台 PageQueryDto（page 1..10000 / pageSize 1..100，非法即 400）；
 * - 额外透传上游支持的筛选字段（search / status / platform / model / 日期）。
 */
export class Sub2ApiListQueryDto extends PageQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(128, { message: 'search 过长' })
  search?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'status 过长' })
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'platform 过长' })
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256, { message: 'model 过长' })
  model?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: 'startDate 过长' })
  startDate?: string;

  /** YYYY-MM-DD */
  @IsOptional()
  @IsString()
  @MaxLength(16, { message: 'endDate 过长' })
  endDate?: string;
}
