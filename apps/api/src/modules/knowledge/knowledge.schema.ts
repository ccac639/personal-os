import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { HydratedDocument, Types } from 'mongoose';

export const KnowledgeName = 'Knowledge';

export type KnowledgeType = 'decision' | 'issue' | 'reference';
export type IssueStatus = 'open' | 'in-progress' | 'resolved' | 'wontfix';

export const KNOWLEDGE_TYPES: KnowledgeType[] = ['decision', 'issue', 'reference'];
export const ISSUE_STATUSES: IssueStatus[] = ['open', 'in-progress', 'resolved', 'wontfix'];

const jsonTransform = {
  virtuals: true,
  versionKey: false,
  transform: (_doc: unknown, ret: Record<string, unknown>): void => {
    ret.id = String(ret._id);
    delete ret._id;
  },
};

/** 项目知识条目（决策 / 问题 / 参考），可关联项目、任务、里程碑 */
@Schema({ timestamps: true, versionKey: false, toJSON: jsonTransform })
export class KnowledgeDoc {
  @ApiProperty({ description: '知识条目 ID' })
  id!: string;

  @ApiProperty({ enum: KNOWLEDGE_TYPES, description: '条目类型' })
  @Prop({ type: String, enum: KNOWLEDGE_TYPES, required: true })
  type!: KnowledgeType;

  @ApiProperty({ description: '标题' })
  @Prop({ required: true, trim: true, maxlength: 300 })
  title!: string;

  @ApiProperty({ description: '正文（Markdown）' })
  @Prop({ required: true, maxlength: 100000 })
  content!: string;

  @ApiPropertyOptional({ description: '关联项目 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Project', default: null })
  projectId?: Types.ObjectId | null;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Task', default: null })
  taskId?: Types.ObjectId | null;

  @ApiPropertyOptional({ description: '关联里程碑 ID', nullable: true })
  @Prop({ type: Types.ObjectId, ref: 'Milestone', default: null })
  milestoneId?: Types.ObjectId | null;

  @ApiPropertyOptional({
    enum: ISSUE_STATUSES,
    description: '问题状态（仅 type=issue）',
    nullable: true,
  })
  @Prop({ type: String, enum: ISSUE_STATUSES })
  issueStatus?: IssueStatus;

  @ApiPropertyOptional({ type: [String], description: '标签', default: [] })
  @Prop({ type: [String], default: [] })
  tags!: string[];

  @ApiProperty({ description: '创建时间' })
  createdAt!: Date;

  @ApiProperty({ description: '更新时间' })
  updatedAt!: Date;
}

export type KnowledgeDocument = HydratedDocument<KnowledgeDoc>;

export const KnowledgeSchema = SchemaFactory.createForClass(KnowledgeDoc);
KnowledgeSchema.index({ type: 1 });
KnowledgeSchema.index({ projectId: 1 });
KnowledgeSchema.index({ taskId: 1 });
KnowledgeSchema.index({ milestoneId: 1 });
KnowledgeSchema.index({ tags: 1 });
KnowledgeSchema.index({ updatedAt: -1 });
