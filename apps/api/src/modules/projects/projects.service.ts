import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type Connection, type Model, type QueryFilter, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { buildPaginated, type PaginatedResult } from '../_shared/pagination.js';
import { regexQuery } from '../_shared/query-helpers.js';
import { type InitializableModel, withTransaction } from '../_shared/transaction.js';
import { FocusService } from '../focus/focus.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { ReleasesService } from '../releases/releases.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { type TaskDisposalStrategy } from '../tasks/tasks.schema.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { QueryProjectsDto } from './dto/query-projects.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import {
  ProjectName,
  type ProjectDoc,
  type ProjectDocument,
  type ProgressMode,
  type ProjectStatus,
} from './projects.schema.js';

export interface ProjectJson {
  id: string;
  name: string;
  description: string;
  status: ProjectStatus;
  favorite: boolean;
  archived: boolean;
  progressMode: ProgressMode;
  progress: number;
  targetDate?: string | null;
  techStack: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function toProjectJson(doc: ProjectDocument): ProjectJson {
  return doc.toJSON() as unknown as ProjectJson;
}

type ProjectFilter = QueryFilter<ProjectDoc>;

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(ProjectName) private readonly projectModel: Model<ProjectDoc>,
    @InjectModel('Task') private readonly taskModel: Model<unknown>,
    @InjectConnection() private readonly connection: Connection,
    private readonly tasksService: TasksService,
    private readonly releasesService: ReleasesService,
    private readonly knowledgeService: KnowledgeService,
    private readonly focusService: FocusService,
  ) {}

  async create(dto: CreateProjectDto): Promise<ProjectJson> {
    const doc = await mapMongo(() => this.projectModel.create(this.buildCreatePayload(dto)));
    return toProjectJson(doc as unknown as ProjectDocument);
  }

  async findAll(query: QueryProjectsDto): Promise<PaginatedResult<ProjectJson>> {
    const filter = this.buildFilter(query);
    const sortField = query.sortBy ?? 'updatedAt';
    const sortDir = query.sortOrder === 'asc' ? 1 : -1;
    const page = query.page;
    const pageSize = query.pageSize;

    const docs = await mapMongo(() =>
      this.projectModel
        .find(filter)
        .sort({ [sortField]: sortDir } as Record<string, 1 | -1>)
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
    );
    const total = await mapMongo(() => this.projectModel.countDocuments(filter).exec());

    const items = await this.withAutoProgress(docs as unknown as ProjectDocument[]);
    return buildPaginated(items, total as number, page, pageSize);
  }

  async findOne(id: string): Promise<ProjectJson> {
    const doc = await mapMongo(() => this.projectModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`项目不存在: ${id}`);
    const items = await this.withAutoProgress([doc as unknown as ProjectDocument]);
    return items[0]!;
  }

  async update(id: string, dto: UpdateProjectDto): Promise<ProjectJson> {
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return this.findOne(id);
    }
    const set: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      set[key] = key === 'targetDate' ? new Date(value as string) : value;
    }
    const doc = await mapMongo(() =>
      this.projectModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`项目不存在: ${id}`);
    const items = await this.withAutoProgress([doc as unknown as ProjectDocument]);
    return items[0]!;
  }

  /** 归档（软删除）：保留全部关联数据，仅从活跃列表隐藏 */
  async archive(id: string): Promise<ProjectJson> {
    return this.setArchived(id, true);
  }

  /** 恢复归档 */
  async restore(id: string): Promise<ProjectJson> {
    return this.setArchived(id, false);
  }

  /**
   * 删除策略：
   * - permanent=false（默认）：归档，数据保留；
   * - permanent=true：永久删除，级联处置关联数据（tasks 按 taskStrategy，
   *   knowledge 删除关联条目，milestones 删除并清理 release 引用，release 解除项目关联，
   *   focus 清空对已删任务的引用）。
   * 事务语义：Mongo 支持事务时整体原子执行；否则按「先清理关联、最后删主文档」的
   * 补偿顺序执行，任一步失败即抛错（不允许静默半完成），且操作幂等可重试。
   */
  async remove(
    id: string,
    options: { permanent?: boolean; taskStrategy?: TaskDisposalStrategy } = {},
  ): Promise<void> {
    const { permanent = false, taskStrategy = 'cascade' } = options;

    if (!permanent) {
      const doc = await mapMongo(() =>
        this.projectModel
          .findOneAndUpdate({ _id: id }, { $set: { archived: true } }, { new: true })
          .exec(),
      );
      if (!doc) throw new NotFoundException(`项目不存在: ${id}`);
      return;
    }

    const project = await mapMongo(() => this.projectModel.findById(id).exec());
    if (!project) throw new NotFoundException(`项目不存在: ${id}`);

    const models: InitializableModel[] = [
      this.projectModel,
      this.taskModel,
      this.releasesService.milestoneModel,
      this.releasesService.releaseModel,
      this.knowledgeService.knowledgeModel,
      this.focusService.planModel,
      this.focusService.sessionModel,
      this.focusService.weeklyGoalModel,
    ];
    await withTransaction(this.connection, models, async (session) => {
      const taskIds = await this.tasksService.disposeByProject(id, taskStrategy, session);
      const milestoneIds = await this.releasesService.unlinkProject(id, session);
      await this.knowledgeService.deleteByProjectRefs(id, taskIds, milestoneIds, session);
      if (taskStrategy === 'cascade') {
        await this.focusService.clearTaskRefs(taskIds, session);
      }
      await mapMongo(() =>
        this.projectModel
          .deleteOne({ _id: id })
          .session(session ?? null)
          .exec(),
      );
    });
  }

  /** progressMode=auto 时由任务完成率计算进度；manual 时使用手动值 */
  private async withAutoProgress(docs: ProjectDocument[]): Promise<ProjectJson[]> {
    const items = docs.map((doc) => toProjectJson(doc));
    const autoIds = docs.filter((doc) => doc.progressMode === 'auto').map((doc) => doc._id);
    if (autoIds.length === 0) return items;

    const tasks = await mapMongo(() =>
      (this.taskModel as Model<{ projectId: Types.ObjectId; status: string }>)
        .find({ projectId: { $in: autoIds } })
        .select('projectId status')
        .exec(),
    );
    const stats = new Map<string, { total: number; done: number }>();
    for (const task of tasks) {
      const key = String(task.projectId);
      const stat = stats.get(key) ?? { total: 0, done: 0 };
      stat.total += 1;
      if (task.status === 'done') stat.done += 1;
      stats.set(key, stat);
    }
    return items.map((item, index) => {
      const doc = docs[index];
      if (!doc || doc.progressMode !== 'auto') return item;
      const stat = stats.get(String(doc._id));
      const progress = !stat || stat.total === 0 ? 0 : Math.round((stat.done / stat.total) * 100);
      return { ...item, progress };
    });
  }

  private buildFilter(query: QueryProjectsDto): ProjectFilter {
    const filter: ProjectFilter = {};
    if (query.search) {
      const rx = regexQuery(query.search);
      filter.$or = [{ name: rx }, { description: rx }, { tags: rx }];
    }
    if (query.status) filter.status = query.status;
    if (query.favorite !== undefined) filter.favorite = query.favorite;
    if (!query.includeArchived) filter.archived = query.archived ?? false;
    return filter;
  }
  private buildCreatePayload(dto: CreateProjectDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: dto.name,
      description: dto.description ?? '',
      status: dto.status ?? 'planning',
      favorite: dto.favorite ?? false,
      archived: false,
      progressMode: dto.progressMode ?? 'manual',
      progress: dto.progress ?? 0,
      techStack: dto.techStack ?? [],
      tags: dto.tags ?? [],
    };
    if (dto.targetDate !== undefined) payload.targetDate = new Date(dto.targetDate);
    return payload;
  }

  private async setArchived(id: string, archived: boolean): Promise<ProjectJson> {
    const doc = await mapMongo(() =>
      this.projectModel.findOneAndUpdate({ _id: id }, { $set: { archived } }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`项目不存在: ${id}`);
    const items = await this.withAutoProgress([doc as unknown as ProjectDocument]);
    return items[0]!;
  }
}
