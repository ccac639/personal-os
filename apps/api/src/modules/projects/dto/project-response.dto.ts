import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { PROGRESS_MODES, PROJECT_STATUSES } from '../projects.schema.js';

/** 项目响应（文档 toJSON 后形状，_id → id） */
export class ProjectDto {
  @ApiProperty({ description: '项目 ID' })
  id!: string;

  @ApiProperty({ description: '项目名称' })
  name!: string;

  @ApiProperty({ description: '项目描述' })
  description!: string;

  @ApiProperty({ enum: PROJECT_STATUSES })
  status!: string;

  @ApiProperty({ description: '是否收藏' })
  favorite!: boolean;

  @ApiProperty({ description: '是否已归档' })
  archived!: boolean;

  @ApiProperty({ enum: PROGRESS_MODES })
  progressMode!: string;

  @ApiProperty({ description: '进度 0-100（auto 模式为任务完成率）' })
  progress!: number;

  @ApiPropertyOptional({ description: '目标日期' })
  targetDate?: string;

  @ApiProperty({ type: [String], description: '技术栈' })
  techStack!: string[];

  @ApiProperty({ type: [String], description: '标签' })
  tags!: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
