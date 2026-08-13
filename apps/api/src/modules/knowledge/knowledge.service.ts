import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { buildPaginated, type PaginatedResult } from '../_shared/pagination.js';
import { regexQuery } from '../_shared/query-helpers.js';
import { CreateKnowledgeDto } from './dto/create-knowledge.dto.js';
import { QueryKnowledgeDto, type KnowledgeSortField } from './dto/query-knowledge.dto.js';
import { UpdateKnowledgeDto } from './dto/update-knowledge.dto.js';
import {
  KnowledgeName,
  type IssueStatus,
  type KnowledgeDoc,
  type KnowledgeDocument,
  type KnowledgeType,
} from './knowledge.schema.js';

export interface KnowledgeJson {
  id: string;
  type: KnowledgeType;
  title: string;
  content: string;
  projectId?: string | null;
  taskId?: string | null;
  milestoneId?: string | null;
  issueStatus?: IssueStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

function toKnowledgeJson(doc: KnowledgeDocument): KnowledgeJson {
  return doc.toJSON() as unknown as KnowledgeJson;
}

type KnowledgeFilter = QueryFilter<KnowledgeDoc>;

@Injectable()
export class KnowledgeService {
  constructor(@InjectModel(KnowledgeName) public readonly knowledgeModel: Model<KnowledgeDoc>) {}

  async create(dto: CreateKnowledgeDto): Promise<KnowledgeJson> {
    const doc = await mapMongo(() => this.knowledgeModel.create(this.buildPayload(dto)));
    return toKnowledgeJson(doc as unknown as KnowledgeDocument);
  }

  async findAll(query: QueryKnowledgeDto): Promise<PaginatedResult<KnowledgeJson>> {
    const filter = this.buildFilter(query);
    const sortBy: KnowledgeSortField = query.sortBy ?? 'updatedAt';
    const dir = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: dir };
    if (sortBy !== 'updatedAt') sort.updatedAt = -1;

    const docs = (await mapMongo(() =>
      this.knowledgeModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
    )) as unknown as KnowledgeDocument[];
    const total = (await mapMongo(() =>
      this.knowledgeModel.countDocuments(filter).exec(),
    )) as number;
    return buildPaginated(
      docs.map((doc) => toKnowledgeJson(doc)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async findOne(id: string): Promise<KnowledgeJson> {
    const doc = await mapMongo(() => this.knowledgeModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`知识条目不存在: ${id}`);
    return toKnowledgeJson(doc as unknown as KnowledgeDocument);
  }

  async update(id: string, dto: UpdateKnowledgeDto): Promise<KnowledgeJson> {
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    if (entries.length === 0) {
      return this.findOne(id);
    }
    const set: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === 'projectId' || key === 'taskId' || key === 'milestoneId') {
        set[key] = value ? new Types.ObjectId(value as string) : null;
      } else {
        set[key] = value;
      }
    }
    const doc = await mapMongo(() =>
      this.knowledgeModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`知识条目不存在: ${id}`);
    return toKnowledgeJson(doc as unknown as KnowledgeDocument);
  }

  async remove(id: string): Promise<void> {
    const doc = await mapMongo(() => this.knowledgeModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`知识条目不存在: ${id}`);
    await mapMongo(() => this.knowledgeModel.deleteOne({ _id: id }).exec());
  }

  /**
   * 项目永久删除时清理关联知识条目（供 ProjectsService 级联调用）：
   * 删除关联该项目、其任务、其里程碑的所有知识条目。
   */
  async deleteByProjectRefs(
    projectId: string,
    taskIds: Types.ObjectId[],
    milestoneIds: Types.ObjectId[],
    session?: ClientSession,
  ): Promise<void> {
    const or: QueryFilter<KnowledgeDoc>[] = [{ projectId: new Types.ObjectId(projectId) }];
    if (taskIds.length > 0) or.push({ taskId: { $in: taskIds } });
    if (milestoneIds.length > 0) or.push({ milestoneId: { $in: milestoneIds } });
    await mapMongo(() =>
      this.knowledgeModel
        .deleteMany({ $or: or })
        .session(session ?? null)
        .exec(),
    );
  }

  private buildPayload(dto: CreateKnowledgeDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type: dto.type,
      title: dto.title,
      content: dto.content,
      tags: dto.tags ?? [],
    };
    if (dto.projectId !== undefined) payload.projectId = new Types.ObjectId(dto.projectId);
    if (dto.taskId !== undefined) payload.taskId = new Types.ObjectId(dto.taskId);
    if (dto.milestoneId !== undefined) payload.milestoneId = new Types.ObjectId(dto.milestoneId);
    if (dto.issueStatus !== undefined) payload.issueStatus = dto.issueStatus;
    return payload;
  }

  private buildFilter(query: QueryKnowledgeDto): KnowledgeFilter {
    const filter: KnowledgeFilter = {};
    if (query.type) filter.type = query.type;
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.taskId) filter.taskId = new Types.ObjectId(query.taskId);
    if (query.milestoneId) filter.milestoneId = new Types.ObjectId(query.milestoneId);
    if (query.tags && query.tags.length > 0) filter.tags = { $in: query.tags };
    if (query.search) {
      const rx = regexQuery(query.search);
      filter.$or = [{ title: rx }, { content: rx }, { tags: rx }];
    }
    return filter;
  }
}
