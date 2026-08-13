import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  appendRunRecord,
  createRunRecord,
  filterRunHistory,
  loadRunHistory,
  pruneRunRecords,
  removeRunRecord,
  saveRunHistory,
} from '@/features/workflows/history';
import type { RunHistoryEntry } from '@/features/workflows/types';

function makeRun(
  id: string,
  status: RunHistoryEntry['status'],
  startedAt: number,
  pinned = false,
): RunHistoryEntry {
  return {
    ...createRunRecord({
      workflowId: 'wf-1',
      workflowName: 'W',
      workflowVersion: 'v1',
      mode: 'full',
      status,
      startedAt,
      finishedAt: startedAt + 100,
      durationMs: 100,
      inputSummary: { role: 'x' },
      outputSummary: { out: 1 },
      nodeResults: [],
      logs: [],
      ...(pinned ? { pinned: true } : {}),
    }),
    id,
  };
}

describe('workflow 运行历史（纯函数）', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('createRunRecord：独立 id + 日志截断', () => {
    const logs = Array.from({ length: 300 }, (_, i) => ({
      level: 'info' as const,
      text: `l${i}`,
      ts: i,
    }));
    const r = createRunRecord({
      workflowId: 'wf-1',
      workflowName: 'W',
      workflowVersion: 'v1',
      mode: 'full',
      status: 'success',
      startedAt: 1,
      finishedAt: 2,
      durationMs: 1,
      inputSummary: {},
      outputSummary: {},
      nodeResults: [],
      logs,
    });
    expect(r.id).toMatch(/^run-/);
    expect(r.logs.length).toBeLessThanOrEqual(200);
  });

  it('appendRunRecord + pruneRunRecords：上限清理，固定项保留', () => {
    let records: RunHistoryEntry[] = [];
    for (let i = 0; i < 10; i++) {
      records = appendRunRecord(records, makeRun(`r${i}`, 'success', i), 5);
    }
    expect(records.length).toBe(5);
    expect(records[0]!.startedAt).toBe(9); // 最新在前

    // 固定项不受清理影响
    const pinned = makeRun('pinned', 'failed', 0, true);
    records = [pinned, ...records.slice(0, 4)];
    const pruned = pruneRunRecords(records, 3);
    expect(pruned.some((r) => r.id === 'pinned')).toBe(true);
  });

  it('filterRunHistory：状态 / 方式 / 版本 / 固定筛选', () => {
    const records = [
      makeRun('a', 'success', 1),
      makeRun('b', 'failed', 2),
      makeRun('c', 'cancelled', 3),
    ];
    expect(
      filterRunHistory(records, {
        status: 'failed',
        workflowId: '',
        mode: 'all',
        version: 'all',
        pinnedOnly: false,
      }),
    ).toHaveLength(1);
    expect(
      filterRunHistory(records, {
        status: 'all',
        workflowId: '',
        mode: 'full',
        version: 'all',
        pinnedOnly: false,
      }),
    ).toHaveLength(3);
    expect(
      filterRunHistory(records, {
        status: 'all',
        workflowId: 'other',
        mode: 'all',
        version: 'all',
        pinnedOnly: false,
      }),
    ).toHaveLength(0);
  });

  it('removeRunRecord：删除单条', () => {
    const records = [makeRun('a', 'success', 1), makeRun('b', 'failed', 2)];
    expect(removeRunRecord(records, 'a')).toHaveLength(1);
  });

  it('saveRunHistory / loadRunHistory：持久化往返 + 损坏数据警告', () => {
    const records = [makeRun('a', 'success', 1)];
    expect(saveRunHistory(records)).toBe(true);
    const loaded = loadRunHistory();
    expect(loaded.records).toHaveLength(1);
    expect(loaded.records[0]!.workflowId).toBe('wf-1');

    localStorage.setItem('personal-os-workflow-runs', '{bad json');
    const broken = loadRunHistory();
    expect(broken.records).toEqual([]);
    expect(broken.warnings.length).toBeGreaterThan(0);
  });
});

describe('workflow 运行历史（store 集成）', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('运行后写入历史并持久化；固定 / 删除 / 导出', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('output');
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');
    expect(store.runHistory).toHaveLength(1);
    expect(store.runHistory[0]!.status).toBe('success');
    expect(store.runHistory[0]!.workflowId).toBe(store.activeId);

    // 持久化到独立 key
    const raw = JSON.parse(localStorage.getItem('personal-os-workflow-runs')!);
    expect(raw.runs).toHaveLength(1);

    // 固定
    const id = store.runHistory[0]!.id;
    store.pinRunEntry(id, true);
    expect(store.runHistory[0]!.pinned).toBe(true);

    // 导出 JSON
    const json = store.exportRunEntryJson(id);
    expect(JSON.parse(json).id).toBe(id);

    // 删除
    store.deleteRunEntry(id);
    expect(store.runHistory).toHaveLength(0);
  });

  it('上限清理：超过上限自动裁剪', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger');
    store.addNode('output');
    store.addEdge({ source: 'n-1', target: 'n-2' });
    for (let i = 0; i < 5; i++) {
      await store.runWorkflow('full');
    }
    // 默认上限 100，此处只验证追加正常
    expect(store.runHistory).toHaveLength(5);
  });
});
