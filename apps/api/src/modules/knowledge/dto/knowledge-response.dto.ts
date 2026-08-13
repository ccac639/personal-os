import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { ISSUE_STATUSES, KNOWLEDGE_TYPES } from '../knowledge.schema.js';

/** 知识条目响应（文档 toJSON 后形状，_id → id） */
export class KnowledgeDto {
  @ApiProperty({ description: '知识条目 ID' })
  id!: string;

  @ApiProperty({ enum: KNOWLEDGE_TYPES })
  type!: string;

  @ApiProperty({ description: '标题' })
  title!: string;

  @ApiProperty({ description: '正文（Markdown）' })
  content!: string;

  @ApiPropertyOptional({ description: '关联项目 ID', nullable: true })
  projectId?: string;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  taskId?: string;

  @ApiPropertyOptional({ description: '关联里程碑 ID', nullable: true })
  milestoneId?: string;

  @ApiPropertyOptional({ enum: ISSUE_STATUSES, description: '问题状态（仅 type=issue）' })
  issueStatus?: string;

  @ApiProperty({ type: [String], description: '标签' })
  tags!: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
