import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { TASK_PRIORITIES, TASK_STATUSES } from '../tasks.schema.js';

export class SubtaskResponseDto {
  @ApiProperty({ description: '子任务标题' })
  title!: string;

  @ApiProperty({ description: '是否完成' })
  done!: boolean;
}

/** 任务响应（文档 toJSON 后形状，_id → id） */
export class TaskDto {
  @ApiProperty({ description: '任务 ID' })
  id!: string;

  @ApiPropertyOptional({ description: '所属项目 ID；null 表示收件箱任务', nullable: true })
  projectId?: string;

  @ApiProperty({ description: '任务标题' })
  title!: string;

  @ApiProperty({ description: '任务描述' })
  description!: string;

  @ApiProperty({ enum: TASK_STATUSES })
  status!: string;

  @ApiProperty({ enum: TASK_PRIORITIES })
  priority!: string;

  @ApiProperty({ type: [String], description: '标签' })
  tags!: string[];

  @ApiPropertyOptional({ description: '截止日期' })
  dueDate?: string;

  @ApiProperty({ description: '预估耗时（分钟）' })
  estimatedMinutes!: number;

  @ApiProperty({ description: '实际耗时（分钟）' })
  actualMinutes!: number;

  @ApiPropertyOptional({ description: '完成定义（DoD）' })
  dod?: string;

  @ApiProperty({ description: '是否被阻塞' })
  blocked!: boolean;

  @ApiPropertyOptional({ description: '阻塞原因' })
  blockedReason?: string;

  @ApiProperty({ type: [SubtaskResponseDto], description: '子任务' })
  subtasks!: SubtaskResponseDto[];

  @ApiProperty({ type: [String], description: '依赖的任务 ID' })
  dependencies!: string[];

  @ApiProperty({ description: '手动排序权重' })
  sortOrder!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: string;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: string;
}
