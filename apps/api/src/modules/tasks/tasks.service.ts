import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { buildPaginated, type PaginatedResult } from '../_shared/pagination.js';
import { regexQuery } from '../_shared/query-helpers.js';
import { ProjectName, type ProjectDoc } from '../projects/projects.schema.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { QueryTasksDto, type TaskSortField } from './dto/query-tasks.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import {
  PRIORITY_ORDER,
  TaskName,
  type SubtaskItem,
  type TaskDisposalStrategy,
  type TaskDoc,
  type TaskDocument,
  type TaskPriority,
  type TaskStatus,
} from './tasks.schema.js';

export interface TaskJson {
  id: string;
  projectId?: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  tags: string[];
  dueDate?: string | null;
  estimatedMinutes: number;
  actualMinutes: number;
  dod?: string;
  blocked: boolean;
  blockedReason?: string;
  subtasks: SubtaskItem[];
  dependencies: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toTaskJson(doc: TaskDocument): TaskJson {
  return doc.toJSON() as unknown as TaskJson;
}

type TaskFilter = QueryFilter<TaskDoc>;

@Injectable()
export class TasksService {
  constructor(
    @InjectModel(TaskName) private readonly taskModel: Model<TaskDoc>,
    @InjectModel(ProjectName) private readonly projectModel: Model<ProjectDoc>,
  ) {}

  async create(dto: CreateTaskDto): Promise<TaskJson> {
    await this.assertProjectExists(dto.projectId);
    const dependencyIds = this.toObjectIds(dto.dependencies);
    await this.assertDependenciesValid(undefined, dependencyIds);

    const payload = this.buildPayload(dto);
    // projectId 可空：null 表示收件箱任务（schema default 也是 null，显式写出保证响应一致）
    payload.projectId = dto.projectId ? new Types.ObjectId(dto.projectId) : null;
    if (dependencyIds.length > 0) payload.dependencies = dependencyIds;

    const doc = await mapMongo(() => this.taskModel.create(payload));
    return toTaskJson(doc as unknown as TaskDocument);
  }

  async findAll(query: QueryTasksDto): Promise<PaginatedResult<TaskJson>> {
    const filter = this.buildFilter(query);
    const page = query.page;
    const pageSize = query.pageSize;
    const sortBy: TaskSortField = query.sortBy ?? 'sortOrder';
    const dir = query.sortOrder === 'desc' ? -1 : 1;

    let docs: TaskDocument[];
    if (sortBy === 'priority') {
      // 优先级按业务序（low<medium<high<urgent）排序，数据库无此自然序，内存排
      const all = (await mapMongo(() =>
        this.taskModel.find(filter).exec(),
      )) as unknown as TaskDocument[];
      all.sort(
        (a, b) =>
          (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]) * dir ||
          String(a._id).localeCompare(String(b._id)),
      );
      docs = all.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    } else {
      const sort: Record<string, 1 | -1> = {};
      sort[sortBy] = dir === -1 ? -1 : 1;
      if (sortBy !== 'sortOrder') sort.sortOrder = 1;
      docs = (await mapMongo(() =>
        this.taskModel
          .find(filter)
          .sort(sort)
          .skip((page - 1) * pageSize)
          .limit(pageSize)
          .exec(),
      )) as unknown as TaskDocument[];
    }

    const total = (await mapMongo(() => this.taskModel.countDocuments(filter).exec())) as number;
    return buildPaginated(
      docs.map((doc) => toTaskJson(doc)),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: string): Promise<TaskJson> {
    const doc = await mapMongo(() => this.taskModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`任务不存在: ${id}`);
    return toTaskJson(doc as unknown as TaskDocument);
  }

  async update(id: string, dto: UpdateTaskDto): Promise<TaskJson> {
    const existing = await mapMongo(() => this.taskModel.findById(id).exec());
    if (!existing) throw new NotFoundException(`任务不存在: ${id}`);

    if (dto.projectId !== undefined) {
      await this.assertProjectExists(dto.projectId);
    }
    // dependencies 传了才整体替换并校验（自依赖/重复/存在/循环）
    if (dto.dependencies !== undefined) {
      const dependencyIds = this.toObjectIds(dto.dependencies);
      await this.assertDependenciesValid(existing._id, dependencyIds);
    }

    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    const set: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === 'projectId') {
        set[key] = value ? new Types.ObjectId(value as string) : null;
      } else if (key === 'dueDate') {
        set[key] = value ? new Date(value as string) : null;
      } else if (key === 'dependencies') {
        set[key] = this.toObjectIds(dto.dependencies);
      } else {
        set[key] = value;
      }
    }

    const doc = await mapMongo(() =>
      this.taskModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`任务不存在: ${id}`);
    return toTaskJson(doc as unknown as TaskDocument);
  }

  /** 删除任务，并清理其他任务对该任务的依赖引用（先清理引用、再删主文档，幂等可重试） */
  async remove(id: string): Promise<void> {
    const task = await mapMongo(() => this.taskModel.findById(id).exec());
    if (!task) throw new NotFoundException(`任务不存在: ${id}`);
    await mapMongo(() =>
      this.taskModel.updateMany({ dependencies: id }, { $pull: { dependencies: id } }).exec(),
    );
    await mapMongo(() => this.taskModel.deleteOne({ _id: id }).exec());
  }

  /**
   * 处置某项目下的全部任务（供项目永久删除级联调用）：
   * - cascade：删除任务并清理其他任务对它们的依赖引用，返回被删任务 id；
   * - inbox：任务 projectId 置空转入收件箱，返回空列表。
   */
  async disposeByProject(
    projectId: string,
    strategy: TaskDisposalStrategy,
    session?: ClientSession,
  ): Promise<Types.ObjectId[]> {
    const id = new Types.ObjectId(projectId);
    if (strategy === 'inbox') {
      await mapMongo(() =>
        this.taskModel
          .updateMany({ projectId: id }, { $set: { projectId: null } })
          .session(session ?? null)
          .exec(),
      );
      return [];
    }
    const tasks = (await mapMongo(() =>
      this.taskModel
        .find({ projectId: id })
        .select('_id')
        .session(session ?? null)
        .exec(),
    )) as unknown as TaskDocument[];
    const ids = tasks.map((task) => task._id as Types.ObjectId);
    if (ids.length > 0) {
      await mapMongo(() =>
        this.taskModel
          .updateMany({ dependencies: { $in: ids } }, { $pull: { dependencies: { $in: ids } } })
          .session(session ?? null)
          .exec(),
      );
      await mapMongo(() =>
        this.taskModel
          .deleteMany({ projectId: id })
          .session(session ?? null)
          .exec(),
      );
    }
    return ids;
  }

  /**
   * 依赖校验：自依赖 / 重复依赖 / 依赖存在性 / 循环依赖（BFS 从依赖出发能否回到当前任务）。
   * taskId 为空表示新建任务。
   */
  private async assertDependenciesValid(
    taskId: Types.ObjectId | undefined,
    dependencyIds: Types.ObjectId[],
    session?: ClientSession,
  ): Promise<void> {
    const depStrings = dependencyIds.map((id) => id.toString());
    const self = taskId?.toString();
    if (self && depStrings.includes(self)) {
      throw new BadRequestException('任务不能依赖自身');
    }
    const uniq = new Set(depStrings);
    if (uniq.size !== depStrings.length) {
      throw new BadRequestException('依赖列表不能包含重复任务');
    }
    if (depStrings.length === 0) return;

    const visited = new Set<string>();
    let frontier = [...uniq];
    while (frontier.length > 0) {
      if (self && frontier.includes(self)) {
        throw new BadRequestException('存在循环依赖');
      }
      const docs = (await mapMongo(() =>
        this.taskModel
          .find({ _id: { $in: frontier } })
          .session(session ?? null)
          .exec(),
      )) as unknown as TaskDocument[];
      if (docs.length !== frontier.length) {
        throw new BadRequestException('依赖的任务不存在');
      }
      const next = new Set<string>();
      for (const doc of docs) {
        const id = String(doc._id);
        visited.add(id);
        for (const dep of doc.dependencies ?? []) {
          const depId = String(dep);
          if (depId === self) {
            throw new BadRequestException('存在循环依赖');
          }
          if (!visited.has(depId)) next.add(depId);
        }
      }
      frontier = [...next];
    }
  }

  private async assertProjectExists(projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await mapMongo(() => this.projectModel.findById(projectId).exec());
    if (!project) throw new BadRequestException(`项目不存在: ${projectId}`);
  }

  private toObjectIds(ids?: string[]): Types.ObjectId[] {
    return (ids ?? []).map((id) => new Types.ObjectId(id));
  }

  private buildPayload(dto: CreateTaskDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      title: dto.title,
      description: dto.description ?? '',
      status: dto.status ?? 'todo',
      priority: dto.priority ?? 'medium',
      tags: dto.tags ?? [],
      estimatedMinutes: dto.estimatedMinutes ?? 0,
      actualMinutes: dto.actualMinutes ?? 0,
      dod: dto.dod ?? '',
      blocked: dto.blocked ?? false,
      blockedReason: dto.blockedReason ?? '',
      subtasks: dto.subtasks ?? [],
      sortOrder: dto.sortOrder ?? 0,
      dependencies: [],
    };
    if (dto.dueDate !== undefined) payload.dueDate = new Date(dto.dueDate);
    return payload;
  }

  private buildFilter(query: QueryTasksDto): TaskFilter {
    const filter: TaskFilter = {};
    if (query.projectId !== undefined && query.projectId !== '') {
      filter.projectId = query.projectId === 'inbox' ? null : new Types.ObjectId(query.projectId);
    }
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.tags && query.tags.length > 0) filter.tags = { $in: query.tags };
    if (query.search) {
      const rx = regexQuery(query.search);
      filter.$or = [{ title: rx }, { description: rx }, { tags: rx }];
    }
    if (query.dueFrom || query.dueTo) {
      filter.dueDate = {};
      if (query.dueFrom) filter.dueDate.$gte = new Date(query.dueFrom);
      if (query.dueTo) filter.dueDate.$lte = new Date(query.dueTo);
    }
    return filter;
  }
}
