import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { createRunControl, runWorkflow, type RunSnapshot } from '@/features/workflows/runner';
import { useWorkflowStore } from '@/features/workflows/store';
import { getNodeDef, type WorkflowNodeModel } from '@/features/workflows/types';

const noSleep = () => Promise.resolve();

function mk(
  id: string,
  kind: WorkflowNodeModel['data']['kind'],
  overrides: Partial<WorkflowNodeModel['data']> = {},
): WorkflowNodeModel {
  const def = getNodeDef(kind);
  return {
    id,
    type: 'custom',
    position: { x: 0, y: 0 },
    data: { kind, label: def.label, status: 'idle', ...def.defaults, ...overrides },
  };
}

const chain: RunSnapshot = {
  nodes: [mk('n-1', 'trigger'), mk('n-2', 'ai'), mk('n-3', 'output')],
  edges: [
    { id: 'e-1', source: 'n-1', target: 'n-2', type: 'smoothstep' },
    { id: 'e-2', source: 'n-2', target: 'n-3', type: 'smoothstep' },
  ],
};

describe('workflow 断点 / 单步（runner 数据层）', () => {
  it('断点：执行前暂停并触发 onBreakpoint，继续后完成', async () => {
    const control = createRunControl();
    control.breakpoints.add('n-2');
    const hit: string[] = [];
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: noSleep,
        onBreakpoint: (id) => {
          hit.push(id);
          // 模拟 UI 延迟后点击「继续」
          setTimeout(() => control.resume(), 5);
        },
      },
    });
    expect(hit).toEqual(['n-2']);
    expect(result.status).toBe('success');
    expect(Object.keys(result.outputs)).toEqual(['n-1', 'n-2', 'n-3']);
    // 断点日志带节点关联（可定位）
    const bpLogs = result.logs.filter((l) => l.text.includes('命中断点'));
    expect(bpLogs.length).toBe(1);
    expect(bpLogs[0]!.nodeId).toBe('n-2');
  });

  it('单步：stepOnce 只执行一个节点后自动暂停（onPause 触发）', async () => {
    const control = createRunControl();
    control.paused = true; // 初始暂停
    const progress: string[] = [];
    let pauseProgress: string[] | null = null;
    const promise = runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: noSleep,
        onProgress: ({ nodeId, status }) => {
          if (status === 'running') progress.push(nodeId);
        },
        onPause: () => {
          pauseProgress = [...progress];
          // 模拟用户再次点击「继续」
          setTimeout(() => {
            control.paused = false;
          }, 5);
        },
      },
    });
    // 模拟用户点击一次「单步」
    control.stepOnce = true;
    control.paused = false;

    const result = await promise;
    // 单步暂停发生在恰好执行完第一个节点之后
    expect(pauseProgress).toEqual(['n-1']);
    expect(result.status).toBe('success');
    expect(progress).toEqual(['n-1', 'n-2', 'n-3']);
  });

  it('单步自动暂停语义：执行后 paused=true，等待 resume 才继续', async () => {
    const control = createRunControl();
    control.stepOnce = true;
    let observed: boolean | null = null;
    const result = await runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: noSleep,
        onProgress: ({ status }) => {
          if (status === 'success' && observed === null) {
            // 第一个节点执行完成后，单步暂停在同步后续 tick 生效
            setTimeout(() => {
              observed = control.paused;
              control.paused = false; // 放行
            }, 0);
          }
        },
      },
    });
    expect(observed).toBe(true);
    expect(result.status).toBe('success');
  });

  it('暂停 / 继续 / 取消 组合：暂停后可取消', async () => {
    const control = createRunControl();
    const promise = runWorkflow({
      snapshot: chain,
      mode: 'full',
      params: {},
      control,
      hooks: {
        sleep: () => new Promise((r) => setTimeout(r, 5)),
        onProgress: ({ status }) => {
          if (status === 'running') {
            control.paused = true;
            setTimeout(() => control.cancel(), 5);
          }
        },
      },
    });
    const result = await promise;
    expect(result.status).toBe('cancelled');
    expect(result.ok).toBe(false);
  });
});

describe('workflow store 断点 / 单步', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('toggleBreakpoint / hasBreakpoint 往返', () => {
    const store = useWorkflowStore();
    store.addNode('trigger'); // n-1
    expect(store.hasBreakpoint('n-1')).toBe(false);
    store.toggleBreakpoint('n-1');
    expect(store.hasBreakpoint('n-1')).toBe(true);
    expect([...store.breakpoints]).toEqual(['n-1']);
    store.toggleBreakpoint('n-1');
    expect(store.hasBreakpoint('n-1')).toBe(false);
  });

  it('运行：断点命中后 paused=true，继续后完成；单步执行一个节点', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 300, y: 0 });
    store.addNode('output', { x: 600, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    store.addEdge({ source: 'n-2', target: 'n-3' });
    store.toggleBreakpoint('n-2');

    const promise = store.runWorkflow('full');
    // 断点命中（n-2 执行前暂停）
    await waitUntil(() => store.paused && store.runningNodeId === 'n-2', '断点命中');
    expect(store.running).toBe(true);

    // 单步：执行 n-2 后自动暂停（n-3 不执行）
    store.stepRun();
    await waitUntil(
      () => store.nodes.find((n) => n.id === 'n-2')!.data.status === 'success',
      '单步执行 n-2',
    );
    await waitUntil(() => store.paused, '单步后暂停');

    // 继续：完成剩余
    store.resumeRun();
    await promise;
    expect(store.running).toBe(false);
    expect(store.activeLastRun?.status).toBe('success');
    expect(store.nodes.every((n) => n.data.status === 'success')).toBe(true);
  });

  it('单步按钮在未运行时无效', () => {
    const store = useWorkflowStore();
    store.stepRun();
    expect(store.running).toBe(false);
  });
});

/** 轮询等待条件成立（默认 60ms sleep 的竞态兜底） */
async function waitUntil(cond: () => boolean, label = '', timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error(`waitUntil 超时: ${label}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}
