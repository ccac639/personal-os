import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, Matches } from 'class-validator';

import { DATE_PATTERN } from './create-session.dto.js';

export class QueryFocusDto {
  @ApiPropertyOptional({ description: '单日（YYYY-MM-DD）' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({ description: '范围起（YYYY-MM-DD）' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  from?: string;

  @ApiPropertyOptional({ description: '范围止（YYYY-MM-DD）' })
  @IsOptional()
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  to?: string;

  @ApiPropertyOptional({ description: '关联任务 ID 筛选（专注记录）' })
  @IsOptional()
  @IsMongoId()
  taskId?: string;
}

// re-export 便于复用
export { DATE_PATTERN };
