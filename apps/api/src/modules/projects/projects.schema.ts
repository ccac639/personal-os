import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { HydratedDocument } from 'mongoose';

export const ProjectName = 'Project';

export type ProjectStatus = 'planning' | 'active' | 'paused' | 'completed';
export type ProgressMode = 'manual' | 'auto';

export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'paused', 'completed'];
export const PROGRESS_MODES: ProgressMode[] = ['manual', 'auto'];

const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>): void => {
    ret.id = String(ret._id);
    delete ret._id;
  },
};

@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class ProjectDoc {
  @ApiProperty({ description: '项目 ID' })
  id!: string;

  @ApiProperty({ description: '项目名称', maxLength: 200 })
  @Prop({ required: true, trim: true, maxlength: 200 })
  name!: string;

  @ApiProperty({ description: '项目描述', required: false })
  @Prop({ default: '' })
  description!: string;

  @ApiProperty({ enum: PROJECT_STATUSES, description: '项目状态', default: 'planning' })
  @Prop({ type: String, enum: PROJECT_STATUSES, default: 'planning' })
  status!: ProjectStatus;

  @ApiProperty({ description: '是否收藏', default: false })
  @Prop({ default: false })
  favorite!: boolean;

  @ApiProperty({ description: '是否已归档（软删除）', default: false })
  @Prop({ default: false })
  archived!: boolean;

  @ApiProperty({
    enum: PROGRESS_MODES,
    description: '进度模式：manual 手动 / auto 由任务完成率计算',
    default: 'manual',
  })
  @Prop({ type: String, enum: PROGRESS_MODES, default: 'manual' })
  progressMode!: ProgressMode;

  @ApiProperty({
    description: '进度百分比 0-100（progressMode=manual 时生效）',
    minimum: 0,
    maximum: 100,
    default: 0,
  })
  @Prop({ min: 0, max: 100, default: 0 })
  progress!: number;

  @ApiProperty({ description: '目标日期', required: false })
  @Prop({ type: Date })
  targetDate?: Date;

  @ApiProperty({ type: [String], description: '技术栈', default: [] })
  @Prop({ type: [String], default: [] })
  techStack!: string[];

  @ApiProperty({ type: [String], description: '标签', default: [] })
  @Prop({ type: [String], default: [] })
  tags!: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export type ProjectDocument = HydratedDocument<ProjectDoc>;

export const ProjectSchema = SchemaFactory.createForClass(ProjectDoc);
ProjectSchema.index({ status: 1 });
ProjectSchema.index({ favorite: 1 });
ProjectSchema.index({ archived: 1 });
ProjectSchema.index({ targetDate: 1 });
ProjectSchema.index({ updatedAt: -1 });
