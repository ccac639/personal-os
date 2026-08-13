import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Model, type QueryFilter, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { CreateSessionDto } from './dto/create-session.dto.js';
import { DATE_PATTERN } from './dto/query-focus.dto.js';
import { QueryFocusDto } from './dto/query-focus.dto.js';
import { UpsertPlanDto } from './dto/upsert-plan.dto.js';
import { UpsertWeeklyGoalDto } from './dto/upsert-weekly-goal.dto.js';
import {
  FocusPlanName,
  FocusSessionName,
  WeeklyGoalName,
  type FocusPlanDoc,
  type FocusPlanDocument,
  type FocusSessionDoc,
  type FocusSessionDocument,
  type WeeklyGoalDoc,
  type WeeklyGoalDocument,
} from './focus.schema.js';

type SessionFilter = QueryFilter<FocusSessionDoc>;

@Injectable()
export class FocusService {
  constructor(
    @InjectModel(FocusPlanName) public readonly planModel: Model<FocusPlanDoc>,
    @InjectModel(FocusSessionName) public readonly sessionModel: Model<FocusSessionDoc>,
    @InjectModel(WeeklyGoalName) public readonly weeklyGoalModel: Model<WeeklyGoalDoc>,
  ) {}

  // ---------- 今日计划 ----------

  async getPlan(date: string): Promise<FocusPlanDocument> {
    this.assertDateInput(date);
    const doc = await mapMongo(() => this.planModel.findOne({ date }).exec());
    if (!doc) throw new NotFoundException(`未找到 ${date} 的今日计划`);
    return doc as unknown as FocusPlanDocument;
  }

  async listPlans(query: QueryFocusDto): Promise<FocusPlanDocument[]> {
    const filter = this.buildDateFilter<FocusPlanDoc>(query.from, query.to, 'date');
    return (await mapMongo(() =>
      this.planModel.find(filter).sort({ date: 1 }).exec(),
    )) as unknown as FocusPlanDocument[];
  }

  async upsertPlan(date: string, dto: UpsertPlanDto): Promise<FocusPlanDocument> {
    this.assertDateInput(date);
    const set: Record<string, unknown> = { date };
    if (dto.note !== undefined) set.note = dto.note;
    if (dto.items !== undefined) set.items = this.mapItems(dto.items);
    const doc = await mapMongo(() =>
      this.planModel.findOneAndUpdate({ date }, { $set: set }, { upsert: true, new: true }).exec(),
    );
    return doc as unknown as FocusPlanDocument;
  }

  // ---------- 专注记录 ----------

  async createSession(dto: CreateSessionDto): Promise<FocusSessionDocument> {
    const payload: Record<string, unknown> = {
      date: dto.date,
      startedAt: new Date(dto.startedAt),
      note: dto.note ?? '',
    };
    if (dto.endedAt !== undefined) payload.endedAt = new Date(dto.endedAt);
    if (dto.durationMinutes !== undefined) payload.durationMinutes = dto.durationMinutes;
    if (dto.taskId !== undefined) payload.taskId = new Types.ObjectId(dto.taskId);
    const doc = await mapMongo(() => this.sessionModel.create(payload));
    return doc as unknown as FocusSessionDocument;
  }

  async listSessions(query: QueryFocusDto): Promise<FocusSessionDocument[]> {
    const filter: SessionFilter = {};
    if (query.date) filter.date = query.date;
    if (query.from || query.to) {
      const range: Record<string, unknown> = {};
      if (query.from) range.$gte = query.from;
      if (query.to) range.$lte = query.to;
      filter.date = range as SessionFilter['date'];
    }
    if (query.taskId) filter.taskId = new Types.ObjectId(query.taskId);
    return (await mapMongo(() =>
      this.sessionModel.find(filter).sort({ startedAt: -1 }).exec(),
    )) as unknown as FocusSessionDocument[];
  }

  async deleteSession(id: string): Promise<void> {
    const result = await mapMongo(() => this.sessionModel.deleteOne({ _id: id }).exec());
    if (result.deletedCount === 0) throw new NotFoundException(`专注记录不存在: ${id}`);
  }

  // ---------- 周目标 ----------

  async getWeeklyGoal(weekStart: string): Promise<WeeklyGoalDocument> {
    this.assertDateInput(weekStart);
    const doc = await mapMongo(() => this.weeklyGoalModel.findOne({ weekStart }).exec());
    if (!doc) throw new NotFoundException(`未找到 ${weekStart} 起始的周目标`);
    return doc as unknown as WeeklyGoalDocument;
  }

  async listWeeklyGoals(query: QueryFocusDto): Promise<WeeklyGoalDocument[]> {
    const filter = this.buildDateFilter<WeeklyGoalDoc>(query.from, query.to, 'weekStart');
    return (await mapMongo(() =>
      this.weeklyGoalModel.find(filter).sort({ weekStart: 1 }).exec(),
    )) as unknown as WeeklyGoalDocument[];
  }

  async upsertWeeklyGoal(weekStart: string, dto: UpsertWeeklyGoalDto): Promise<WeeklyGoalDocument> {
    this.assertDateInput(weekStart);
    const set: Record<string, unknown> = { weekStart };
    if (dto.review !== undefined) set.review = dto.review;
    if (dto.items !== undefined) set.items = this.mapItems(dto.items);
    const doc = await mapMongo(() =>
      this.weeklyGoalModel
        .findOneAndUpdate({ weekStart }, { $set: set }, { upsert: true, new: true })
        .exec(),
    );
    return doc as unknown as WeeklyGoalDocument;
  }

  // ---------- 关联清理（项目永久删除时调用） ----------

  /** 清空计划/专注/周目标中对已删除任务的引用（taskId → null） */
  async clearTaskRefs(taskIds: Types.ObjectId[], session?: ClientSession): Promise<void> {
    if (taskIds.length === 0) return;
    await mapMongo(() =>
      this.planModel
        .updateMany({ 'items.taskId': { $in: taskIds } }, { $set: { 'items.$[].taskId': null } })
        .session(session ?? null)
        .exec(),
    );
    await mapMongo(() =>
      this.sessionModel
        .updateMany({ taskId: { $in: taskIds } }, { $set: { taskId: null } })
        .session(session ?? null)
        .exec(),
    );
    await mapMongo(() =>
      this.weeklyGoalModel
        .updateMany({ 'items.taskId': { $in: taskIds } }, { $set: { 'items.$[].taskId': null } })
        .session(session ?? null)
        .exec(),
    );
  }

  // ---------- 工具 ----------

  private mapItems(
    items: Array<{
      taskId?: string;
      title: string;
      done?: boolean;
      target?: number;
      sortOrder?: number;
    }>,
  ): Record<string, unknown>[] {
    return items.map((item) => {
      const mapped: Record<string, unknown> = { title: item.title };
      if (item.taskId !== undefined) mapped.taskId = new Types.ObjectId(item.taskId);
      if (item.done !== undefined) mapped.done = item.done;
      if (item.target !== undefined) mapped.target = item.target;
      if (item.sortOrder !== undefined) mapped.sortOrder = item.sortOrder;
      return mapped;
    });
  }

  private buildDateFilter<T>(from?: string, to?: string, field = 'date'): QueryFilter<T> {
    if (!from && !to) return {} as QueryFilter<T>;
    const range: Record<string, unknown> = {};
    if (from) range.$gte = from;
    if (to) range.$lte = to;
    return { [field]: range } as QueryFilter<T>;
  }

  /** 路径参数日期格式校验（YYYY-MM-DD），非法返回 400 */
  private assertDateInput(value: string): void {
    if (!DATE_PATTERN.test(value)) {
      throw new BadRequestException(`日期格式必须为 YYYY-MM-DD，收到: ${value}`);
    }
  }
}
