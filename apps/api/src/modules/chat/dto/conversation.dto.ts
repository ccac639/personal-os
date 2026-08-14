import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { AGENT_PROVIDERS, CHAT_LIMITS, type AgentProviderName } from '../chat.constants.js';
import { PaginationQueryDto } from '../chat.pagination.js';

/** 会话模型设置（不含任何密钥字段） */
export class ModelSettingsDto {
  @ApiProperty({ description: '模型提供方', enum: AGENT_PROVIDERS, example: 'openai' })
  @IsIn(AGENT_PROVIDERS)
  provider!: AgentProviderName;

  @ApiProperty({ description: '模型名', example: 'gpt-4o-mini' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model!: string;

  @ApiPropertyOptional({ description: '采样温度', default: 0.7, minimum: 0, maximum: 2 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @ApiPropertyOptional({
    description: '最大输出 token 数',
    default: 500,
    minimum: 1,
    maximum: 4096,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(4096)
  maxTokens?: number;
}

export class CreateConversationDto {
  @ApiPropertyOptional({ description: '会话标题', maxLength: CHAT_LIMITS.TITLE_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_LIMITS.TITLE_MAX)
  title?: string;

  @ApiPropertyOptional({ description: '系统提示词', maxLength: CHAT_LIMITS.SYSTEM_PROMPT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_LIMITS.SYSTEM_PROMPT_MAX)
  systemPrompt?: string;

  @ApiPropertyOptional({ description: '模型设置（缺省使用默认值）', type: ModelSettingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ModelSettingsDto)
  modelSettings?: ModelSettingsDto;

  @ApiPropertyOptional({ description: '由智能体启动时传入的智能体 id', example: 'agt_xxx' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;
}

export class UpdateConversationDto {
  @ApiPropertyOptional({
    description: '标题（传 null 表示自动生成）',
    maxLength: CHAT_LIMITS.TITLE_MAX,
  })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_LIMITS.TITLE_MAX)
  title?: string | null;

  @ApiPropertyOptional({ description: '系统提示词', maxLength: CHAT_LIMITS.SYSTEM_PROMPT_MAX })
  @IsOptional()
  @IsString()
  @MaxLength(CHAT_LIMITS.SYSTEM_PROMPT_MAX)
  systemPrompt?: string;

  @ApiPropertyOptional({ type: ModelSettingsDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ModelSettingsDto)
  modelSettings?: ModelSettingsDto;
}

export class PatchConversationStateDto {
  @ApiPropertyOptional({ description: '固定（置顶）' })
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: '归档' })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ description: '收藏' })
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}

export class ConversationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '关键字（标题/系统提示词模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiPropertyOptional({ description: '是否只查固定会话' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: '是否只查收藏会话' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: '归档状态（默认 false，传 null 查全部）' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  archived?: boolean | null;

  @ApiPropertyOptional({ description: '按智能体过滤' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  agentId?: string;
}

export class ConversationResponseDto {
  @ApiProperty({ example: 'conv_xxx' })
  id!: string;

  @ApiProperty()
  title!: string;

  @ApiPropertyOptional()
  systemPrompt?: string;

  @ApiProperty({ type: ModelSettingsDto })
  modelSettings!: ModelSettingsDto;

  @ApiProperty()
  pinned!: boolean;

  @ApiProperty()
  archived!: boolean;

  @ApiProperty()
  favorite!: boolean;

  @ApiPropertyOptional()
  agentId?: string | null;

  @ApiProperty()
  messageCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  lastMessageAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}
