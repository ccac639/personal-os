/**
 * 工作流服务测试：CRUD / 复制 / 模板 / 版本创建与恢复 / 导入导出 / 子流程环
 */
import { describe, expect, it } from 'vitest';

import { WorkflowService } from '../src/modules/workflows/workflow.service.js';
import { buildWorkflowPayload, InMemoryWorkflowStore } from './helpers/in-memory-stores.js';

function createService() {
  const store = new InMemoryWorkflowStore();
  return { store, service: new WorkflowService(store) };
}

function payloadWithSubflow(ref: string) {
  return buildWorkflowPayload({
    nodes: [
      { id: 'n-1', data: { kind: 'trigger', label: '触发' } },
      {
        id: 'n-2',
        data: {
          kind: 'subworkflow',
          label: '子流程',
          workflowRef: ref,
          inputMap: { input: 'v' },
          outputMap: { out: 'result' },
        },
      },
    ],
    edges: [{ id: 'e-1', source: 'n-1', target: 'n-2' }],
  });
}

describe('WorkflowService', () => {
  it('创建：严格校验，写入诊断摘要', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    expect(wf.name).toBe('测试工作流');
    expect(wf.version).toBe(1);
    expect(wf.diagnostic.ok).toBe(true);
    expect(wf.diagnostic.nodeCount).toBe(2);
    expect(wf.versions).toEqual([]);
  });

  it('创建：结构非法时拒绝', async () => {
    const { service } = createService();
    await expect(
      service.create(
        buildWorkflowPayload({
          nodes: [
            { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
            { id: 'n-1', data: { kind: 'output', label: 'b' } },
          ],
        }),
      ),
    ).rejects.toThrow(/结构校验失败/);
  });

  it('列表：筛选 / 排序 / 分页', async () => {
    const { service } = createService();
    await service.create(buildWorkflowPayload({ name: 'Alpha', tags: ['x'] }));
    await service.create(buildWorkflowPayload({ name: 'Beta', tags: ['y'] }));
    const all = await service.list({});
    expect(all.total).toBe(2);
    const tagged = await service.list({ tag: 'x' });
    expect(tagged.total).toBe(1);
    expect(tagged.items[0]!.name).toBe('Alpha');
    const paged = await service.list({ limit: 1, offset: 1 });
    expect(paged.items).toHaveLength(1);
  });

  it('归档工作流默认不出现（archived=false 过滤）', async () => {
    const { service, store } = createService();
    const wf = await service.create(buildWorkflowPayload());
    await store.update(wf.id, { archived: true });
    const list = await service.list({});
    expect(list.total).toBe(0);
  });

  it('更新：结构变化时重算诊断并递增版本', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    const updated = await service.update(wf.id, {
      nodes: [...wf.nodes, { id: 'n-3', data: { kind: 'transform', label: '转换' } }],
      edges: [...wf.edges, { id: 'e-2', source: 'n-2', target: 'n-3' }],
    });
    expect(updated.version).toBe(2);
    expect(updated.diagnostic.nodeCount).toBe(3);
    expect(updated.diagnostic.ok).toBe(true);
  });

  it('更新：结构非法时拒绝且不落库', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    await expect(
      service.update(wf.id, {
        nodes: [
          { id: 'n-1', data: { kind: 'trigger', label: 'a' } },
          { id: 'n-2', data: { kind: 'output', label: 'b' } },
        ],
        edges: [{ id: 'e-1', source: 'n-1', target: 'ghost' }],
      }),
    ).rejects.toThrow(/结构校验失败/);
    const after = await service.get(wf.id);
    expect(after.nodes).toHaveLength(2);
  });

  it('删除：不存在时 404', async () => {
    const { service } = createService();
    await expect(service.remove('nope')).rejects.toThrow(/不存在/);
  });

  it('复制：结构保留、状态清空、名称加副本', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    await service.createVersion(wf.id, 'v1');
    const dup = await service.duplicate(wf.id);
    expect(dup.name).toBe('测试工作流 副本');
    expect(dup.nodes).toHaveLength(wf.nodes.length);
    expect(dup.versions).toEqual([]);
    expect(dup.favorite).toBe(false);
    expect(dup.isTemplate).toBe(false);
    expect(dup.version).toBe(1);
  });

  it('模板标记', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    const tpl = await service.setTemplate(wf.id, true);
    expect(tpl.isTemplate).toBe(true);
    const list = await service.list({ isTemplate: true });
    expect(list.total).toBe(1);
  });

  it('版本：创建快照 → 修改 → 恢复', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    const withVersion = await service.createVersion(wf.id, '初始版本');
    expect(withVersion.versions).toHaveLength(1);
    expect(withVersion.versions[0]!.seq).toBe(1);

    // 修改结构
    const modified = await service.update(wf.id, {
      nodes: [...wf.nodes, { id: 'n-9', data: { kind: 'code', label: '代码' } }],
      edges: wf.edges,
    });
    expect(modified.version).toBe(2);
    expect(modified.nodes).toHaveLength(3);

    // 恢复初始版本
    const restored = await service.restoreVersion(wf.id, withVersion.versions[0]!.id);
    expect(restored.nodes).toHaveLength(2);
    expect(restored.version).toBe(3);
    expect(restored.diagnostic.ok).toBe(true);
  });

  it('恢复不存在的版本 → 404', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    await expect(service.restoreVersion(wf.id, 'no-such')).rejects.toThrow(/版本不存在/);
  });

  it('导出 → 导入：结构往返一致', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    const exported = await service.exportWorkflow(wf.id);
    expect(exported.format).toBe('personal-os-workflow');
    expect(exported.nodes).toHaveLength(2);

    const imported = await service.importWorkflow(exported);
    expect(imported.id).not.toBe(wf.id);
    expect(imported.name).toBe(wf.name);
    expect(imported.nodes).toEqual(wf.nodes);
    expect(imported.edges).toEqual(wf.edges);
    expect(imported.inputs).toEqual(wf.inputs);
  });

  it('导入非法结构 → 拒绝', async () => {
    const { service } = createService();
    await expect(
      service.importWorkflow({
        name: 'bad',
        nodes: [{ id: 'n-1', data: { kind: 'trigger', label: 'a' } }],
        edges: [{ id: 'e-1', source: 'n-1', target: 'nope' }],
      }),
    ).rejects.toThrow(/结构校验失败/);
  });

  it('子流程环：引用自身链（A→B→A）被拒绝', async () => {
    const { service } = createService();
    // 先创建 B（不引用任何工作流）
    const b = await service.create(buildWorkflowPayload({ name: 'B' }));
    // 创建 A 引用 B
    const a = await service.create(payloadWithSubflow(b.id));
    // 更新 B 引用 A → 形成环 A→B→A
    await expect(service.update(b.id, payloadWithSubflow(a.id))).rejects.toThrow(/循环子流程引用/);
  });

  it('子流程环：引用自身被拒绝（update 场景）', async () => {
    const { service } = createService();
    const wf = await service.create(buildWorkflowPayload());
    await expect(service.update(wf.id, payloadWithSubflow(wf.id))).rejects.toThrow(
      /不能作为自身的子流程|循环子流程引用/,
    );
  });

  it('子流程深度超限被拒绝', async () => {
    const { service } = createService();
    // 构建 6 层链：w1 → w2 → w3 → w4 → w5 → w6（深度 6 > 上限 5）
    let prev: string | null = null;
    const ids: string[] = [];
    for (let i = 0; i < 6; i++) {
      const wf = await service.create(buildWorkflowPayload({ name: `W${i + 1}` }));
      ids.push(wf.id);
      if (prev) {
        await service.update(prev, payloadWithSubflow(wf.id));
      }
      prev = wf.id;
    }
    // 让 W6 引用 W7，整链 W1→W2→W3→W4→W5→W6→W7 长度 6
    const w7 = await service.create(buildWorkflowPayload({ name: 'W7' }));
    await service.update(ids[5]!, payloadWithSubflow(w7.id));
    // 此时更新 W1（引用 W2）→ 闭包深度 6 > 上限 5 → 拒绝
    await expect(service.update(ids[0]!, payloadWithSubflow(ids[1]!))).rejects.toThrow(
      /嵌套深度超过上限/,
    );
  });
});
