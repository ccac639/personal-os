import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

import { GENERATION_LIMITS } from '../chat.constants.js';

export class GenerateMessageDto {
  @ApiProperty({ description: '待生成回复的模型', example: 'openai' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  provider!: string;

  @ApiProperty({ description: '模型名', example: 'gpt-4o-mini' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @ApiPropertyOptional({
    description: `生成输出上限（字符，硬上限 ${GENERATION_LIMITS.MAX_OUTPUT_CHARS}）`,
    default: GENERATION_LIMITS.DEFAULT_MAX_TOKENS,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(GENERATION_LIMITS.MAX_OUTPUT_CHARS)
  maxTokens?: number;

  @ApiPropertyOptional({ description: '采样温度', default: 0.7 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({ description: 'true 时等待入队完成后立即返回 run 信息（默认）' })
  @IsOptional()
  @IsBoolean()
  sync?: boolean;
}

export class RunResponseDto {
  @ApiProperty({ example: 'run_xxx' })
  id!: string;

  @ApiProperty({ example: 'conv_xxx' })
  conversationId!: string;

  @ApiProperty({ example: 'msg_xxx' })
  messageId!: string;

  @ApiProperty({ enum: ['queued', 'running', 'cancelling', 'completed', 'failed', 'cancelled'] })
  state!: string;

  @ApiPropertyOptional({ description: '进度（0-100，mock 下由分段数估算）' })
  progress?: number | null;

  @ApiPropertyOptional({ type: Object, description: '运行元信息（含错误时先脱敏）' })
  meta?: Record<string, unknown>;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
