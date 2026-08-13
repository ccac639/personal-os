import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RELEASE_STATUSES, MILESTONE_STATUSES } from '../releases.schema.js';

export class ChecklistItemResponseDto {
  @ApiProperty({ description: '检查项标题' })
  title!: string;

  @ApiProperty({ description: '是否完成' })
  done!: boolean;

  @ApiPropertyOptional({ description: '备注' })
  notes?: string;
}

export class ReleaseDto {
  @ApiProperty({ description: '发布 ID' })
  id!: string;

  @ApiProperty({ description: '版本号' })
  version!: string;

  @ApiProperty({ description: '发布摘要' })
  summary!: string;

  @ApiProperty({ enum: RELEASE_STATUSES })
  status!: string;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  projectId?: string;

  @ApiProperty({ type: [ChecklistItemResponseDto], description: '发布检查单' })
  checklist!: ChecklistItemResponseDto[];

  @ApiProperty({ type: [String], description: '关联任务 ID' })
  taskIds!: string[];

  @ApiProperty({ type: [String], description: '关联里程碑 ID' })
  milestoneIds!: string[];

  @ApiPropertyOptional({ description: '计划发布日期' })
  releaseDate?: string;

  @ApiPropertyOptional({ description: '实际发布时间' })
  publishedAt?: string;

  @ApiProperty({ description: '补充说明' })
  notes!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}

export class MilestoneDto {
  @ApiProperty({ description: '里程碑 ID' })
  id!: string;

  @ApiProperty({ description: '里程碑名称' })
  name!: string;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  projectId?: string;

  @ApiProperty({ description: '描述' })
  description!: string;

  @ApiPropertyOptional({ description: '目标日期' })
  targetDate?: string;

  @ApiProperty({ enum: MILESTONE_STATUSES })
  status!: string;

  @ApiProperty({ type: [String], description: '关联任务 ID' })
  taskIds!: string[];

  @ApiProperty({ description: '手动排序权重' })
  sortOrder!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
