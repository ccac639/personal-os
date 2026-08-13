import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';

export const TaskName = 'Task';

export type TaskStatus = 'todo' | 'in-progress' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export const TASK_STATUSES: TaskStatus[] = ['todo', 'in-progress', 'done', 'cancelled'];
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

/** 项目永久删除时任务处置策略 */
export type TaskDisposalStrategy = 'cascade' | 'inbox';

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>): void => {
    ret.id = String(ret._id);
    delete ret._id;
  },
};

@Schema({ _id: false })
export class SubtaskItem {
  @ApiProperty({ description: '子任务标题' })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiProperty({ description: '是否完成', default: false })
  @Prop({ default: false })
  done!: boolean;
}

@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class TaskDoc {
  @ApiProperty({ description: '任务 ID' })
  id!: string;

  @ApiPropertyOptional({ description: '所属项目 ID；为空表示收件箱任务', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @ApiProperty({ description: '任务标题', maxLength: 300 })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @Prop({ default: '' })
  description!: string;

  @ApiProperty({ enum: TASK_STATUSES, description: '任务状态', default: 'todo' })
  @Prop({ type: String, enum: TASK_STATUSES, default: 'todo' })
  status!: TaskStatus;

  @ApiProperty({ enum: TASK_PRIORITIES, description: '优先级', default: 'medium' })
  @Prop({ type: String, enum: TASK_PRIORITIES, default: 'medium' })
  priority!: TaskPriority;

  @ApiPropertyOptional({ type: [String], description: '标签', default: [] })
  @Prop({ type: [String], default: [] })
  tags!: string[];

  @ApiPropertyOptional({ description: '截止日期' })
  @Prop({ type: Date })
  dueDate?: Date;

  @ApiPropertyOptional({ description: '预估耗时（分钟）', minimum: 0, default: 0 })
  @Prop({ min: 0, default: 0 })
  estimatedMinutes!: number;

  @ApiPropertyOptional({ description: '实际耗时（分钟）', minimum: 0, default: 0 })
  @Prop({ min: 0, default: 0 })
  actualMinutes!: number;

  @ApiPropertyOptional({ description: '完成定义（DoD）' })
  @Prop({ default: '' })
  dod?: string;

  @ApiPropertyOptional({ description: '是否被阻塞', default: false })
  @Prop({ default: false })
  blocked!: boolean;

  @ApiPropertyOptional({ description: '阻塞原因' })
  @Prop({ default: '' })
  blockedReason?: string;

  @ApiPropertyOptional({ type: [SubtaskItem], description: '子任务', default: [] })
  @Prop({ type: [SubtaskItem], default: [] })
  subtasks!: SubtaskItem[];

  @ApiPropertyOptional({ type: [String], description: '依赖的任务 ID 列表', default: [] })
  @Prop({ type: [Types.ObjectId], ref: 'Task', default: [] })
  dependencies!: Types.ObjectId[];

  @ApiPropertyOptional({ description: '手动排序权重（越小越靠前）', default: 0 })
  @Prop({ default: 0 })
  sortOrder!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export type TaskDocument = HydratedDocument<TaskDoc>;

export const TaskSchema = SchemaFactory.createForClass(TaskDoc);
TaskSchema.index({ projectId: 1 });
TaskSchema.index({ status: 1 });
TaskSchema.index({ priority: 1 });
TaskSchema.index({ dueDate: 1 });
TaskSchema.index({ tags: 1 });
TaskSchema.index({ sortOrder: 1 });
TaskSchema.index({ updatedAt: -1 });
