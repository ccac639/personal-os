/**
 * Worker 测试共用 fixture 构建器
 */
import type {
  WorkflowEdgeModel,
  WorkflowInputDef,
  WorkflowNodeModel,
  WorkflowOutputDef,
  WorkflowSnapshot,
} from '../../src/jobs/workflows/index.js';

export type FixtureNode = Partial<WorkflowNodeModel['data']> & { id: string };

export function node(id: string, data: Record<string, unknown>): WorkflowNodeModel {
  return { id, data: { label: id, ...data } as WorkflowNodeModel['data'] };
}

export function edge(id: string, source: string, target: string): WorkflowEdgeModel {
  return { id, source, target };
}

export function inputDef(name: string, opts: Partial<WorkflowInputDef> = {}): WorkflowInputDef {
  return { name, label: name, type: 'text', required: false, ...opts };
}

export function outputDef(name: string, source: string): WorkflowOutputDef {
  return { name, type: 'text', source };
}

export interface SnapshotOpts {
  id?: string;
  name?: string;
  version?: number;
  nodes?: WorkflowNodeModel[];
  edges?: WorkflowEdgeModel[];
  inputs?: WorkflowInputDef[];
  outputs?: WorkflowOutputDef[];
  runConfig?: Partial<WorkflowSnapshot['runConfig']>;
}

export function snapshot(opts: SnapshotOpts = {}): WorkflowSnapshot {
  return {
    id: opts.id ?? 'wf-1',
    name: opts.name ?? '测试工作流',
    version: opts.version ?? 1,
    nodes: opts.nodes ?? [],
    edges: opts.edges ?? [],
    inputs: opts.inputs ?? [],
    outputs: opts.outputs ?? [],
    runConfig: {
      maxSteps: 1000,
      timeoutMs: 60_000,
      failStrategy: 'stop',
      allowManualRun: true,
      ...opts.runConfig,
    },
  };
}

/** 简单链：trigger → prompt → output */
export function simpleChainSnapshot(opts: SnapshotOpts = {}): WorkflowSnapshot {
  return snapshot({
    ...opts,
    nodes: [
      node('n1', { kind: 'trigger', cron: '0 9 * * *' }),
      node('n2', { kind: 'prompt', template: '你好 {{name}}' }),
      node('n3', { kind: 'output', outputName: 'result' }),
    ],
    edges: [edge('e1', 'n1', 'n2'), edge('e2', 'n2', 'n3')],
    inputs: [inputDef('name', { required: true })],
    outputs: [outputDef('greeting', 'n2.text')],
  });
}
