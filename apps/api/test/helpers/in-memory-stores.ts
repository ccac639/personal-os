/**
 * 测试辅助：内存 WorkflowStore / RunStore / RunQueue（不依赖 MongoDB / Redis）
 */
import type {
  WorkflowEntity,
  WorkflowRunEntity,
} from '../../src/modules/workflows/workflow.types.js';
import { DEFAULT_RUN_CONFIG } from '../../src/modules/workflows/workflow.types.js';
import type {
  RunListFilter,
  RunStore,
  WorkflowListFilter,
  WorkflowStore,
} from '../../src/modules/workflows/workflow.store.js';
import type { RunQueuePort } from '../../src/modules/workflows/workflow.queue.js';

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export class InMemoryWorkflowStore implements WorkflowStore {
  items: WorkflowEntity[] = [];

  async list(filter: WorkflowListFilter) {
    let rows = this.items.filter((w) => w.archived === (filter.archived ?? false));
    if (filter.q) {
      rows = rows.filter((w) => w.name.toLowerCase().includes(filter.q!.toLowerCase()));
    }
    if (filter.tag) rows = rows.filter((w) => w.tags.includes(filter.tag!));
    if (filter.favorite !== undefined) rows = rows.filter((w) => w.favorite === filter.favorite);
    if (filter.isTemplate !== undefined) {
      rows = rows.filter((w) => w.isTemplate === filter.isTemplate);
    }
    const total = rows.length;
    const dir = filter.order === 'asc' ? 1 : -1;
    const key =
      filter.sort === 'name' ? 'name' : filter.sort === 'createdAt' ? 'createdAt' : 'updatedAt';
    rows = [...rows].sort((a, b) => {
      const av = a[key] as string;
      const bv = b[key] as string;
      return av.localeCompare(bv) * dir;
    });
    return {
      items: rows.slice(filter.offset, filter.offset + filter.limit),
      total,
    };
  }

  async findById(id: string): Promise<WorkflowEntity | null> {
    return this.items.find((w) => w.id === id) ?? null;
  }

  async findByIds(ids: string[]): Promise<WorkflowEntity[]> {
    return this.items.filter((w) => ids.includes(w.id));
  }

  async create(data: Partial<WorkflowEntity>): Promise<WorkflowEntity> {
    const now = new Date().toISOString();
    const entity: WorkflowEntity = {
      id: nextId('wf'),
      name: data.name ?? '未命名工作流',
      description: data.description ?? '',
      tags: data.tags ?? [],
      favorite: data.favorite ?? false,
      archived: data.archived ?? false,
      nodes: data.nodes ?? [],
      edges: data.edges ?? [],
      inputs: data.inputs ?? [],
      outputs: data.outputs ?? [],
      runConfig: data.runConfig ?? DEFAULT_RUN_CONFIG,
      versions: data.versions ?? [],
      isTemplate: data.isTemplate ?? false,
      diagnostic: data.diagnostic!,
      version: data.version ?? 1,
      createdAt: now,
      updatedAt: now,
    };
    this.items.push(entity);
    return entity;
  }

  async update(id: string, patch: Partial<WorkflowEntity>): Promise<WorkflowEntity | null> {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx < 0) return null;
    const current = this.items[idx]!;
    const updated: WorkflowEntity = {
      ...current,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.items[idx] = updated;
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.items.findIndex((w) => w.id === id);
    if (idx < 0) return false;
    this.items.splice(idx, 1);
    return true;
  }
}

export class InMemoryRunStore implements RunStore {
  runs: WorkflowRunEntity[] = [];

  async createRun(data: Partial<WorkflowRunEntity>): Promise<WorkflowRunEntity> {
    const now = new Date().toISOString();
    const entity: WorkflowRunEntity = {
      id: nextId('run'),
      workflowId: data.workflowId ?? '',
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
      attempts: data.attempts ?? 0,
      startedAt: data.startedAt,
      finishedAt: data.finishedAt,
      durationMs: data.durationMs,
      createdAt: now,
      updatedAt: now,
    };
    this.runs.push(entity);
    return entity;
  }

  async findRunById(id: string): Promise<WorkflowRunEntity | null> {
    return this.runs.find((r) => r.id === id) ?? null;
  }

  async updateRun(
    id: string,
    patch: Partial<WorkflowRunEntity>,
  ): Promise<WorkflowRunEntity | null> {
    const idx = this.runs.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const current = this.runs[idx]!;
    const updated: WorkflowRunEntity = {
      ...current,
      ...patch,
      id,
      updatedAt: new Date().toISOString(),
    };
    this.runs[idx] = updated;
    return updated;
  }

  async listRuns(workflowId: string, filter: RunListFilter) {
    const rows = this.runs.filter((r) => r.workflowId === workflowId);
    const total = rows.length;
    const sorted = [...rows].sort((a, b) => {
      const cmp = (b.startedAt ?? b.createdAt).localeCompare(a.startedAt ?? a.createdAt);
      // 同一毫秒创建时按 id 倒序，保证「最新在前」稳定
      return cmp !== 0 ? cmp : b.id.localeCompare(a.id);
    });
    return {
      items: sorted.slice(filter.offset, filter.offset + filter.limit),
      total,
    };
  }
}

export class FakeRunQueue implements RunQueuePort {
  enqueued: string[] = [];
  removed: string[] = [];
  failEnqueue = false;

  async enqueue(runId: string): Promise<void> {
    if (this.failEnqueue) throw new Error('redis down');
    this.enqueued.push(runId);
  }

  async remove(runId: string): Promise<void> {
    this.removed.push(runId);
  }
}

/** 构建最小合法工作流 payload（trigger → output） */
export function buildWorkflowPayload(
  overrides: Partial<Parameters<InMemoryWorkflowStore['create']>[0]> = {},
) {
  return {
    name: '测试工作流',
    description: 'desc',
    tags: ['test'],
    nodes: [
      { id: 'n-1', data: { kind: 'trigger', label: '触发' } },
      { id: 'n-2', data: { kind: 'output', label: '输出', outputName: 'result', format: 'text' } },
    ],
    edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
    inputs: [],
    outputs: [{ name: 'result', type: 'text', source: 'n-2' }],
    ...overrides,
  };
}
