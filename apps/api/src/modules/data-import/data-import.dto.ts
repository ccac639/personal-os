import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  PROGRESS_MODES,
  PROJECT_STATUSES,
  type ProgressMode,
  type ProjectStatus,
} from '../projects/projects.schema.js';
import {
  MILESTONE_STATUSES,
  RELEASE_STATUSES,
  type MilestoneStatus,
  type ReleaseStatus,
} from '../releases/releases.schema.js';
import { SubtaskDto } from '../tasks/dto/create-task.dto.js';
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks/tasks.schema.js';
import {
  ISSUE_STATUSES,
  KNOWLEDGE_TYPES,
  type IssueStatus,
  type KnowledgeType,
} from '../knowledge/knowledge.schema.js';
import { DATE_PATTERN } from '../focus/dto/create-session.dto.js';

/** 当前支持的导入格式版本（localStorage 导出快照必须匹配，否则拒绝导入） */
export const IMPORT_VERSION = 1 as const;

/** 各集合导入数量上限（超出整体拒绝，避免一次导入拖垮单机 Mongo） */
export const IMPORT_LIMITS = {
  projects: 500,
  tasks: 5000,
  milestones: 1000,
  releases: 1000,
  knowledge: 5000,
  plans: 2000,
  sessions: 10000,
  weeklyGoals: 1000,
} as const;

export type ImportSectionCounts = {
  projects: number;
  tasks: number;
  milestones: number;
  releases: number;
  knowledge: number;
  plans: number;
  sessions: number;
  weeklyGoals: number;
};

export interface ImportResult {
  imported: ImportSectionCounts;
  total: number;
}

// ---------- 实体条目（字段与对应创建 DTO 对齐；id 必填以便幂等 upsert） ----------

export class ImportProjectDto {
  @ApiProperty({ description: '项目 ID（保持原 ID 以便幂等恢复）' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '项目名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '项目描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: PROJECT_STATUSES, default: 'planning' })
  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  status?: ProjectStatus;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @ApiPropertyOptional({ description: '是否已归档（软删除）', default: false })
  @IsOptional()
  @IsBoolean()
  archived?: boolean;

  @ApiPropertyOptional({ enum: PROGRESS_MODES, default: 'manual' })
  @IsOptional()
  @IsEnum(PROGRESS_MODES)
  progressMode?: ProgressMode;

  @ApiPropertyOptional({ description: '进度百分比 0-100', minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progress?: number;

  @ApiPropertyOptional({ description: '目标日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  techStack?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  // 兼容既有导出数据：接受但不写入（时间由 Mongo timestamps 维护）
  @ApiPropertyOptional({ description: '创建时间（导入时忽略，由系统维护）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略，由系统维护）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportTaskDto {
  @ApiProperty({ description: '任务 ID（保持原 ID 以便幂等恢复）' })
  @IsMongoId()
  id!: string;

  @ApiPropertyOptional({ description: '所属项目 ID；null 表示收件箱任务', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string | null;

  @ApiProperty({ description: '任务标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ description: '任务描述' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  description?: string;

  @ApiPropertyOptional({ enum: TASK_STATUSES, default: 'todo' })
  @IsOptional()
  @IsEnum(TASK_STATUSES)
  status?: TaskStatus;

  @ApiPropertyOptional({ enum: TASK_PRIORITIES, default: 'medium' })
  @IsOptional()
  @IsEnum(TASK_PRIORITIES)
  priority?: TaskPriority;

  @ApiPropertyOptional({ type: [String], description: '标签' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];

  @ApiPropertyOptional({ description: '截止日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ description: '预估耗时（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  estimatedMinutes?: number;

  @ApiPropertyOptional({ description: '实际耗时（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  actualMinutes?: number;

  @ApiPropertyOptional({ description: '完成定义（DoD）' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  dod?: string;

  @ApiPropertyOptional({ description: '是否被阻塞', default: false })
  @IsOptional()
  @IsBoolean()
  blocked?: boolean;

  @ApiPropertyOptional({ description: '阻塞原因' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  blockedReason?: string;

  @ApiPropertyOptional({ type: [SubtaskDto], description: '子任务' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SubtaskDto)
  subtasks?: SubtaskDto[];

  @ApiPropertyOptional({
    type: [String],
    description: '依赖任务 ID（仅允许同域：同项目或同为收件箱；禁止自依赖/重复/循环）',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique({ message: '依赖列表不能包含重复任务' })
  @IsMongoId({ each: true })
  dependencies?: string[];

  @ApiPropertyOptional({ description: '手动排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportMilestoneDto {
  @ApiProperty({ description: '里程碑 ID' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '里程碑名称', minLength: 1, maxLength: 200 })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ description: '所属项目 ID；null 表示不关联项目', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string | null;

  @ApiPropertyOptional({ description: '描述' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: '目标日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  targetDate?: string;

  @ApiPropertyOptional({ enum: MILESTONE_STATUSES, default: 'planned' })
  @IsOptional()
  @IsEnum(MILESTONE_STATUSES)
  status?: MilestoneStatus;

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique({ message: 'taskIds 不能包含重复任务' })
  @IsMongoId({ each: true })
  taskIds?: string[];

  @ApiPropertyOptional({ description: '手动排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportChecklistItemDto {
  @ApiProperty({ description: '检查项标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ImportReleaseDto {
  @ApiProperty({ description: '发布 ID' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '版本号（唯一）', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  version!: string;

  @ApiProperty({ description: '发布摘要', minLength: 1, maxLength: 2000 })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  summary!: string;

  @ApiPropertyOptional({ enum: RELEASE_STATUSES, default: 'planned' })
  @IsOptional()
  @IsEnum(RELEASE_STATUSES)
  status?: ReleaseStatus;

  @ApiPropertyOptional({ description: '所属项目 ID；null 表示不关联项目', nullable: true })
  @IsOptional()
  @IsMongoId()
  projectId?: string | null;

  @ApiPropertyOptional({ type: [ImportChecklistItemDto], description: '发布检查单' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportChecklistItemDto)
  checklist?: ImportChecklistItemDto[];

  @ApiPropertyOptional({ type: [String], description: '关联任务 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique({ message: 'taskIds 不能包含重复任务' })
  @IsMongoId({ each: true })
  taskIds?: string[];

  @ApiPropertyOptional({ type: [String], description: '关联里程碑 ID 列表' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ArrayUnique({ message: 'milestoneIds 不能包含重复里程碑' })
  @IsMongoId({ each: true })
  milestoneIds?: string[];

  @ApiPropertyOptional({ description: '计划发布日期（ISO 日期）' })
  @IsOptional()
  @IsDateString()
  releaseDate?: string;

  @ApiPropertyOptional({ description: '实际发布时间（ISO 时间）' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ description: '补充说明' })
  @IsOptional()
  @IsString()
  @MaxLength(10000)
  notes?: string;

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportKnowledgeDto {
  @ApiProperty({ description: '知识条目 ID' })
  @IsMongoId()
  id!: string;

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
  projectId?: string | null;

  @ApiPropertyOptional({ description: '关联任务 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string | null;

  @ApiPropertyOptional({ description: '关联里程碑 ID', nullable: true })
  @IsOptional()
  @IsMongoId()
  milestoneId?: string | null;

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

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportFocusItemDto {
  @ApiPropertyOptional({ description: '关联任务 ID；null 表示自由条目', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string | null;

  @ApiProperty({ description: '条目标题', minLength: 1, maxLength: 300 })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title!: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  done?: boolean;

  @ApiPropertyOptional({ description: '目标值（周目标条目用）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  target?: number;

  @ApiPropertyOptional({ description: '排序权重', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(-1000000)
  @Max(1000000)
  sortOrder?: number;
}

export class ImportFocusPlanDto {
  @ApiProperty({ description: '计划 ID' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  date!: string;

  @ApiPropertyOptional({ description: '当日备注' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  note?: string;

  @ApiPropertyOptional({ type: [ImportFocusItemDto], description: '计划条目' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportFocusItemDto)
  items?: ImportFocusItemDto[];

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportFocusSessionDto {
  @ApiProperty({ description: '专注记录 ID' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '日期（YYYY-MM-DD）' })
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  date!: string;

  @ApiProperty({ description: '开始时间（ISO 时间）' })
  @IsDateString()
  startedAt!: string;

  @ApiPropertyOptional({ description: '结束时间（ISO 时间）' })
  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @ApiPropertyOptional({ description: '专注时长（分钟）', minimum: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(24 * 60)
  durationMinutes?: number;

  @ApiPropertyOptional({ description: '关联任务 ID；null 表示不关联', nullable: true })
  @IsOptional()
  @IsMongoId()
  taskId?: string | null;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportWeeklyGoalDto {
  @ApiProperty({ description: '周目标 ID' })
  @IsMongoId()
  id!: string;

  @ApiProperty({ description: '周起始日（YYYY-MM-DD，周一）' })
  @Matches(DATE_PATTERN, { message: '日期格式必须为 YYYY-MM-DD' })
  weekStart!: string;

  @ApiPropertyOptional({ description: '周复盘' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  review?: string;

  @ApiPropertyOptional({ type: [ImportFocusItemDto], description: '目标条目' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ImportFocusItemDto)
  items?: ImportFocusItemDto[];

  @ApiPropertyOptional({ description: '创建时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  createdAt?: string;

  @ApiPropertyOptional({ description: '更新时间（导入时忽略）' })
  @IsOptional()
  @IsDateString()
  updatedAt?: string;
}

export class ImportFocusDto {
  @ApiPropertyOptional({ type: [ImportFocusPlanDto], description: '今日计划' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.plans)
  @ValidateNested({ each: true })
  @Type(() => ImportFocusPlanDto)
  plans?: ImportFocusPlanDto[];

  @ApiPropertyOptional({ type: [ImportFocusSessionDto], description: '专注记录' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.sessions)
  @ValidateNested({ each: true })
  @Type(() => ImportFocusSessionDto)
  sessions?: ImportFocusSessionDto[];

  @ApiPropertyOptional({ type: [ImportWeeklyGoalDto], description: '周目标' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.weeklyGoals)
  @ValidateNested({ each: true })
  @Type(() => ImportWeeklyGoalDto)
  weeklyGoals?: ImportWeeklyGoalDto[];
}

export class ImportDataDto {
  @ApiProperty({ description: '导出格式版本', enum: [IMPORT_VERSION] })
  @IsInt()
  @IsIn([IMPORT_VERSION], { message: `不支持的导入版本，当前仅支持 v${IMPORT_VERSION}` })
  version!: number;

  @ApiPropertyOptional({ type: [ImportProjectDto], description: '项目' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.projects)
  @ValidateNested({ each: true })
  @Type(() => ImportProjectDto)
  projects?: ImportProjectDto[];

  @ApiPropertyOptional({ type: [ImportTaskDto], description: '任务' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.tasks)
  @ValidateNested({ each: true })
  @Type(() => ImportTaskDto)
  tasks?: ImportTaskDto[];

  @ApiPropertyOptional({ type: [ImportMilestoneDto], description: '里程碑' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.milestones)
  @ValidateNested({ each: true })
  @Type(() => ImportMilestoneDto)
  milestones?: ImportMilestoneDto[];

  @ApiPropertyOptional({ type: [ImportReleaseDto], description: '发布记录' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.releases)
  @ValidateNested({ each: true })
  @Type(() => ImportReleaseDto)
  releases?: ImportReleaseDto[];

  @ApiPropertyOptional({ type: [ImportKnowledgeDto], description: '知识条目' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(IMPORT_LIMITS.knowledge)
  @ValidateNested({ each: true })
  @Type(() => ImportKnowledgeDto)
  knowledge?: ImportKnowledgeDto[];

  @ApiPropertyOptional({ type: ImportFocusDto, description: '执行数据（计划/专注记录/周目标）' })
  @IsOptional()
  @ValidateNested()
  @Type(() => ImportFocusDto)
  focus?: ImportFocusDto;
}
