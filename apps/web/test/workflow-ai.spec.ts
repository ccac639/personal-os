import { describe, expect, it } from 'vitest';
import { autoConnect } from '@/features/workflows/ai-workflow-schema';
import {
  extractJsonObject,
  isSensitiveKey,
  mockGenerate,
  parseAiResponse,
  stripSensitiveFields,
} from '@/features/workflows/ai-workflow';
import type { WorkflowNodeData, WorkflowNodeModel } from '@/features/workflows/types';

function node(id: string, kind: WorkflowNodeData['kind'], label = id): WorkflowNodeModel {
  return { id, position: { x: 0, y: 0 }, data: { kind, label, status: 'idle' } };
}

describe('AI JSON 解析与校验', () => {
  it('合法 JSON：解析成功并返回结构化响应', () => {
    const r = parseAiResponse(
      JSON.stringify({
        title: '日报生成',
        summary: '生成日报工作流',
        nodes: [
          { id: 't', kind: 'trigger', data: { cron: '0 9 * * *' } },
          { id: 'a', kind: 'ai', data: { prompt: '生成日报', model: 'deepseek-v3' } },
          { id: 'o', kind: 'output' },
        ],
        edges: [
          { source: 't', target: 'a' },
          { source: 'a', target: 'o' },
        ],
        warnings: [],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.response).not.toBeNull();
    expect(r.response!.nodes).toHaveLength(3);
    expect(r.response!.edges).toHaveLength(2);
    expect(r.response!.summary).toBe('生成日报工作流');
  });

  it('容忍 markdown 代码块围栏与前后杂讯', () => {
    const r = parseAiResponse('```json\n{"summary":"x","nodes":[],"edges":[]}\n```');
    expect(r.ok).toBe(true);
  });

  it('非法 JSON：无法解析出对象', () => {
    expect(parseAiResponse('这不是 JSON').ok).toBe(false);
    expect(parseAiResponse('{"summary": 未闭合').ok).toBe(false);
    expect(parseAiResponse('').ok).toBe(false);
  });

  it('空结果：nodes/edges 为空数组允许，但缺少数组则报错', () => {
    const empty = parseAiResponse('{"summary":"空","nodes":[],"edges":[]}');
    expect(empty.ok).toBe(true);
    expect(empty.response!.nodes).toEqual([]);

    expect(parseAiResponse('{"summary":"x","nodes":[],"edges":null}').ok).toBe(false);
    expect(parseAiResponse('{"summary":"x"}').ok).toBe(false);
  });

  it('未知节点类型：明确报错', () => {
    const r = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'a', kind: 'magic-node' }],
        edges: [],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('未知节点类型'))).toBe(true);
  });

  it('参数错误：AI 节点缺必填 prompt 报配置错误', () => {
    const r = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'a', kind: 'ai' }],
        edges: [],
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('提示词'))).toBe(true);
  });

  it('变量错误：模板中未闭合的 {{ 产生警告', () => {
    const r = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'p', kind: 'prompt', data: { template: '你好 {{name' } }],
        edges: [],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.response!.warnings.some((w) => w.includes('变量'))).toBe(true);
  });

  it('敏感字段：apiKey/token 等被剔除并警告', () => {
    expect(isSensitiveKey('apiKey')).toBe(true);
    expect(isSensitiveKey('ACCESS_TOKEN')).toBe(true);
    expect(isSensitiveKey('private_key')).toBe(true);
    expect(isSensitiveKey('prompt')).toBe(false);

    const obj = { prompt: 'x', apiKey: 'sk-secret', nested: { token: 'abc', label: 'ok' } };
    const hit = stripSensitiveFields(obj);
    expect(hit).toBe(2);
    expect(obj).toEqual({ prompt: 'x', nested: { label: 'ok' } });

    const r = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'a', kind: 'ai', data: { prompt: 'p', apiKey: 'sk-xxx' } }],
        edges: [],
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.response!.nodes[0]!.data).not.toHaveProperty('apiKey');
    expect(r.response!.warnings.some((w) => w.includes('敏感'))).toBe(true);
  });

  it('重复边 / 自连接 / 循环：全部报错', () => {
    const dup = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [
          { id: 'a', kind: 'trigger' },
          { id: 'b', kind: 'ai', data: { prompt: 'p' } },
        ],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'a', target: 'b' },
        ],
      }),
    );
    expect(dup.ok).toBe(false);
    expect(dup.errors.some((e) => e.includes('重复连线'))).toBe(true);

    const self = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'a', kind: 'ai', data: { prompt: 'p' } }],
        edges: [{ source: 'a', target: 'a' }],
      }),
    );
    expect(self.ok).toBe(false);
    expect(self.errors.some((e) => e.includes('自连接'))).toBe(true);

    const cycle = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [
          { id: 'a', kind: 'ai', data: { prompt: 'p' } },
          { id: 'b', kind: 'ai', data: { prompt: 'p' } },
        ],
        edges: [
          { source: 'a', target: 'b' },
          { source: 'b', target: 'a' },
        ],
      }),
    );
    expect(cycle.ok).toBe(false);
    expect(cycle.errors.some((e) => e.includes('循环'))).toBe(true);
  });

  it('边引用不存在的节点：报错', () => {
    const r = parseAiResponse(
      JSON.stringify({
        summary: 'x',
        nodes: [{ id: 'a', kind: 'trigger' }],
        edges: [{ source: 'a', target: 'missing' }],
      }),
    );
    expect(r.ok).toBe(false);
  });
});

describe('extractJsonObject', () => {
  it('提取花括号 JSON 与围栏', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('说明：```json\n{"a":1}\n``` 完毕')).toEqual({ a: 1 });
    expect(extractJsonObject('无 JSON')).toBeNull();
  });
});

describe('mockGenerate（本地规则引擎）', () => {
  it('空需求：返回空草稿与警告', () => {
    const r = mockGenerate('   ');
    expect(r.nodes).toEqual([]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('关键词命中：生成可运行链（含 trigger 与 output）', () => {
    const r = mockGenerate('每天 9 点用 AI 总结文章，发送通知');
    const kinds = r.nodes.map((n) => n.kind);
    expect(kinds[0]).toBe('trigger');
    expect(kinds).toContain('ai');
    expect(kinds).toContain('notify');
    expect(r.edges.length).toBeGreaterThan(0);
    // 生成的草稿必须能通过 parse 校验
    const parsed = parseAiResponse(JSON.stringify(r));
    expect(parsed.ok).toBe(true);
  });

  it('未命中关键词：通用骨架（触发 → AI → 输出）', () => {
    const r = mockGenerate('帮我处理点事情');
    const kinds = r.nodes.map((n) => n.kind);
    expect(kinds).toEqual(['trigger', 'ai', 'output']);
  });
});

describe('autoConnect（纯函数自动连线）', () => {
  it('唯一合法端口自动连接，连接结果可解释', () => {
    const nodes = [node('t', 'trigger'), node('a', 'ai'), node('o', 'output')];
    const r = autoConnect(nodes);
    expect(r.edges).toHaveLength(2);
    expect(r.explanations).toEqual(['t.start -> a.input', 'a.result -> o.input']);
    expect(r.pending).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('多候选端口（条件分支面对多个后续）：首个自动连，其余标记为待确认', () => {
    // trigger -> condition -> notify x3：true 连第一个，false 连第二个，第三个多候选待确认
    const nodes = [
      node('t', 'trigger'),
      node('c', 'condition'),
      node('n1', 'notify'),
      node('n2', 'notify'),
      node('n3', 'notify'),
    ];
    const r = autoConnect(nodes);
    expect(r.edges.some((e) => e.source === 't' && e.target === 'c')).toBe(true);
    // 至少一条分支自动连 + 至少一条 pending
    expect(r.edges.length).toBeGreaterThanOrEqual(2);
    expect(r.pending.length).toBeGreaterThan(0);
    // 待确认的源是条件节点
    expect(r.pending.some((p) => p.sourceId === 'c')).toBe(true);
    // 不强连：pending 目标不会出现在自动边中
    const pendingTargets = new Set(r.pending.flatMap((p) => p.targets.map((x) => x.nodeId)));
    for (const e of r.edges) {
      expect(pendingTargets.has(e.target)).toBe(false);
    }
  });

  it('重复边拒绝（已有边时不再重复生成）', () => {
    const nodes = [node('t', 'trigger'), node('a', 'ai')];
    const existing = [
      { id: 'e1', source: 't', target: 'a', sourceHandle: 'start', targetHandle: 'input' },
    ];
    const r = autoConnect(nodes, existing as never);
    expect(r.edges).toHaveLength(0);
    expect(r.rejected.length).toBeGreaterThan(0);
  });

  it('孤立节点警告', () => {
    // 两个 output 都无输出端口，第二个无法被连接
    const nodes = [node('o1', 'output'), node('o2', 'output')];
    const r = autoConnect(nodes);
    expect(r.warnings.some((w) => w.includes('孤立'))).toBe(true);
  });

  it('端口不兼容：data 不能接 control 输入（不强制连接）', () => {
    // prompt.text 是 data；delay.input 是 control → 不兼容，delay 成为孤立节点
    const nodes = [node('t', 'trigger'), node('p', 'prompt'), node('d', 'delay')];
    const r = autoConnect(nodes);
    expect(r.edges.every((e) => e.target !== 'd')).toBe(true);
    expect(r.edges.some((e) => e.source === 't' && e.target === 'p')).toBe(true);
  });

  it('条件分支：true/false 端口分别驱动后续节点', () => {
    const nodes = [
      node('t', 'trigger'),
      node('c', 'condition'),
      node('n', 'notify'),
      node('o', 'output'),
    ];
    const r = autoConnect(nodes);
    expect(r.explanations.length).toBeGreaterThan(0);
    // trigger -> condition 自动连上
    expect(r.edges.some((e) => e.source === 't' && e.target === 'c')).toBe(true);
    // 两个分支端口各连一个目标（n 与 o）
    const fromC = r.edges.filter((e) => e.source === 'c');
    expect(fromC.length).toBeGreaterThanOrEqual(1);
  });

  it('自连接被拒绝（兜底校验）', () => {
    const nodes = [node('a', 'ai')];
    const r = autoConnect(nodes);
    expect(r.edges.every((e) => e.source !== e.target)).toBe(true);
  });

  it('主链语义：多候选在链式场景不产生 pending（顺序连接）', () => {
    // trigger -> ai1 -> ai2：线性链，全部自动连接
    const nodes = [node('t', 'trigger'), node('a1', 'ai'), node('a2', 'ai')];
    const r = autoConnect(nodes);
    expect(r.edges).toHaveLength(2);
    expect(r.pending).toEqual([]);
  });
});
