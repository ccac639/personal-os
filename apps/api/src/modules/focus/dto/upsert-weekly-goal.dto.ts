import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class GoalItemDto {
  @ApiPropertyOptional({ description: '关联任务 ID（可为空）', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @ApiProperty({ description: '目标标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: '是否完成', default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: '目标值（如次数/数量）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  target?: number;

  @ApiPropertyOptional({ description: '排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;
}

export class UpsertWeeklyGoalDto {
  @ApiPropertyOptional({ description: '周复盘' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  review?: string;

  @ApiPropertyOptional({ type: [GoalItemDto], description: '目标条目（整体替换）' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => GoalItemDto)
  items?: GoalItemDto[];
}
