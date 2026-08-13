import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  ISSUE_STATUSES,
  KNOWLEDGE_TYPES,
  type IssueStatus,
  type KnowledgeType,
} from '../knowledge.schema.js';

export class CreateKnowledgeDto {
  @ApiProperty({ enum: KNOWLEDGE_TYPES, description: '条目类型' })
  @IsEnum(KNOWLEDGE_TYPES)
  type!: KnowledgeType;

  @ApiProperty({ description: '标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiProperty({ description: '正文（Markdown）', minLength: 1, maxLength: 100000 })
  @IsString()
  @MinLength(1)
  @MaxLength(100000)
  content!: string;

  @ApiPropertyOptional({ description: '关联项目 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string;

  @ApiPropertyOptional({ description: '关联里程碑 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  milestoneId?: string;

  @ApiPropertyOptional({ enum: ISSUE_STATUSES, description: '问题状态（仅 type=issue）' })
  @IsOptional()
  @IsEnum(ISSUE_STATUSES)
  issueStatus?: IssueStatus;

  @ApiPropertyOptional({ type: [String], description: '标签' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];
}
