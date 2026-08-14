/**
 * 运行服务测试：创建运行 / 入队 / 取消 / 日志 / 历史 / 脱敏
 */
import { describe, expect, it } from 'vitest';

import { WorkflowRunService } from '../src/modules/workflows/workflow-run.service.js';
import {
  buildWorkflowPayload,
  FakeRunQueue,
  InMemoryRunStore,
  InMemoryWorkflowStore,
} from './helpers/in-memory-stores.js';

function createEnv() {
  const workflowStore = new InMemoryWorkflowStore();
  const runStore = new InMemoryRunStore();
  const queue = new FakeRunQueue();
  const service = new WorkflowRunService(workflowStore, runStore, queue);
  return { workflowStore, runStore, queue, service };
}

describe('WorkflowRunService', () => {
  it('创建运行：预检通过 → 落库 queued → 入队', async () => {
    const { workflowStore, runStore, queue, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    const run = await service.createRun(wf.id, {
      params: { variables: { input: 'hello' } },
    });
    expect(run.status).toBe('queued');
    expect(run.workflowId).toBe(wf.id);
    expect(run.workflowVersion).toBe(wf.version);
    expect(run.inputSummary.input).toBe('hello');
    expect(queue.enqueued).toEqual([run.id]);
    expect(runStore.runs).toHaveLength(1);
  });

  it('创建运行：必填输入缺失 → 预检失败拒绝', async () => {
    const { workflowStore, service } = createEnv();
    const wf = await workflowStore.create(
      buildWorkflowPayload({
        inputs: [{ name: 'required_text', label: '必填', type: 'text', required: true }],
      }),
    );
    await expect(service.createRun(wf.id, {})).rejects.toThrow(/运行预检失败/);
  });

  it('创建运行：输出引用不存在 → 预检失败拒绝', async () => {
    const { workflowStore, service } = createEnv();
    const wf = await workflowStore.create(
      buildWorkflowPayload({
        outputs: [{ name: 'out', type: 'text', source: 'n-99' }],
      }),
    );
    await expect(service.createRun(wf.id, {})).rejects.toThrow(/运行预检失败/);
  });

  it('创建运行：归档工作流被拒绝', async () => {
    const { workflowStore, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    await workflowStore.update(wf.id, { archived: true });
    await expect(service.createRun(wf.id, {})).rejects.toThrow(/归档/);
  });

  it('创建运行：入队失败 → 标记 failed 并抛错', async () => {
    const { workflowStore, runStore, queue, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    queue.failEnqueue = true;
    await expect(service.createRun(wf.id, {})).rejects.toThrow(/队列不可用/);
    const run = runStore.runs[0]!;
    expect(run.status).toBe('failed');
    expect(run.error).toContain('入队失败');
  });

  it('创建运行：输入摘要脱敏（密钥字段不落库）', async () => {
    const { workflowStore, runStore, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    await service.createRun(wf.id, {
      params: { variables: { apiKey: 'sk-secret-value', text: 'ok' } },
    });
    const run = runStore.runs[0]!;
    expect(run.inputSummary.apiKey).toBe('[REDACTED]');
    expect(run.inputSummary.text).toBe('ok');
    expect(JSON.stringify(run)).not.toContain('sk-secret-value');
  });

  it('运行详情与历史', async () => {
    const { workflowStore, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    const run1 = await service.createRun(wf.id, {});
    const run2 = await service.createRun(wf.id, {});
    const detail = await service.getRun(run1.id);
    expect(detail.id).toBe(run1.id);
    const history = await service.listRuns(wf.id, {});
    expect(history.total).toBe(2);
    expect(history.items[0]!.id).toBe(run2.id); // 最新在前
  });

  it('取消：queued 运行 → cancelled + 队列移除', async () => {
    const { workflowStore, queue, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    const run = await service.createRun(wf.id, {});
    const cancelled = await service.cancelRun(run.id);
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.finishedAt).toBeDefined();
    expect(queue.removed).toContain(run.id);
  });

  it('取消：已结束运行 → 拒绝', async () => {
    const { workflowStore, runStore, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    const run = await service.createRun(wf.id, {});
    await runStore.updateRun(run.id, { status: 'success', finishedAt: new Date().toISOString() });
    await expect(service.cancelRun(run.id)).rejects.toThrow(/无法取消/);
  });

  it('日志分页', async () => {
    const { workflowStore, runStore, service } = createEnv();
    const wf = await workflowStore.create(buildWorkflowPayload());
    const run = await service.createRun(wf.id, {});
    await runStore.updateRun(run.id, {
      logs: [
        { id: 0, level: 'run', text: 'a', ts: 1 },
        { id: 1, level: 'info', text: 'b', ts: 2 },
        { id: 2, level: 'success', text: 'c', ts: 3 },
      ],
    });
    const page1 = await service.getLogs(run.id, { limit: 2, offset: 0 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    const page2 = await service.getLogs(run.id, { limit: 2, offset: 2 });
    expect(page2.items).toHaveLength(1);
    expect(page2.items[0]!.text).toBe('c');
  });

  it('不存在的运行 → 404', async () => {
    const { service } = createEnv();
    await expect(service.getRun('nope')).rejects.toThrow(/运行不存在/);
  });
});
