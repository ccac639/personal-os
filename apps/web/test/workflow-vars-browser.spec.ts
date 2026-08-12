import { beforeEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { extractVars, insertVarRef } from '@/features/workflows/vars';
import { useWorkflowStore } from '@/features/workflows/store';

describe('workflow 变量引用插入', () => {
  it('insertVarRef：末尾追加与光标位置插入', () => {
    // 「总结」为 2 个字符，末尾追加后文本长 11
    expect(insertVarRef('总结', 'input')).toEqual({ text: '总结{{input}}', caret: 11 });
    // caret 2 = 「你好」之后（UTF-16 下均为单码元字符）
    expect(insertVarRef('你好{{a}}', 'b', 2)).toEqual({ text: '你好{{b}}{{a}}', caret: 7 });
    expect(insertVarRef('abc', 'x', 1)).toEqual({ text: 'a{{x}}bc', caret: 6 });
  });

  it('insertVarRef：边界安全（负值 / 越界）', () => {
    expect(insertVarRef('ab', 'x', -5)).toEqual({ text: '{{x}}ab', caret: 5 });
    expect(insertVarRef('ab', 'x', 99)).toEqual({ text: 'ab{{x}}', caret: 7 });
  });

  it('extractVars 去重保序', () => {
    expect(extractVars('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });
});

describe('workflow store 变量浏览器 / 缺失诊断 / 输出预览', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('availableVars：运行参数（input/变量/上下文）汇总', () => {
    const store = useWorkflowStore();
    store.runParams = {
      initialText: 'hello',
      variables: { role: '审查员' },
      context: { risks: 3 },
    };
    const names = store.availableVars.map((v) => v.name);
    expect(names).toEqual(expect.arrayContaining(['input', 'role', 'risks']));
    expect(store.availableVarNames.has('role')).toBe(true);
  });

  it('availableVars：运行后包含节点输出与 previous', async () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    store.addNode('output', { x: 300, y: 0 });
    store.addEdge({ source: 'n-1', target: 'n-2' });
    await store.runWorkflow('full');

    const names = store.availableVars.map((v) => v.name);
    expect(names).toContain('n-1');
    expect(names).toContain('n-2');
    expect(names).toContain('previous');
  });

  it('nodeInputVars：按字段列出引用变量', () => {
    const store = useWorkflowStore();
    store.addNode('prompt', { x: 0, y: 0 });
    store.updateNodeData('n-1', { template: '你是 {{role}}，处理 {{input}}' });
    const fields = store.nodeInputVars('n-1');
    expect(fields).toHaveLength(1);
    expect(fields[0]!.field).toBe('template');
    expect(fields[0]!.vars).toEqual(['role', 'input']);
  });

  it('缺失变量诊断：未提供时缺失，提供后消失', () => {
    const store = useWorkflowStore();
    store.addNode('ai', { x: 0, y: 0 });
    store.updateNodeData('n-1', { prompt: '总结 {{input}} 与 {{role}}' });

    expect(store.missingVarsFor('n-1')).toEqual(expect.arrayContaining(['input', 'role']));

    store.runParams = { initialText: 'x', variables: { role: 'r' } };
    expect(store.missingVarsFor('n-1')).toEqual([]);
  });

  it('缺失变量诊断：上游节点输出满足引用', () => {
    const store = useWorkflowStore();
    store.addNode('ai', { x: 0, y: 0 }); // n-1
    store.addNode('ai', { x: 300, y: 0 }); // n-2
    store.updateNodeData('n-2', { prompt: '参考 {{n-1}} 的输出' });
    // 未运行时 n-1 输出不可用 → 缺失
    expect(store.missingVarsFor('n-2')).toEqual(['n-1']);
    // 手动注入上次输出后可用
    store.runOutputs = { 'n-1': { text: 'x' } };
    expect(store.missingVarsFor('n-2')).toEqual([]);
  });

  it('nodeOutputPreview：上次运行输出摘要，未运行时为空', () => {
    const store = useWorkflowStore();
    store.addNode('trigger', { x: 0, y: 0 });
    expect(store.nodeOutputPreview('n-1')).toBe('');

    store.runOutputs = { 'n-1': { cron: '0 9 * * *', source: 'trigger' } };
    const preview = store.nodeOutputPreview('n-1');
    expect(preview).toContain('0 9 * * *');
  });

  it('插入变量引用：updateNodeData 追加到字段并可撤销', () => {
    const store = useWorkflowStore();
    store.addNode('prompt', { x: 0, y: 0 });
    const data = store.nodes[0]!.data;
    store.updateNodeData('n-1', {
      template: insertVarRef(String(data.template ?? ''), 'role').text,
    });
    expect(store.nodes[0]!.data.template).toBe('{{role}}');
    store.undo();
    expect(store.nodes[0]!.data.template).toBe('');
  });
});
