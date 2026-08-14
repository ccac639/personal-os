/**
 * 数据访问层：WorkflowStore / RunStore 接口 + Mongo 实现
 *
 * service 依赖接口而非 Model，测试可注入内存实现（不依赖 MongoDB）。
 */
import type { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Injectable, type Provider } from '@nestjs/common';

import type { WorkflowEntity, WorkflowRunEntity } from './workflow.types.js';
import {
  WORKFLOW_MODEL,
  WORKFLOW_RUN_MODEL,
  type WorkflowDoc,
  type WorkflowRunDoc,
} from './workflow.schema.js';

/* ---------- 接口 ---------- */

export type WorkflowSortField = 'updatedAt' | 'name' | 'createdAt';

export interface WorkflowListFilter {
  q?: string;
  tag?: string;
  favorite?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
  sort: WorkflowSortField;
  order: 'asc' | 'desc';
  limit: number;
  offset: number;
}

export interface WorkflowStore {
  list(filter: WorkflowListFilter): Promise<{ items: WorkflowEntity[]; total: number }>;
  findById(id: string): Promise<WorkflowEntity | null>;
  findByIds(ids: string[]): Promise<WorkflowEntity[]>;
  create(data: Partial<WorkflowEntity>): Promise<WorkflowEntity>;
  update(id: string, patch: Partial<WorkflowEntity>): Promise<WorkflowEntity | null>;
  delete(id: string): Promise<boolean>;
}

export interface RunListFilter {
  limit: number;
  offset: number;
}

export interface RunStore {
  createRun(data: Partial<WorkflowRunEntity>): Promise<WorkflowRunEntity>;
  findRunById(id: string): Promise<WorkflowRunEntity | null>;
  updateRun(id: string, patch: Partial<WorkflowRunEntity>): Promise<WorkflowRunEntity | null>;
  listRuns(
    workflowId: string,
    filter: RunListFilter,
  ): Promise<{ items: WorkflowRunEntity[]; total: number }>;
}

/* ---------- Mongo 实现 ---------- */

type RawDoc = Record<string, unknown> & { _id: { toHexString(): string } };

function toWorkflowEntity(raw: RawDoc): WorkflowEntity {
  const doc = raw as unknown as WorkflowDoc & { _id: { toHexString(): string } };
  return {
    id: doc._id.toHexString(),
    name: doc.name,
    description: doc.description ?? '',
    tags: doc.tags ?? [],
    favorite: doc.favorite ?? false,
    archived: doc.archived ?? false,
    nodes: (doc.nodes ?? []) as WorkflowEntity['nodes'],
    edges: (doc.edges ?? []) as WorkflowEntity['edges'],
    inputs: (doc.inputs ?? []) as WorkflowEntity['inputs'],
    outputs: (doc.outputs ?? []) as WorkflowEntity['outputs'],
    runConfig: doc.runConfig as WorkflowEntity['runConfig'],
    versions: (doc.versions ?? []) as WorkflowEntity['versions'],
    isTemplate: doc.isTemplate ?? false,
    diagnostic: doc.diagnostic as WorkflowEntity['diagnostic'],
    version: doc.version ?? 1,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
  };
}

function toRunEntity(raw: RawDoc): WorkflowRunEntity {
  const doc = raw as unknown as WorkflowRunDoc & { _id: { toHexString(): string } };
  return {
    id: doc._id.toHexString(),
    workflowId: doc.workflowId?.toHexString?.() ?? String(doc.workflowId ?? ''),
    workflowName: doc.workflowName ?? '',
    workflowVersion: doc.workflowVersion ?? 1,
    mode: (doc.mode ?? 'full') as WorkflowRunEntity['mode'],
    status: (doc.status ?? 'queued') as WorkflowRunEntity['status'],
    trigger: (doc.trigger ?? 'manual') as WorkflowRunEntity['trigger'],
    inputSummary: (doc.inputSummary ?? {}) as Record<string, unknown>,
    outputSummary: (doc.outputSummary ?? {}) as Record<string, unknown>,
    nodeResults: (doc.nodeResults ?? []) as WorkflowRunEntity['nodeResults'],
    logs: (doc.logs ?? []) as WorkflowRunEntity['logs'],
    handledNodes: (doc.handledNodes ?? []) as WorkflowRunEntity['handledNodes'],
    failedNodeId: doc.failedNodeId,
    error: doc.error,
    attempts: doc.attempts ?? 0,
    startedAt: doc.startedAt?.toISOString?.() ?? undefined,
    finishedAt: doc.finishedAt?.toISOString?.() ?? undefined,
    durationMs: doc.durationMs,
    createdAt: doc.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
    updatedAt: doc.updatedAt?.toISOString?.() ?? new Date(0).toISOString(),
  };
}

const SORT_MAP: Record<WorkflowSortField, string> = {
  updatedAt: 'updatedAt',
  name: 'name',
  createdAt: 'createdAt',
};

@Injectable()
export class MongoWorkflowStore implements WorkflowStore {
  constructor(@InjectModel(WORKFLOW_MODEL) private readonly model: Model<WorkflowDoc>) {}

  async list(filter: WorkflowListFilter): Promise<{ items: WorkflowEntity[]; total: number }> {
    const query: Record<string, unknown> = {};
    if (filter.q) {
      query.name = { $regex: escapeRegExp(filter.q), $options: 'i' };
    }
    if (filter.tag) query.tags = filter.tag;
    if (filter.favorite !== undefined) query.favorite = filter.favorite;
    if (filter.archived !== undefined) query.archived = filter.archived;
    if (filter.isTemplate !== undefined) query.isTemplate = filter.isTemplate;

    const sortDir = filter.order === 'asc' ? 1 : -1;
    const sort: Record<string, 1 | -1> = {
      [SORT_MAP[filter.sort]]: sortDir,
    };

    const [docs, total] = await Promise.all([
      this.model.find(query).sort(sort).skip(filter.offset).limit(filter.limit).lean().exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { items: docs.map((d) => toWorkflowEntity(d as unknown as RawDoc)), total };
  }

  async findById(id: string): Promise<WorkflowEntity | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? toWorkflowEntity(doc as unknown as RawDoc) : null;
  }

  async findByIds(ids: string[]): Promise<WorkflowEntity[]> {
    if (ids.length === 0) return [];
    const docs = await this.model
      .find({ _id: { $in: ids } })
      .lean()
      .exec();
    return docs.map((d) => toWorkflowEntity(d as unknown as RawDoc));
  }

  async create(data: Partial<WorkflowEntity>): Promise<WorkflowEntity> {
    const doc = await this.model.create({
      name: data.name ?? '未命名工作流',
      description: data.description ?? '',
      tags: data.tags ?? [],
      favorite: data.favorite ?? false,
      archived: data.archived ?? false,
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      inputs: data.inputs ?? [],
      outputs: data.outputs ?? [],
      runConfig: data.runConfig,
      versions: data.versions ?? [],
      isTemplate: data.isTemplate ?? false,
      diagnostic: data.diagnostic,
      version: data.version ?? 1,
    });
    return toWorkflowEntity(doc.toObject() as unknown as RawDoc);
  }

  async update(id: string, patch: Partial<WorkflowEntity>): Promise<WorkflowEntity | null> {
    const { id: _ignore, ...rest } = patch;
    void _ignore;
    const update: Record<string, unknown> = { $set: { ...rest } };
    const doc = await this.model
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .lean()
      .exec();
    return doc ? toWorkflowEntity(doc as unknown as RawDoc) : null;
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.model.findByIdAndDelete(id).exec();
    return res !== null;
  }
}

@Injectable()
export class MongoRunStore implements RunStore {
  constructor(@InjectModel(WORKFLOW_RUN_MODEL) private readonly model: Model<WorkflowRunDoc>) {}

  async createRun(data: Partial<WorkflowRunEntity>): Promise<WorkflowRunEntity> {
    const doc = await this.model.create({
      workflowId: data.workflowId,
      workflowName: data.workflowName ?? '',
      workflowVersion: data.workflowVersion ?? 1,
      mode: data.mode ?? 'full',
      status: data.status ?? 'queued',
      trigger: data.trigger ?? 'manual',
      inputSummary: data.inputSummary ?? {},
      outputSummary: data.outputSummary ?? {},
      nodeResults: data.nodeResults ?? [],
      logs: data.logs ?? [],
      handledNodes: data.handledNodes ?? [],
      failedNodeId: data.failedNodeId,
      error: data.error,
      attempts: data.attempts ?? 0,
      startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
      finishedAt: data.finishedAt ? new Date(data.finishedAt) : undefined,
      durationMs: data.durationMs,
    });
    return toRunEntity(doc.toObject() as unknown as RawDoc);
  }

  async findRunById(id: string): Promise<WorkflowRunEntity | null> {
    const doc = await this.model.findById(id).lean().exec();
    return doc ? toRunEntity(doc as unknown as RawDoc) : null;
  }

  async updateRun(
    id: string,
    patch: Partial<WorkflowRunEntity>,
  ): Promise<WorkflowRunEntity | null> {
    const { id: _ignore, ...rest } = patch;
    void _ignore;
    const update: Record<string, unknown> = {};
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (k === 'startedAt' || k === 'finishedAt') {
        set[k] = v ? new Date(v as string) : null;
      } else if (v !== undefined) {
        set[k] = v;
      }
    }
    if (Object.keys(set).length > 0) update.$set = set;
    const doc = await this.model.findByIdAndUpdate(id, update, { new: true }).lean().exec();
    return doc ? toRunEntity(doc as unknown as RawDoc) : null;
  }

  async listRuns(
    workflowId: string,
    filter: RunListFilter,
  ): Promise<{ items: WorkflowRunEntity[]; total: number }> {
    const query = { workflowId };
    const [docs, total] = await Promise.all([
      this.model
        .find(query)
        .sort({ startedAt: -1, createdAt: -1 })
        .skip(filter.offset)
        .limit(filter.limit)
        .lean()
        .exec(),
      this.model.countDocuments(query).exec(),
    ]);
    return { items: docs.map((d) => toRunEntity(d as unknown as RawDoc)), total };
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ---------- DI token ---------- */

export const WORKFLOW_STORE = Symbol('WORKFLOW_STORE');
export const RUN_STORE = Symbol('RUN_STORE');

export const workflowStoreProviders: Provider[] = [
  { provide: WORKFLOW_STORE, useClass: MongoWorkflowStore },
  { provide: RUN_STORE, useClass: MongoRunStore },
];
