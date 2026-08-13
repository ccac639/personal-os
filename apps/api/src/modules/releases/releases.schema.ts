import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';

export const ReleaseName = 'Release';
export const MilestoneName = 'Milestone';

export type ReleaseStatus = 'planned' | 'in-progress' | 'ready' | 'published' | 'cancelled';
export type MilestoneStatus = 'planned' | 'in-progress' | 'completed' | 'cancelled';

export const RELEASE_STATUSES: ReleaseStatus[] = [
  'planned',
  'in-progress',
  'ready',
  'published',
  'cancelled',
];
export const MILESTONE_STATUSES: MilestoneStatus[] = [
  'planned',
  'in-progress',
  'completed',
  'cancelled',
];

const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>): void => {
    ret.id = String(ret._id);
    delete ret._id;
  },
};

/** 发布检查项 */
@Schema({ _id: false })
export class ChecklistItem {
  @ApiProperty({ description: '检查项标题' })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiProperty({ description: '是否完成', default: false })
  @Prop({ default: false })
  done!: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @Prop({ default: '' })
  notes?: string;
}

/** 发布记录（发布检查单 + 关联任务/里程碑；不调用部署服务，published 仅为状态标记） */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class ReleaseDoc {
  @ApiProperty({ description: '发布 ID' })
  id!: string;

  @ApiProperty({ description: '版本号（唯一）' })
  @Prop({ required: true, trim: true, unique: true, maxlength: 100 })
  version!: string;

  @ApiProperty({ description: '发布摘要' })
  @Prop({ required: true, trim: true, maxlength: 2000 })
  summary!: string;

  @ApiProperty({ enum: RELEASE_STATUSES, description: '发布状态', default: 'planned' })
  @Prop({ type: String, enum: RELEASE_STATUSES, default: 'planned' })
  status!: ReleaseStatus;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @ApiProperty({ type: [ChecklistItem], description: '发布检查单' })
  @Prop({ type: [ChecklistItem], default: [] })
  checklist!: ChecklistItem[];

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @Prop({ type: [Types.ObjectId], ref: 'Task', default: [] })
  taskIds!: Types.ObjectId[];

  @ApiPropertyOptional({ type: [String], description: '关联里程碑 ID 列表' })
  @Prop({ type: [Types.ObjectId], ref: 'Milestone', default: [] })
  milestoneIds!: Types.ObjectId[];

  @ApiPropertyOptional({ description: '计划发布日期' })
  @Prop({ type: Date })
  releaseDate?: Date;

  @ApiPropertyOptional({ description: '实际发布时间' })
  @Prop({ type: Date })
  publishedAt?: Date;

  @ApiPropertyOptional({ description: '补充说明' })
  @Prop({ default: '' })
  notes!: string;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

/** 里程碑 */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class MilestoneDoc {
  @ApiProperty({ description: '里程碑 ID' })
  id!: string;

  @ApiProperty({ description: '里程碑名称' })
  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @ApiPropertyOptional({ description: '所属项目 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @ApiPropertyOptional({ description: '描述' })
  @Prop({ default: '' })
  description!: string;

  @ApiPropertyOptional({ description: '目标日期' })
  @Prop({ type: Date })
  targetDate?: Date;

  @ApiProperty({ enum: MILESTONE_STATUSES, description: '状态', default: 'planned' })
  @Prop({ type: String, enum: MILESTONE_STATUSES, default: 'planned' })
  status!: MilestoneStatus;

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @Prop({ type: [Types.ObjectId], ref: 'Task', default: [] })
  taskIds!: Types.ObjectId[];

  @ApiPropertyOptional({ description: '手动排序权重', default: 0 })
  @Prop({ default: 0 })
  sortOrder!: number;

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export type ReleaseDocument = HydratedDocument<ReleaseDoc>;
export type MilestoneDocument = HydratedDocument<MilestoneDoc>;

export const ReleaseSchema = SchemaFactory.createForClass(ReleaseDoc);
export const MilestoneSchema = SchemaFactory.createForClass(MilestoneDoc);

ReleaseSchema.index({ version: 1 });
ReleaseSchema.index({ status: 1 });
ReleaseSchema.index({ projectId: 1 });
ReleaseSchema.index({ releaseDate: 1 });
ReleaseSchema.index({ updatedAt: -1 });
MilestoneSchema.index({ projectId: 1 });
MilestoneSchema.index({ status: 1 });
MilestoneSchema.index({ targetDate: 1 });
MilestoneSchema.index({ sortOrder: 1 });
