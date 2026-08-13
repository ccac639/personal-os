/**
 * Workflow / WorkflowRun Mongoose Schema
 *
 * 图结构（nodes/edges）与契约（inputs/outputs/versions/diagnostic）使用 Mixed
 * 保留任意结构，由 service 层的严格校验（workflow.validation.ts）把关；
 * 此处只做顶层字段约束与索引。
 *
 * collection 命名与 apps/worker/src/jobs/workflows/schema.ts 保持一致。
 */
import { Schema, Types } from 'mongoose';

import type { WorkflowDiagnostic, WorkflowRunConfig } from './workflow.types.js';

export const WORKFLOW_MODEL = 'Workflow';
export const WORKFLOW_RUN_MODEL = 'WorkflowRun';

/** Workflow 文档形态 */
export interface WorkflowDoc {
  name: string;
  description: string;
  tags: string[];
  favorite: boolean;
  archived: boolean;
  /** 图结构（Mixed，结构校验在 service 层） */
  nodes: unknown[];
  edges: unknown[];
  inputs: unknown[];
  outputs: unknown[];
  runConfig: WorkflowRunConfig;
  versions: unknown[];
  isTemplate: boolean;
  diagnostic: WorkflowDiagnostic;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowSchema = new Schema<WorkflowDoc>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: '', maxlength: 2000 },
    tags: { type: [String], default: [] },
    favorite: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
    inputs: { type: [Schema.Types.Mixed], default: [] },
    outputs: { type: [Schema.Types.Mixed], default: [] },
    runConfig: { type: Schema.Types.Mixed },
    versions: { type: [Schema.Types.Mixed], default: [] },
    isTemplate: { type: Boolean, default: false },
    diagnostic: { type: Schema.Types.Mixed },
    version: { type: Number, default: 1 },
  },
  {
    collection: 'workflows',
    timestamps: true,
    versionKey: false,
  },
);

WorkflowSchema.index({ archived: 1, updatedAt: -1 });
WorkflowSchema.index({ tags: 1 });
WorkflowSchema.index({ isTemplate: 1 });
WorkflowSchema.index({ name: 'text' });

/** WorkflowRun 文档形态 */
export interface WorkflowRunDoc {
  workflowId: Types.ObjectId;
  workflowName: string;
  workflowVersion: number;
  mode: string;
  status: string;
  trigger: string;
  inputSummary: unknown;
  outputSummary: unknown;
  nodeResults: unknown[];
  logs: unknown[];
  handledNodes: unknown[];
  failedNodeId?: string;
  error?: string;
  attempts: number;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  createdAt: Date;
  updatedAt: Date;
}

export const WorkflowRunSchema = new Schema<WorkflowRunDoc>(
  {
    workflowId: { type: Types.ObjectId, ref: WORKFLOW_MODEL, required: true, index: true },
    workflowName: { type: String, required: true },
    workflowVersion: { type: Number, required: true, default: 1 },
    mode: { type: String, default: 'full' },
    status: {
      type: String,
      enum: ['queued', 'running', 'success', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    trigger: { type: String, enum: ['manual', 'api'], default: 'manual' },
    inputSummary: { type: Schema.Types.Mixed, default: {} },
    outputSummary: { type: Schema.Types.Mixed, default: {} },
    nodeResults: { type: [Schema.Types.Mixed], default: [] },
    logs: { type: [Schema.Types.Mixed], default: [] },
    handledNodes: { type: [Schema.Types.Mixed], default: [] },
    failedNodeId: { type: String },
    error: { type: String },
    attempts: { type: Number, default: 0 },
    startedAt: { type: Date },
    finishedAt: { type: Date },
    durationMs: { type: Number },
  },
  {
    collection: 'workflow_runs',
    timestamps: true,
    versionKey: false,
  },
);

WorkflowRunSchema.index({ workflowId: 1, startedAt: -1 });
