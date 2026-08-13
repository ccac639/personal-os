/**
 * Worker 端 Workflow / WorkflowRun Mongoose Schema
 * collection 命名与字段与 apps/api/src/modules/workflows/workflow.schema.ts 保持一致。
 */
import { Schema, Types, model, models, type Model } from 'mongoose';

export interface WorkflowDoc {
  name: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  nodes?: unknown[];
  edges?: unknown[];
  inputs?: unknown[];
  outputs?: unknown[];
  runConfig?: unknown;
  version?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WorkflowSchema = new Schema<WorkflowDoc>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    tags: { type: [String], default: [] },
    favorite: { type: Boolean, default: false },
    archived: { type: Boolean, default: false },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    edges: { type: [Schema.Types.Mixed], default: [] },
    inputs: { type: [Schema.Types.Mixed], default: [] },
    outputs: { type: [Schema.Types.Mixed], default: [] },
    runConfig: { type: Schema.Types.Mixed },
    version: { type: Number, default: 1 },
  },
  { collection: 'workflows', timestamps: true, versionKey: false },
);

export interface WorkflowRunDoc {
  workflowId: Types.ObjectId;
  workflowName: string;
  workflowVersion: number;
  mode?: string;
  status: string;
  trigger?: string;
  inputSummary?: unknown;
  outputSummary?: unknown;
  nodeResults?: unknown[];
  logs?: unknown[];
  handledNodes?: unknown[];
  failedNodeId?: string;
  error?: string;
  attempts?: number;
  startedAt?: Date;
  finishedAt?: Date;
  durationMs?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export const WorkflowRunSchema = new Schema<WorkflowRunDoc>(
  {
    workflowId: { type: Types.ObjectId, ref: 'Workflow', required: true, index: true },
    workflowName: { type: String, required: true },
    workflowVersion: { type: Number, default: 1 },
    mode: { type: String, default: 'full' },
    status: {
      type: String,
      enum: ['queued', 'running', 'success', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    trigger: { type: String, default: 'manual' },
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
  { collection: 'workflow_runs', timestamps: true, versionKey: false },
);

WorkflowRunSchema.index({ workflowId: 1, startedAt: -1 });

/** 获取（或注册）Worker 端 Model（进程内单例，避免 OverwriteModelError） */
export function getWorkflowModel(): Model<WorkflowDoc> {
  const cached = (models as Record<string, unknown>)['Workflow'];
  if (cached) return cached as Model<WorkflowDoc>;
  return model<WorkflowDoc>('Workflow', WorkflowSchema);
}

export function getWorkflowRunModel(): Model<WorkflowRunDoc> {
  const cached = (models as Record<string, unknown>)['WorkflowRun'];
  if (cached) return cached as Model<WorkflowRunDoc>;
  return model<WorkflowRunDoc>('WorkflowRun', WorkflowRunSchema);
}
