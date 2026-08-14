import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { CHAT_LIMITS } from '../chat.constants.js';
import { PaginationQueryDto } from '../chat.pagination.js';
import { MESSAGE_ROLES } from '../schemas/message.schema.js';
import type { MessageQuote, MessageRole } from '../schemas/message.schema.js';

export const MESSAGE_ROLE_VALUES = [...MESSAGE_ROLES] as const;

export class QuotePayloadDto {
  @ApiPropertyOptional({ description: '被引用消息 id（外部引用可省略）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  messageId?: string | null;

  @ApiProperty({ description: '被引用消息角色', enum: MESSAGE_ROLES })
  @IsIn(MESSAGE_ROLES)
  role!: MessageRole;

  @ApiProperty({
    description: '引用摘录（仅文本）',
    maxLength: CHAT_LIMITS.QUOTE_EXCERPT_MAX,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_LIMITS.QUOTE_EXCERPT_MAX)
  excerpt!: string;
}

export class AppendMessageDto {
  @ApiProperty({ description: '消息角色', enum: MESSAGE_ROLES, example: 'user' })
  @IsIn(MESSAGE_ROLES)
  role!: MessageRole;

  @ApiProperty({
    description: `消息文本（长度限制 ${CHAT_LIMITS.MESSAGE_CONTENT_MAX}，不允许二进制/外链载荷）`,
    maxLength: CHAT_LIMITS.MESSAGE_CONTENT_MAX,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_LIMITS.MESSAGE_CONTENT_MAX)
  content!: string;

  @ApiPropertyOptional({ description: '引用的消息 id' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  replyTo?: string;

  @ApiPropertyOptional({
    description: '引用块（引用其他消息或外部文本，仅允许文本摘录）',
    type: Object,
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => QuotePayloadDto)
  quote?: QuotePayloadDto;
}

export class EditMessageDto {
  @ApiProperty({
    description: '替换后的消息文本（限制同上）',
    maxLength: CHAT_LIMITS.MESSAGE_CONTENT_MAX,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(CHAT_LIMITS.MESSAGE_CONTENT_MAX)
  content!: string;
}

export class MessageQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: '消息角色过滤', enum: MESSAGE_ROLES })
  @IsOptional()
  @IsIn(MESSAGE_ROLES)
  role?: MessageRole;

  @ApiPropertyOptional({ description: '只查带书签的消息' })
  @IsOptional()
  @Type(() => Boolean)
  bookmarked?: boolean;

  @ApiPropertyOptional({ description: '起始游标：仅返回 createdAt 严格晚于此 ISO 时间的消息' })
  @IsOptional()
  @IsString()
  before?: string;
}

export class AddBookmarkDto {
  @ApiPropertyOptional({ description: '书签标签', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @ApiPropertyOptional({ description: '书签备注（仅文本）', maxLength: 1_000 })
  @IsOptional()
  @IsString()
  @MaxLength(1_000)
  note?: string;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'msg_xxx' })
  id!: string;

  @ApiProperty({ example: 'conv_xxx' })
  conversationId!: string;

  @ApiProperty({ enum: MESSAGE_ROLES })
  role!: MessageRole;

  @ApiProperty()
  content!: string;

  @ApiProperty({ enum: ['pending', 'streaming', 'completed', 'failed', 'cancelled'] })
  status!: string;

  @ApiPropertyOptional({ description: '引用信息', type: Object })
  references?: { replyTo?: string | null; quote?: MessageQuote | null };

  @ApiPropertyOptional({ description: '生成信息（模型/分段数等）', type: Object })
  genInfo?: Record<string, unknown>;

  @ApiPropertyOptional({ type: [Object], description: '书签列表' })
  bookmarks?: Array<Record<string, unknown>>;

  @ApiPropertyOptional({ description: '最后编辑时间' })
  editedAt?: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: string;
}

/** 校验引用块合法性（service 层复用）：外部引用允许无 messageId，有 replyTo 时回填 */
export function validateQuotePayload(
  quote: QuotePayloadDto | undefined,
  replyTo: string | undefined,
): { messageId: string | null; role: MessageRole; excerpt: string } | null {
  if (!quote) return null;
  return {
    messageId: quote.messageId ?? replyTo ?? null,
    role: quote.role,
    excerpt: quote.excerpt,
  };
}
