import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class CreateSessionDto {
  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: '开始时间（ISO 时间）' })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 时间）' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ description: '专注时长（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
