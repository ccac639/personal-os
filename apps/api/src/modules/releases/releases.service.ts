import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { buildPaginated, type PaginatedResult } from '../_shared/pagination.js';
import { regexQuery } from '../_shared/query-helpers.js';
import { ProjectName, type ProjectDoc } from '../projects/projects.schema.js';
import { CreateMilestoneDto } from './dto/create-milestone.dto.js';
import { CreateReleaseDto } from './dto/create-release.dto.js';
import { QueryMilestonesDto, type MilestoneSortField } from './dto/query-milestones.dto.js';
import { QueryReleasesDto, type ReleaseSortField } from './dto/query-releases.dto.js';
import { UpdateMilestoneDto } from './dto/update-milestone.dto.js';
import { UpdateReleaseDto } from './dto/update-release.dto.js';
import {
  MilestoneName,
  ReleaseName,
  type ChecklistItem,
  type MilestoneDoc,
  type MilestoneDocument,
  type MilestoneStatus,
  type ReleaseDoc,
  type ReleaseDocument,
  type ReleaseStatus,
} from './releases.schema.js';

export interface ReleaseJson {
  id: string;
  version: string;
  summary: string;
  status: ReleaseStatus;
  projectId?: string | null;
  checklist: ChecklistItem[];
  taskIds: string[];
  milestoneIds: string[];
  releaseDate?: string | null;
  publishedAt?: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface MilestoneJson {
  id: string;
  name: string;
  projectId?: string | null;
  description: string;
  targetDate?: string | null;
  status: MilestoneStatus;
  taskIds: string[];
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

function toReleaseJson(doc: ReleaseDocument): ReleaseJson {
  return doc.toJSON() as unknown as ReleaseJson;
}

function toMilestoneJson(doc: MilestoneDocument): MilestoneJson {
  return doc.toJSON() as unknown as MilestoneJson;
}

type ReleaseFilter = QueryFilter<ReleaseDoc>;
type MilestoneFilter = QueryFilter<MilestoneDoc>;

@Injectable()
export class ReleasesService {
  constructor(
    @InjectModel(ReleaseName) public readonly releaseModel: Model<ReleaseDoc>,
    @InjectModel(MilestoneName) public readonly milestoneModel: Model<MilestoneDoc>,
    @InjectModel(ProjectName) private readonly projectModel: Model<ProjectDoc>,
  ) {}

  // ---------- 发布记录 ----------

  async createRelease(dto: CreateReleaseDto): Promise<ReleaseJson> {
    await this.assertProjectExists(dto.projectId);
    const doc = await mapMongo(() => this.releaseModel.create(this.buildReleasePayload(dto)));
    return toReleaseJson(doc as unknown as ReleaseDocument);
  }

  async findAllReleases(query: QueryReleasesDto): Promise<PaginatedResult<ReleaseJson>> {
    const filter: ReleaseFilter = {};
    if (query.search) {
      const rx = regexQuery(query.search);
      filter.$or = [{ version: rx }, { summary: rx }, { notes: rx }];
    }
    if (query.status) filter.status = query.status;
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);

    const sortBy: ReleaseSortField = query.sortBy ?? 'createdAt';
    const dir = query.sortOrder === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = { [sortBy]: dir };
    if (sortBy !== 'updatedAt') sort.updatedAt = -1;

    const docs = (await mapMongo(() =>
      this.releaseModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
    )) as unknown as ReleaseDocument[];
    const total = (await mapMongo(() => this.releaseModel.countDocuments(filter).exec())) as number;
    return buildPaginated(
      docs.map((doc) => toReleaseJson(doc)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async findOneRelease(id: string): Promise<ReleaseJson> {
    const doc = await mapMongo(() => this.releaseModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`发布不存在: ${id}`);
    return toReleaseJson(doc as unknown as ReleaseDocument);
  }

  async updateRelease(id: string, dto: UpdateReleaseDto): Promise<ReleaseJson> {
    if (dto.projectId !== undefined) {
      await this.assertProjectExists(dto.projectId);
    }
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    const set: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === 'projectId') {
        set[key] = value ? new Types.ObjectId(value as string) : null;
      } else if (key === 'releaseDate' || key === 'publishedAt') {
        set[key] = value ? new Date(value as string) : null;
      } else if (key === 'taskIds') {
        set[key] = (value as string[]).map((v) => new Types.ObjectId(v));
      } else if (key === 'milestoneIds') {
        set[key] = (value as string[]).map((v) => new Types.ObjectId(v));
      } else {
        set[key] = value;
      }
    }
    const doc = await mapMongo(() =>
      this.releaseModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`发布不存在: ${id}`);
    return toReleaseJson(doc as unknown as ReleaseDocument);
  }

  async removeRelease(id: string): Promise<void> {
    const release = await mapMongo(() => this.releaseModel.findById(id).exec());
    if (!release) throw new NotFoundException(`发布不存在: ${id}`);
    await mapMongo(() => this.releaseModel.deleteOne({ _id: id }).exec());
  }

  // ---------- 里程碑 ----------

  async createMilestone(dto: CreateMilestoneDto): Promise<MilestoneJson> {
    await this.assertProjectExists(dto.projectId);
    const doc = await mapMongo(() => this.milestoneModel.create(this.buildMilestonePayload(dto)));
    return toMilestoneJson(doc as unknown as MilestoneDocument);
  }

  async findAllMilestones(query: QueryMilestonesDto): Promise<PaginatedResult<MilestoneJson>> {
    const filter: MilestoneFilter = {};
    if (query.projectId) filter.projectId = new Types.ObjectId(query.projectId);
    if (query.status) filter.status = query.status;

    const sortBy: MilestoneSortField = query.sortBy ?? 'sortOrder';
    const dir = query.sortOrder === 'desc' ? -1 : 1;
    const sort: Record<string, 1 | -1> = { [sortBy]: dir };
    if (sortBy !== 'sortOrder') sort.sortOrder = 1;

    const docs = (await mapMongo(() =>
      this.milestoneModel
        .find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
    )) as unknown as MilestoneDocument[];
    const total = (await mapMongo(() =>
      this.milestoneModel.countDocuments(filter).exec(),
    )) as number;
    return buildPaginated(
      docs.map((doc) => toMilestoneJson(doc)),
      total,
      query.page,
      query.pageSize,
    );
  }

  async findOneMilestone(id: string): Promise<MilestoneJson> {
    const doc = await mapMongo(() => this.milestoneModel.findById(id).exec());
    if (!doc) throw new NotFoundException(`里程碑不存在: ${id}`);
    return toMilestoneJson(doc as unknown as MilestoneDocument);
  }

  async updateMilestone(id: string, dto: UpdateMilestoneDto): Promise<MilestoneJson> {
    if (dto.projectId !== undefined) {
      await this.assertProjectExists(dto.projectId);
    }
    const entries = Object.entries(dto).filter(([, v]) => v !== undefined);
    const set: Record<string, unknown> = {};
    for (const [key, value] of entries) {
      if (key === 'projectId') {
        set[key] = value ? new Types.ObjectId(value as string) : null;
      } else if (key === 'targetDate') {
        set[key] = value ? new Date(value as string) : null;
      } else if (key === 'taskIds') {
        set[key] = (value as string[]).map((v) => new Types.ObjectId(v));
      } else {
        set[key] = value;
      }
    }
    const doc = await mapMongo(() =>
      this.milestoneModel.findOneAndUpdate({ _id: id }, { $set: set }, { new: true }).exec(),
    );
    if (!doc) throw new NotFoundException(`里程碑不存在: ${id}`);
    return toMilestoneJson(doc as unknown as MilestoneDocument);
  }

  /** 删除里程碑，并清理所有发布记录中对它的引用（先清理引用、再删主文档） */
  async removeMilestone(id: string): Promise<void> {
    const milestone = await mapMongo(() => this.milestoneModel.findById(id).exec());
    if (!milestone) throw new NotFoundException(`里程碑不存在: ${id}`);
    const objectId = new Types.ObjectId(id);
    await mapMongo(() =>
      this.releaseModel
        .updateMany({ milestoneIds: objectId }, { $pull: { milestoneIds: objectId } })
        .exec(),
    );
    await mapMongo(() => this.milestoneModel.deleteOne({ _id: id }).exec());
  }

  /**
   * 项目永久删除时解除项目关联（供 ProjectsService 级联调用）：
   * - 删除该项目全部里程碑，并从发布记录的 milestoneIds 中移除；
   * - 发布记录 projectId 置空（保留发布历史）。
   * 返回被删里程碑 id 列表。
   */
  async unlinkProject(projectId: string, session?: ClientSession): Promise<Types.ObjectId[]> {
    const id = new Types.ObjectId(projectId);
    const milestones = (await mapMongo(() =>
      this.milestoneModel
        .find({ projectId: id })
        .select('_id')
        .session(session ?? null)
        .exec(),
    )) as unknown as MilestoneDocument[];
    const milestoneIds = milestones.map((m) => m._id as Types.ObjectId);
    if (milestoneIds.length > 0) {
      await mapMongo(() =>
        this.releaseModel
          .updateMany(
            { milestoneIds: { $in: milestoneIds } },
            { $pull: { milestoneIds: { $in: milestoneIds } } },
          )
          .session(session ?? null)
          .exec(),
      );
      await mapMongo(() =>
        this.milestoneModel
          .deleteMany({ projectId: id })
          .session(session ?? null)
          .exec(),
      );
    }
    await mapMongo(() =>
      this.releaseModel
        .updateMany({ projectId: id }, { $set: { projectId: null } })
        .session(session ?? null)
        .exec(),
    );
    return milestoneIds;
  }

  // ---------- 工具 ----------

  private async assertProjectExists(projectId?: string): Promise<void> {
    if (!projectId) return;
    const project = await mapMongo(() => this.projectModel.findById(projectId).exec());
    if (!project) throw new BadRequestException(`项目不存在: ${projectId}`);
  }

  private buildReleasePayload(dto: CreateReleaseDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      version: dto.version,
      summary: dto.summary,
      status: dto.status ?? 'planned',
      checklist: dto.checklist ?? [],
      taskIds: dto.taskIds ? dto.taskIds.map((v) => new Types.ObjectId(v)) : [],
      milestoneIds: dto.milestoneIds ? dto.milestoneIds.map((v) => new Types.ObjectId(v)) : [],
      notes: dto.notes ?? '',
    };
    if (dto.projectId !== undefined) payload.projectId = new Types.ObjectId(dto.projectId);
    if (dto.releaseDate !== undefined) payload.releaseDate = new Date(dto.releaseDate);
    if (dto.publishedAt !== undefined) payload.publishedAt = new Date(dto.publishedAt);
    return payload;
  }

  private buildMilestonePayload(dto: CreateMilestoneDto): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: dto.name,
      description: dto.description ?? '',
      status: dto.status ?? 'planned',
      taskIds: dto.taskIds ? dto.taskIds.map((v) => new Types.ObjectId(v)) : [],
      sortOrder: dto.sortOrder ?? 0,
    };
    if (dto.projectId !== undefined) payload.projectId = new Types.ObjectId(dto.projectId);
    if (dto.targetDate !== undefined) payload.targetDate = new Date(dto.targetDate);
    return payload;
  }
}
