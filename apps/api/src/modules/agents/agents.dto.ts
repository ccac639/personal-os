import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

import { AGENT_PROVIDERS, type AgentProviderName } from '../chat/chat.constants.js';
import { AGENT_KINDS } from './agent.schema.js';
import type { AgentKind } from './agent.schema.js';
import { PaginationQueryDto } from '../chat/chat.pagination.js';

export class CreateAgentDto {
  @ApiProperty({ description: '智能体名称', maxLength: 100 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ description: '描述', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ description: '模型名', default: 'gpt-4o-mini' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ description: '模型提供方', enum: AGENT_PROVIDERS, default: 'openai' })
  @IsOptional()
  @IsIn(AGENT_PROVIDERS)
  provider?: AgentProviderName;

  @ApiPropertyOptional({ description: '系统提示词', maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  systemPrompt?: string;

  @ApiPropertyOptional({ description: '是否收藏' })
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;
}

export class UpdateAgentDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  model?: string;

  @ApiPropertyOptional({ enum: AGENT_PROVIDERS })
  @IsOptional()
  @IsIn(AGENT_PROVIDERS)
  provider?: AgentProviderName;

  @ApiPropertyOptional({ maxLength: 4_000 })
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  systemPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hidden?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class AgentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '类型：builtin 内置模板 / personal 个人变体 / 不传查全部' })
  @IsOptional()
  @IsIn(AGENT_KINDS)
  kind?: AgentKind;

  @ApiPropertyOptional({ description: '是否包含隐藏项（默认排除隐藏的 personal）' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeHidden?: boolean;

  @ApiPropertyOptional({ description: '仅查收藏' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: '关键字（名称/描述/提示词模糊匹配）' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class AgentResponseDto {
  @ApiProperty({ example: 'agt_xxx' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description?: string;

  @ApiProperty()
  model!: string;

  @ApiProperty({ enum: AGENT_PROVIDERS })
  provider!: AgentProviderName;

  @ApiPropertyOptional()
  systemPrompt?: string;

  @ApiProperty({ enum: AGENT_KINDS })
  kind!: AgentKind;

  @ApiPropertyOptional()
  builtinKey?: string | null;

  @ApiProperty()
  favorite!: boolean;

  @ApiProperty()
  hidden!: boolean;

  @ApiProperty()
  enabled!: boolean;

  @ApiProperty()
  usageCount!: number;

  @ApiPropertyOptional({ type: String, format: 'date-time' })
  lastUsedAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

/** 启动智能体会话的响应 */
export class AgentStartResultDto {
  @ApiProperty({ type: AgentResponseDto })
  agent!: AgentResponseDto;

  @ApiProperty({ description: '新创建的会话 id' })
  conversationId!: string;
}
