import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { filterLogs, matchesLevel, matchesNode, matchesTime } from '@/features/workflows/logs';
import type { RunLogEntry } from '@/features/workflows/types';
import { useWorkflowStore } from '@/features/workflows/store';

function entry(
  id: number,
  level: RunLogEntry['level'],
  text: string,
  nodeId: string | undefined,
  ts: number,
): RunLogEntry {
  return { id, level, text, nodeId, ts };
}

const entries: RunLogEntry[] = [
  entry(0, 'run', 'RUN 触发', 'n-1', 1000),
  entry(1, 'info', '定时触发', 'n-1', 1050),
  entry(2, 'run', 'RUN AI', 'n-2', 1100),
  entry(3, 'success', '生成完成', 'n-2', 2000),
  entry(4, 'warn', '缺失变量 role', 'n-2', 12000),
  entry(5, 'error', '运行失败', 'n-3', 12500),
  entry(6, 'info', '无节点关联信息', undefined, 13000),
];

describe('workflow 日志筛选（纯函数）', () => {
  it('级别筛选：all / error / warn（含 error）/ info（含 success、run）', () => {
    expect(matchesLevel(entries[0]!, 'all')).toBe(true);
    expect(matchesLevel(entries[5]!, 'error')).toBe(true);
    expect(matchesLevel(entries[4]!, 'error')).toBe(false);
    expect(matchesLevel(entries[4]!, 'warn')).toBe(true);
    expect(matchesLevel(entries[5]!, 'warn')).toBe(true); // warn 包含 error
    expect(matchesLevel(entries[1]!, 'info')).toBe(true);
    expect(matchesLevel(entries[0]!, 'info')).toBe(true); // run 归入 info
    expect(matchesLevel(entries[5]!, 'info')).toBe(false);
  });

  it('节点筛选：指定节点 / 无节点关联 / 全部', () => {
    expect(matchesNode(entries[3]!, 'n-2')).toBe(true);
    expect(matchesNode(entries[1]!, 'n-2')).toBe(false);
    expect(matchesNode(entries[6]!, 'none')).toBe(true);
    expect(matchesNode(entries[1]!, 'none')).toBe(false);
    expect(matchesNode(entries[1]!, '')).toBe(true);
  });

  it('时间筛选：相对运行起点（第一条日志 ts）', () => {
    const firstTs = entries[0]!.ts; // 1000
    expect(matchesTime(entries[3]!, '10', firstTs)).toBe(true); // 1000ms 内
    expect(matchesTime(entries[4]!, '10', firstTs)).toBe(false); // 11000ms
    expect(matchesTime(entries[4]!, '30', firstTs)).toBe(true);
    expect(matchesTime(entries[5]!, 'all', firstTs)).toBe(true);
    // 无时间戳的条目默认保留
    expect(matchesTime({ id: 99, level: 'info', text: 'x' }, '10', firstTs)).toBe(true);
  });

  it('filterLogs 组合筛选', () => {
    const out = filterLogs(entries, { level: 'warn', node: 'n-2', time: 'all' });
    expect(out.map((e) => e.id)).toEqual([4]);

    const errs = filterLogs(entries, { level: 'error', node: '', time: 'all' });
    expect(errs.map((e) => e.id)).toEqual([5]);

    const early = filterLogs(entries, { level: 'all', node: '', time: '10' });
    expect(early.map((e) => e.id)).toEqual([0, 1, 2, 3]);
  });
});

describe('workflow 日志（store 层）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('运行日志条目带 ts 与 nodeId，导出 JSON 含时间戳', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');

    expect(store.runEntries.length).toBeGreaterThan(0);
    // 每条日志都带时间戳
    expect(store.runEntries.every((e) => typeof e.ts === 'number')).toBe(true);
    // 带节点关联的日志可用于定位
    const nodeLogs = store.runEntries.filter((e) => e.nodeId !== undefined);
    expect(nodeLogs.length).toBeGreaterThan(0);

    const json = JSON.parse(store.exportRunResult());
    expect(Array.isArray(json.logs)).toBe(true);
    expect(json.logs.every((l: { ts: unknown }) => typeof l.ts === 'number')).toBe(true);
    expect(json.workflow).toBe('未命名工作流');
  });

  it('运行输出写回 runOutputs，供变量浏览器使用', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('ai', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');

    expect(store.runOutputs['n-1']).toBeTruthy();
    expect(store.runOutputs['n-2']).toBeTruthy();
    expect(store.runOutputs.previous).toBeTruthy();
  });
});
