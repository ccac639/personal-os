import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, type Model, Types } from 'mongoose';

import { mapMongo } from '../_shared/mongo-errors.js';
import { type InitializableModel, withTransaction } from '../_shared/transaction.js';
import {
  FocusPlanName,
  FocusSessionName,
  WeeklyGoalName,
  type FocusPlanDoc,
  type FocusSessionDoc,
  type WeeklyGoalDoc,
} from '../focus/focus.schema.js';
import {
  KnowledgeName,
  type KnowledgeDoc,
  type KnowledgeType,
} from '../knowledge/knowledge.schema.js';
import {
  ProjectName,
  type ProgressMode,
  type ProjectDoc,
  type ProjectStatus,
} from '../projects/projects.schema.js';
import {
  MilestoneName,
  ReleaseName,
  type MilestoneDoc,
  type MilestoneStatus,
  type ReleaseDoc,
  type ReleaseStatus,
} from '../releases/releases.schema.js';
import {
  TaskName,
  type TaskDoc,
  type TaskPriority,
  type TaskStatus,
} from '../tasks/tasks.schema.js';
import {
  type ImportDataDto,
  type ImportFocusItemDto,
  type ImportResult,
  IMPORT_VERSION,
} from './data-import.dto.js';

/** 导入集：id(字符串) → Mongo 写入 payload */
type ImportSet = Map<string, Record<string, unknown>>;

interface ImportSets {
  projects: ImportSet;
  tasks: ImportSet;
  milestones: ImportSet;
  releases: ImportSet;
  knowledge: ImportSet;
  plans: ImportSet;
  sessions: ImportSet;
  weeklyGoals: ImportSet;
}

function toNullableObjectId(value: string | null | undefined): Types.ObjectId | null {
  return value ? new Types.ObjectId(value) : null;
}

/**
 * localStorage 数据导入：
 * - 校验：版本 / 各集合数量上限（DTO 层）/ 集合内 ID 唯一 / 引用完整性
 *   （项目存在性、任务依赖存在性/自依赖/重复/循环/同域、知识条目跨项目一致性、focus 任务引用）
 * - 引用必须在导入数据集内自包含解析（整体快照语义，不允许引用库中既有数据）
 * - 写入：先全部校验通过才写（失败整体拒绝，不产生半完成状态）；
 *   逐文档 findOneAndUpdate upsert（按导入 id），幂等可重试；
 *   多集合写入走 withTransaction（支持事务时原子执行，否则按「先写被引用方」的补偿顺序）
 */
@Injectable()
export class DataImportService {
  constructor(
    @InjectModel(ProjectName) private readonly projectModel: Model<ProjectDoc>,
    @InjectModel(TaskName) private readonly taskModel: Model<TaskDoc>,
    @InjectModel(MilestoneName) private readonly milestoneModel: Model<MilestoneDoc>,
    @InjectModel(ReleaseName) private readonly releaseModel: Model<ReleaseDoc>,
    @InjectModel(KnowledgeName) private readonly knowledgeModel: Model<KnowledgeDoc>,
    @InjectModel(FocusPlanName) private readonly planModel: Model<FocusPlanDoc>,
    @InjectModel(FocusSessionName) private readonly sessionModel: Model<FocusSessionDoc>,
    @InjectModel(WeeklyGoalName) private readonly weeklyGoalModel: Model<WeeklyGoalDoc>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async importData(dto: ImportDataDto): Promise<ImportResult> {
    if (dto.version !== IMPORT_VERSION) {
      throw new BadRequestException(
        `不支持的导入版本: ${String(dto.version)}，当前仅支持 v${IMPORT_VERSION}`,
      );
    }

    const sets = this.extractSets(dto);
    this.assertTaskDependencyGraph(sets.tasks);
    this.assertCrossReferences(sets);

    const models: InitializableModel[] = [
      this.projectModel,
      this.taskModel,
      this.milestoneModel,
      this.releaseModel,
      this.knowledgeModel,
      this.planModel,
      this.sessionModel,
      this.weeklyGoalModel,
    ];
    await withTransaction(this.connection, models, async (session) => {
      // 先写被引用方：projects → tasks → milestones → releases → knowledge → focus
      await this.writeSet(this.projectModel, sets.projects, session);
      await this.writeSet(this.taskModel, sets.tasks, session);
      await this.writeSet(this.milestoneModel, sets.milestones, session);
      await this.writeSet(this.releaseModel, sets.releases, session);
      await this.writeSet(this.knowledgeModel, sets.knowledge, session);
      await this.writeSet(this.planModel, sets.plans, session);
      await this.writeSet(this.sessionModel, sets.sessions, session);
      await this.writeSet(this.weeklyGoalModel, sets.weeklyGoals, session);
    });

    const imported = {
      projects: sets.projects.size,
      tasks: sets.tasks.size,
      milestones: sets.milestones.size,
      releases: sets.releases.size,
      knowledge: sets.knowledge.size,
      plans: sets.plans.size,
      sessions: sets.sessions.size,
      weeklyGoals: sets.weeklyGoals.size,
    };
    const total = Object.values(imported).reduce((sum, n) => sum + n, 0);
    return { imported, total };
  }

  // ---------- 提取与唯一性 ----------

  private extractSets(dto: ImportDataDto): ImportSets {
    return {
      projects: this.toSet(dto.projects ?? [], (p) => this.buildProjectPayload(p)),
      tasks: this.toSet(dto.tasks ?? [], (t) => this.buildTaskPayload(t)),
      milestones: this.toSet(dto.milestones ?? [], (m) => this.buildMilestonePayload(m)),
      releases: this.toSet(dto.releases ?? [], (r) => this.buildReleasePayload(r)),
      knowledge: this.toSet(dto.knowledge ?? [], (k) => this.buildKnowledgePayload(k)),
      plans: this.toSet(dto.focus?.plans ?? [], (p) => this.buildPlanPayload(p)),
      sessions: this.toSet(dto.focus?.sessions ?? [], (s) => this.buildSessionPayload(s)),
      weeklyGoals: this.toSet(dto.focus?.weeklyGoals ?? [], (w) => this.buildWeeklyGoalPayload(w)),
    };
  }

  /** 逐条转换 payload 并写入 Map；重复 id 直接拒绝（幂等依赖稳定 id） */
  private toSet<T extends { id: string }>(
    items: T[],
    build: (item: T) => Record<string, unknown>,
  ): ImportSet {
    const set: ImportSet = new Map();
    for (const item of items) {
      if (set.has(item.id)) {
        throw new BadRequestException(`导入数据包含重复 ID: ${item.id}`);
      }
      set.set(item.id, build(item));
    }
    return set;
  }

  // ---------- 任务依赖图：存在性 / 自依赖 / 循环 / 同域 ----------

  private assertTaskDependencyGraph(tasks: ImportSet): void {
    if (tasks.size === 0) return;

    // 每个任务的「最终 projectId」：payload 已归一为 ObjectId | null
    const projectIdOf = new Map<string, string | null>();
    for (const [id, payload] of tasks) {
      projectIdOf.set(id, payload.projectId ? String(payload.projectId) : null);
    }

    // 入度：任务依赖数量；dependents：谁依赖我
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const [id] of tasks) {
      indegree.set(id, 0);
      dependents.set(id, []);
    }

    for (const [id, payload] of tasks) {
      const deps = (payload.dependencies ?? []) as Types.ObjectId[];
      const depStrings = deps.map((d) => d.toString());
      const uniq = new Set(depStrings);
      if (uniq.size !== depStrings.length) {
        throw new BadRequestException(`任务 ${id} 的依赖列表包含重复任务`);
      }
      if (depStrings.includes(id)) {
        throw new BadRequestException(`任务不能依赖自身: ${id}`);
      }
      const scope = projectIdOf.get(id) ?? null;
      for (const depId of depStrings) {
        const depPayload = tasks.get(depId);
        if (!depPayload) {
          throw new BadRequestException(`任务 ${id} 依赖的任务不存在: ${depId}`);
        }
        // 同域：依赖任务必须与当前任务同项目（null 视为收件箱域）
        const depScope = projectIdOf.get(depId) ?? null;
        if (depScope !== scope) {
          throw new BadRequestException(
            `跨项目依赖不允许: 任务 ${id} 依赖的任务 ${depId} 不属于同一项目（收件箱任务只能依赖收件箱任务）`,
          );
        }
        indegree.set(id, (indegree.get(id) ?? 0) + 1);
        dependents.get(depId)?.push(id);
      }
    }

    // Kahn 拓扑：剩余节点 > 0 说明存在环
    const queue = [...tasks.keys()].filter((id) => (indegree.get(id) ?? 0) === 0);
    let visited = 0;
    while (queue.length > 0) {
      const current = queue.shift()!;
      visited += 1;
      for (const dependent of dependents.get(current) ?? []) {
        const next = (indegree.get(dependent) ?? 0) - 1;
        indegree.set(dependent, next);
        if (next === 0) queue.push(dependent);
      }
    }
    if (visited < tasks.size) {
      throw new BadRequestException('导入数据包含循环任务依赖');
    }
  }

  // ---------- 跨实体引用完整性 ----------

  private assertCrossReferences(sets: ImportSets): void {
    const projectIds = sets.projects;
    const taskIds = sets.tasks;
    const milestoneIds = sets.milestones;

    const requireProject = (owner: string, id: string | null | undefined): void => {
      if (id && !projectIds.has(id)) {
        throw new BadRequestException(`${owner} 引用的项目不存在（导入数据必须自包含）: ${id}`);
      }
    };

    for (const [id, payload] of sets.tasks) {
      requireProject(`任务 ${id}`, payload.projectId ? String(payload.projectId) : null);
    }
    for (const [id, payload] of sets.milestones) {
      requireProject(`里程碑 ${id}`, payload.projectId ? String(payload.projectId) : null);
    }
    for (const [id, payload] of sets.releases) {
      requireProject(`发布 ${id}`, payload.projectId ? String(payload.projectId) : null);
      for (const taskId of (payload.taskIds ?? []) as Types.ObjectId[]) {
        if (!taskIds.has(taskId.toString())) {
          throw new BadRequestException(`发布 ${id} 引用的任务不存在: ${taskId.toString()}`);
        }
      }
      for (const milestoneId of (payload.milestoneIds ?? []) as Types.ObjectId[]) {
        if (!milestoneIds.has(milestoneId.toString())) {
          throw new BadRequestException(`发布 ${id} 引用的里程碑不存在: ${milestoneId.toString()}`);
        }
      }
    }

    // 知识条目：引用存在 + 跨项目一致性（任务/里程碑必须属于同一项目）
    for (const [id, payload] of sets.knowledge) {
      const projectId = payload.projectId ? String(payload.projectId) : null;
      requireProject(`知识条目 ${id}`, projectId);
      const taskId = payload.taskId ? String(payload.taskId) : null;
      if (taskId) {
        const taskPayload = taskIds.get(taskId);
        if (!taskPayload) {
          throw new BadRequestException(`知识条目 ${id} 引用的任务不存在: ${taskId}`);
        }
        if (projectId && String(taskPayload.projectId ?? null) !== projectId) {
          throw new BadRequestException(
            `知识条目 ${id} 的任务与项目关联不一致: 任务 ${taskId} 不属于项目 ${projectId}`,
          );
        }
      }
      const milestoneId = payload.milestoneId ? String(payload.milestoneId) : null;
      if (milestoneId) {
        const milestonePayload = milestoneIds.get(milestoneId);
        if (!milestonePayload) {
          throw new BadRequestException(`知识条目 ${id} 引用的里程碑不存在: ${milestoneId}`);
        }
        if (projectId && String(milestonePayload.projectId ?? null) !== projectId) {
          throw new BadRequestException(
            `知识条目 ${id} 的里程碑与项目关联不一致: 里程碑 ${milestoneId} 不属于项目 ${projectId}`,
          );
        }
      }
    }

    // focus：条目引用的任务必须存在
    for (const [id, payload] of sets.plans) {
      for (const item of (payload.items ?? []) as Array<{ taskId?: Types.ObjectId | null }>) {
        if (item.taskId && !taskIds.has(item.taskId.toString())) {
          throw new BadRequestException(
            `今日计划 ${id} 引用的任务不存在: ${item.taskId.toString()}`,
          );
        }
      }
    }
    for (const [id, payload] of sets.sessions) {
      if (payload.taskId && !taskIds.has(String(payload.taskId))) {
        throw new BadRequestException(`专注记录 ${id} 引用的任务不存在: ${String(payload.taskId)}`);
      }
    }
    for (const [id, payload] of sets.weeklyGoals) {
      for (const item of (payload.items ?? []) as Array<{ taskId?: Types.ObjectId | null }>) {
        if (item.taskId && !taskIds.has(item.taskId.toString())) {
          throw new BadRequestException(`周目标 ${id} 引用的任务不存在: ${item.taskId.toString()}`);
        }
      }
    }
  }

  // ---------- payload 构建（DTO → Mongo 文档形状） ----------

  private buildProjectPayload(p: {
    name: string;
    description?: string;
    status?: ProjectStatus;
    favorite?: boolean;
    archived?: boolean;
    progressMode?: ProgressMode;
    progress?: number;
    targetDate?: string;
    techStack?: string[];
    tags?: string[];
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: p.name,
      description: p.description ?? '',
      status: p.status ?? 'planning',
      favorite: p.favorite ?? false,
      archived: p.archived ?? false,
      progressMode: p.progressMode ?? 'manual',
      progress: p.progress ?? 0,
      techStack: p.techStack ?? [],
      tags: p.tags ?? [],
    };
    if (p.targetDate !== undefined) payload.targetDate = new Date(p.targetDate);
    return payload;
  }

  private buildTaskPayload(t: {
    projectId?: string | null;
    title: string;
    description?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    tags?: string[];
    dueDate?: string;
    estimatedMinutes?: number;
    actualMinutes?: number;
    dod?: string;
    blocked?: boolean;
    blockedReason?: string;
    subtasks?: Array<{ title: string; done?: boolean }>;
    dependencies?: string[];
    sortOrder?: number;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      projectId: toNullableObjectId(t.projectId),
      title: t.title,
      description: t.description ?? '',
      status: t.status ?? 'todo',
      priority: t.priority ?? 'medium',
      tags: t.tags ?? [],
      estimatedMinutes: t.estimatedMinutes ?? 0,
      actualMinutes: t.actualMinutes ?? 0,
      dod: t.dod ?? '',
      blocked: t.blocked ?? false,
      blockedReason: t.blockedReason ?? '',
      subtasks: (t.subtasks ?? []).map((s) => ({ title: s.title, done: s.done ?? false })),
      dependencies: (t.dependencies ?? []).map((d) => new Types.ObjectId(d)),
      sortOrder: t.sortOrder ?? 0,
    };
    if (t.dueDate !== undefined) payload.dueDate = new Date(t.dueDate);
    return payload;
  }

  private buildMilestonePayload(m: {
    name: string;
    projectId?: string | null;
    description?: string;
    targetDate?: string;
    status?: MilestoneStatus;
    taskIds?: string[];
    sortOrder?: number;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      name: m.name,
      projectId: toNullableObjectId(m.projectId),
      description: m.description ?? '',
      status: m.status ?? 'planned',
      taskIds: (m.taskIds ?? []).map((id) => new Types.ObjectId(id)),
      sortOrder: m.sortOrder ?? 0,
    };
    if (m.targetDate !== undefined) payload.targetDate = new Date(m.targetDate);
    return payload;
  }

  private buildReleasePayload(r: {
    version: string;
    summary: string;
    status?: ReleaseStatus;
    projectId?: string | null;
    checklist?: Array<{ title: string; done?: boolean; notes?: string }>;
    taskIds?: string[];
    milestoneIds?: string[];
    releaseDate?: string;
    publishedAt?: string;
    notes?: string;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      version: r.version,
      summary: r.summary,
      status: r.status ?? 'planned',
      projectId: toNullableObjectId(r.projectId),
      checklist: (r.checklist ?? []).map((c) => ({
        title: c.title,
        done: c.done ?? false,
        ...(c.notes != null ? { notes: c.notes } : {}),
      })),
      taskIds: (r.taskIds ?? []).map((id) => new Types.ObjectId(id)),
      milestoneIds: (r.milestoneIds ?? []).map((id) => new Types.ObjectId(id)),
      notes: r.notes ?? '',
    };
    if (r.releaseDate !== undefined) payload.releaseDate = new Date(r.releaseDate);
    if (r.publishedAt !== undefined) payload.publishedAt = new Date(r.publishedAt);
    return payload;
  }

  private buildKnowledgePayload(k: {
    type: KnowledgeType;
    title: string;
    content: string;
    projectId?: string | null;
    taskId?: string | null;
    milestoneId?: string | null;
    issueStatus?: string;
    tags?: string[];
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      type: k.type,
      title: k.title,
      content: k.content,
      projectId: toNullableObjectId(k.projectId),
      taskId: toNullableObjectId(k.taskId),
      milestoneId: toNullableObjectId(k.milestoneId),
      tags: k.tags ?? [],
    };
    if (k.issueStatus !== undefined) payload.issueStatus = k.issueStatus;
    return payload;
  }

  private mapFocusItems(items: ImportFocusItemDto[] | undefined): Record<string, unknown>[] {
    return (items ?? []).map((item) => {
      const mapped: Record<string, unknown> = { title: item.title };
      if (item.taskId !== undefined) mapped.taskId = toNullableObjectId(item.taskId);
      if (item.done !== undefined) mapped.done = item.done;
      if (item.target !== undefined) mapped.target = item.target;
      if (item.sortOrder !== undefined) mapped.sortOrder = item.sortOrder;
      return mapped;
    });
  }

  private buildPlanPayload(p: {
    date: string;
    note?: string;
    items?: ImportFocusItemDto[];
  }): Record<string, unknown> {
    return { date: p.date, note: p.note ?? '', items: this.mapFocusItems(p.items) };
  }

  private buildSessionPayload(s: {
    date: string;
    startedAt: string;
    endedAt?: string;
    durationMinutes?: number;
    taskId?: string | null;
    note?: string;
  }): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      date: s.date,
      startedAt: new Date(s.startedAt),
      taskId: toNullableObjectId(s.taskId),
      note: s.note ?? '',
    };
    if (s.endedAt !== undefined) payload.endedAt = new Date(s.endedAt);
    if (s.durationMinutes !== undefined) payload.durationMinutes = s.durationMinutes;
    return payload;
  }

  private buildWeeklyGoalPayload(w: {
    weekStart: string;
    review?: string;
    items?: ImportFocusItemDto[];
  }): Record<string, unknown> {
    return { weekStart: w.weekStart, review: w.review ?? '', items: this.mapFocusItems(w.items) };
  }

  // ---------- 写入 ----------

  /** 按导入 id 幂等 upsert：已存在整体覆盖，不存在则按 id 创建 */
  private async writeSet<T>(
    model: Model<T>,
    set: ImportSet,
    session?: ClientSession,
  ): Promise<void> {
    for (const [id, payload] of set) {
      await mapMongo(() =>
        model
          .findOneAndUpdate({ _id: id }, { $set: payload }, { upsert: true, new: true })
          .session(session ?? null)
          .exec(),
      );
    }
  }
}
