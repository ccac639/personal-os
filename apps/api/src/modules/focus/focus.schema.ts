import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';

export const FocusPlanName = 'FocusPlan';
export const FocusSessionName = 'FocusSession';
export const WeeklyGoalName = 'WeeklyGoal';

const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>): void => {
    ret.id = String(ret._id);
    delete ret._id;
  },
};

/** 今日计划条目（可关联任务，也可为自由条目） */
@Schema({ _id: false })
export class FocusPlanItem {
  @ApiPropertyOptional({ description: '关联任务 ID（可为空）', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId?: Types.ObjectId | null;

  @ApiProperty({ description: '条目标题' })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiProperty({ description: '是否完成', default: false })
  @Prop({ default: false })
  done!: boolean;

  @ApiPropertyOptional({ description: '排序权重', default: 0 })
  @Prop({ default: 0 })
  sortOrder!: number;
}

/** 今日计划（按日期唯一，PUT 整体维护） */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class FocusPlanDoc {
  @ApiProperty({ description: '计划 ID' })
  id!: string;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  @Prop({ required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  @ApiPropertyOptional({ description: '当日备注' })
  @Prop({ default: '' })
  note!: string;

  @ApiProperty({ type: [FocusPlanItem], description: '计划条目' })
  @Prop({ type: [FocusPlanItem], default: [] })
  items!: FocusPlanItem[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

/** 专注记录（不做真实定时器，由客户端上报） */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class FocusSessionDoc {
  @ApiProperty({ description: '专注记录 ID' })
  id!: string;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  @Prop({ required: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  date!: string;

  @ApiProperty({ description: '开始时间（ISO 时间）' })
  @Prop({ type: Date, required: true })
  startedAt!: Date;

  @ApiPropertyOptional({ description: '结束时间（ISO 时间）' })
  @Prop({ type: Date })
  endedAt?: Date;

  @ApiPropertyOptional({ description: '专注时长（分钟）', minimum: 0 })
  @Prop({ min: 0 })
  durationMinutes?: number;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId?: Types.ObjectId | null;

  @ApiPropertyOptional({ description: '备注' })
  @Prop({ default: '' })
  note!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

/** 周目标条目 */
@Schema({ _id: false })
export class WeeklyGoalItem {
  @ApiPropertyOptional({ description: '关联任务 ID（可为空）', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId?: Types.ObjectId | null;

  @ApiProperty({ description: '目标标题' })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiProperty({ description: '是否完成', default: false })
  @Prop({ default: false })
  done!: boolean;

  @ApiPropertyOptional({ description: '目标值（如次数/数量）' })
  @Prop({ min: 0 })
  target?: number;

  @ApiPropertyOptional({ description: '排序权重', default: 0 })
  @Prop({ default: 0 })
  sortOrder!: number;
}

/** 周目标（按周起始日唯一，周一为一周开始） */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class WeeklyGoalDoc {
  @ApiProperty({ description: '周目标 ID' })
  id!: string;

  @ApiProperty({ description: '周起始日（YYYY-MM-DD，周一）' })
  @Prop({ required: true, unique: true, match: /^\d{4}-\d{2}-\d{2}$/ })
  weekStart!: string;

  @ApiPropertyOptional({ description: '周复盘' })
  @Prop({ default: '' })
  review!: string;

  @ApiProperty({ type: [WeeklyGoalItem], description: '目标条目' })
  @Prop({ type: [WeeklyGoalItem], default: [] })
  items!: WeeklyGoalItem[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export type FocusPlanDocument = HydratedDocument<FocusPlanDoc>;
export type FocusSessionDocument = HydratedDocument<FocusSessionDoc>;
export type WeeklyGoalDocument = HydratedDocument<WeeklyGoalDoc>;

export const FocusPlanSchema = SchemaFactory.createForClass(FocusPlanDoc);
export const FocusSessionSchema = SchemaFactory.createForClass(FocusSessionDoc);
export const WeeklyGoalSchema = SchemaFactory.createForClass(WeeklyGoalDoc);

FocusPlanSchema.index({ date: 1 });
FocusSessionSchema.index({ date: 1 });
FocusSessionSchema.index({ startedAt: -1 });
WeeklyGoalSchema.index({ weekStart: 1 });
