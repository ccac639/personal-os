/**
 * 工作流服务：CRUD / 复制 / 模板 / 版本快照与恢复 / 导入导出 / 子流程环检测
 *
 * 依赖 WorkflowStore 接口（Mongo 实现生产使用，内存实现供测试）。
 */
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type {
  WorkflowDiagnostic,
  WorkflowEdgeModel,
  WorkflowEntity,
  WorkflowExportPayload,
  WorkflowNodeModel,
  WorkflowRunConfig,
  WorkflowVersionEntry,
} from './workflow.types.js';
import { DEFAULT_RUN_CONFIG, RUN_LIMITS } from './workflow.types.js';
import { validateWorkflowPayload } from './workflow.validation.js';
import { WORKFLOW_STORE, type WorkflowListFilter, type WorkflowStore } from './workflow.store.js';

/** 工作流元数据（不含结构） */
export interface WorkflowMetaPatch {
  name?: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
}

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(WORKFLOW_STORE) private readonly store: WorkflowStore,
  ) {}

  async list(filter: Partial<WorkflowListFilter> = {}) {
    const f: WorkflowListFilter = {
      q: filter.q,
      tag: filter.tag,
      favorite: filter.favorite,
      archived: filter.archived ?? false,
      isTemplate: filter.isTemplate,
      sort: filter.sort ?? 'updatedAt',
      order: filter.order ?? 'desc',
      limit: Math.min(Math.max(filter.limit ?? 50, 1), 200),
      offset: Math.max(filter.offset ?? 0, 0),
    };
    return this.store.list(f);
  }

  async get(id: string): Promise<WorkflowEntity> {
    const entity = await this.store.findById(id);
    if (!entity) throw new NotFoundException(`工作流不存在：${id}`);
    return entity;
  }

  /** 创建：严格校验结构，写入诊断摘要 */
  async create(body: WorkflowPayloadInput): Promise<WorkflowEntity> {
    const payload = normalizePayload(body);
    const { result, diagnostic } = validateWorkflowPayload(payload);
    if (!result.ok) {
      throw new BadRequestException(`工作流结构校验失败：${result.errors.join('；')}`);
    }
    // 子流程引用 soft check：引用不存在的工作流 → 警告（不拒绝）
    const warnings = await this.collectSubflowWarnings(payload.nodes ?? []);
    const diag = mergeDiagnostic(diagnostic, warnings);
    const entity = await this.store.create({
      name: payload.name ?? '未命名工作流',
      description: payload.description ?? '',
      tags: payload.tags ?? [],
      nodes: payload.nodes ?? [],
      edges: payload.edges ?? [],
      inputs: payload.inputs ?? [],
      outputs: payload.outputs ?? [],
      runConfig: { ...DEFAULT_RUN_CONFIG, ...(payload.runConfig ?? {}) },
      versions: [],
      isTemplate: payload.isTemplate ?? false,
      diagnostic: diag,
      version: 1,
    });
    return entity;
  }

  /**
   * 更新：支持元数据与结构（nodes/edges 合并当前值校验）。
   * 结构变化时重算诊断并递增 version seq。
   */
  async update(id: string, body: WorkflowPayloadInput): Promise<WorkflowEntity> {
    const current = await this.get(id);
    const payload = normalizePayload(body);
    const merged: {
      name: string;
      description: string;
      tags: string[];
      favorite: boolean;
      archived: boolean;
      isTemplate: boolean;
      nodes: WorkflowNodeModel[];
      edges: WorkflowEdgeModel[];
      inputs: WorkflowEntity['inputs'];
      outputs: WorkflowEntity['outputs'];
      runConfig: WorkflowRunConfig;
    } = {
      name: payload.name ?? current.name,
      description: payload.description ?? current.description,
      tags: payload.tags ?? current.tags,
      favorite: payload.favorite ?? current.favorite,
      archived: payload.archived ?? current.archived,
      isTemplate: payload.isTemplate ?? current.isTemplate,
      nodes: payload.nodes ?? current.nodes,
      edges: payload.edges ?? current.edges,
      inputs: payload.inputs ?? current.inputs,
      outputs: payload.outputs ?? current.outputs,
      runConfig: { ...DEFAULT_RUN_CONFIG, ...(payload.runConfig ?? current.runConfig) },
    };

    const structureChanged =
      payload.nodes !== undefined ||
      payload.edges !== undefined ||
      payload.inputs !== undefined ||
      payload.outputs !== undefined ||
      payload.runConfig !== undefined;

    const { result, diagnostic } = validateWorkflowPayload(merged);
    if (!result.ok) {
      throw new BadRequestException(`工作流结构校验失败：${result.errors.join('；')}`);
    }

    // 子流程环检测（结构变化时）：从本工作流出发的引用闭包无环、深度受限
    if (structureChanged && merged.nodes.length > 0) {
      await this.assertNoSubflowCycle(id, merged.nodes);
    }
    const warnings = await this.collectSubflowWarnings(merged.nodes);
    const diag = mergeDiagnostic(diagnostic, warnings);

    const patch: Partial<WorkflowEntity> = {
      ...merged,
      diagnostic: diag,
      version: structureChanged ? current.version + 1 : current.version,
    };
    const updated = await this.store.update(id, patch);
    if (!updated) throw new NotFoundException(`工作流不存在：${id}`);
    return updated;
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const deleted = await this.store.delete(id);
    if (!deleted) throw new NotFoundException(`工作流不存在：${id}`);
    return { deleted };
  }

  /** 复制：保留结构，清空版本历史与状态标记，名称加「副本」 */
  async duplicate(id: string): Promise<WorkflowEntity> {
    const current = await this.get(id);
    return this.store.create({
      name: `${current.name} 副本`,
      description: current.description,
      tags: current.tags,
      nodes: current.nodes,
      edges: current.edges,
      inputs: current.inputs,
      outputs: current.outputs,
      runConfig: current.runConfig,
      versions: [],
      isTemplate: false,
      diagnostic: current.diagnostic,
      version: 1,
    });
  }

  /** 模板标记 */
  async setTemplate(id: string, isTemplate: boolean): Promise<WorkflowEntity> {
    const updated = await this.store.update(id, { isTemplate });
    if (!updated) throw new NotFoundException(`工作流不存在：${id}`);
    return updated;
  }

  /** 创建版本快照（截断上限，丢最旧） */
  async createVersion(id: string, summary: string): Promise<WorkflowEntity> {
    const current = await this.get(id);
    const entry: WorkflowVersionEntry = {
      id: randomId(),
      summary: summary.trim() || `版本 ${current.version}`,
      createdAt: Date.now(),
      nodes: current.nodes,
      edges: current.edges,
      seq: current.version,
    };
    const versions = [...current.versions, entry];
    if (versions.length > RUN_LIMITS.MAX_VERSIONS) {
      versions.splice(0, versions.length - RUN_LIMITS.MAX_VERSIONS);
    }
    const updated = await this.store.update(id, { versions });
    if (!updated) throw new NotFoundException(`工作流不存在：${id}`);
    return updated;
  }

  /** 恢复版本快照（恢复 nodes/edges，version 递增） */
  async restoreVersion(id: string, versionId: string): Promise<WorkflowEntity> {
    const current = await this.get(id);
    const entry = current.versions.find((v) => v.id === versionId);
    if (!entry) throw new NotFoundException(`版本不存在：${versionId}`);

    const merged = {
      ...current,
      nodes: entry.nodes,
      edges: entry.edges,
    };
    const { result, diagnostic } = validateWorkflowPayload(merged);
    if (!result.ok) {
      throw new BadRequestException(
        `版本快照结构校验失败：${result.errors.join('；')}（快照可能已损坏）`,
      );
    }
    await this.assertNoSubflowCycle(id, entry.nodes);
    const warnings = await this.collectSubflowWarnings(entry.nodes);
    const diag = mergeDiagnostic(diagnostic, warnings);

    const updated = await this.store.update(id, {
      nodes: entry.nodes,
      edges: entry.edges,
      diagnostic: diag,
      version: current.version + 1,
    });
    if (!updated) throw new NotFoundException(`工作流不存在：${id}`);
    return updated;
  }

  /** 导出：返回可导入的 JSON 结构 */
  async exportWorkflow(id: string): Promise<WorkflowExportPayload> {
    const current = await this.get(id);
    return {
      format: 'personal-os-workflow',
      version: 1,
      name: current.name,
      description: current.description,
      tags: current.tags,
      nodes: current.nodes,
      edges: current.edges,
      inputs: current.inputs,
      outputs: current.outputs,
      runConfig: current.runConfig,
      exportedAt: Date.now(),
    };
  }

  /** 导入：严格校验后创建 */
  async importWorkflow(payload: WorkflowPayloadInput): Promise<WorkflowEntity> {
    return this.create(payload);
  }

  /* ---------- 内部 ---------- */

  /**
   * 子流程环检测：从本工作流出发，沿 subworkflow 引用（含库中已存在的工作流）
   * 做闭包 DFS。命中环或超过嵌套深度上限 → 拒绝。
   */
  private async assertNoSubflowCycle(
    workflowId: string,
    nodes: WorkflowNodeModel[],
  ): Promise<void> {
    // 待访问队列：[workflowId, 引用它的工作流 id, 当前深度]
    const queue: Array<{ id: string; from: string; depth: number }> = [];
    const visited = new Set<string>();

    const directRefs = collectSubflowRefs(nodes);
    for (const ref of directRefs) {
      if (ref === workflowId) {
        throw new BadRequestException(`工作流不能作为自身的子流程（检测到循环引用）`);
      }
      queue.push({ id: ref, from: workflowId, depth: 1 });
    }

    while (queue.length > 0) {
      const { id, from, depth } = queue.shift()!;
      if (depth > RUN_LIMITS.MAX_SUBFLOW_DEPTH) {
        throw new BadRequestException(
          `子流程嵌套深度超过上限 ${RUN_LIMITS.MAX_SUBFLOW_DEPTH}（引用链：${from} → ${id}）`,
        );
      }
      if (visited.has(id)) continue;
      // 环检测：链上已访问过该工作流
      if (id === workflowId) {
        throw new BadRequestException(`检测到循环子流程引用：${from} → ${id}`);
      }
      visited.add(id);
      const refs = await this.collectRefsOf(id);
      for (const ref of refs) {
        queue.push({ id: ref, from: id, depth: depth + 1 });
      }
    }
  }

  /** 收集某工作流的 subworkflow 引用（不存在则返回空） */
  private async collectRefsOf(workflowId: string): Promise<string[]> {
    const entity = await this.store.findById(workflowId);
    if (!entity) return [];
    return collectSubflowRefs(entity.nodes);
  }

  /** 子流程引用 soft check：引用不存在的工作流 → 警告 */
  private async collectSubflowWarnings(nodes: WorkflowNodeModel[]): Promise<string[]> {
    const refs = collectSubflowRefs(nodes);
    const warnings: string[] = [];
    for (const ref of refs) {
      const target = await this.store.findById(ref);
      if (!target) {
        warnings.push(`子流程引用的工作流「${ref}」不存在（创建后可在运行时解析）`);
      }
    }
    return warnings;
  }
}

/* ---------- 工具 ---------- */

export interface WorkflowPayloadInput {
  name?: string;
  description?: string;
  tags?: string[];
  favorite?: boolean;
  archived?: boolean;
  isTemplate?: boolean;
  nodes?: WorkflowNodeModel[];
  edges?: WorkflowEdgeModel[];
  inputs?: WorkflowEntity['inputs'];
  outputs?: WorkflowEntity['outputs'];
  runConfig?: Partial<WorkflowRunConfig>;
  [key: string]: unknown;
}

function normalizePayload(body: WorkflowPayloadInput): WorkflowPayloadInput {
  if (!body || typeof body !== 'object') {
    throw new BadRequestException('请求体必须是对象');
  }
  // 仅挑选已知字段（防止注入无关字段）
  const out: WorkflowPayloadInput = {};
  for (const key of [
    'name',
    'description',
    'tags',
    'favorite',
    'archived',
    'isTemplate',
    'nodes',
    'edges',
    'inputs',
    'outputs',
    'runConfig',
  ] as const) {
    const v = body[key];
    if (v !== undefined) out[key] = v as never;
  }
  if (out.runConfig === undefined) out.runConfig = { ...DEFAULT_RUN_CONFIG };
  return out;
}

function collectSubflowRefs(nodes: WorkflowNodeModel[]): string[] {
  const refs: string[] = [];
  for (const node of nodes) {
    const data = node?.data;
    if (data && data.kind === 'subworkflow' && typeof data.workflowRef === 'string') {
      refs.push(data.workflowRef);
    }
  }
  return refs;
}

function mergeDiagnostic(
  diagnostic: WorkflowDiagnostic,
  warnings: string[],
): WorkflowDiagnostic {
  return { ...diagnostic, warnings: [...diagnostic.warnings, ...warnings] };
}

function randomId(): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `v-${Date.now().toString(36)}-${rand}`;
}
