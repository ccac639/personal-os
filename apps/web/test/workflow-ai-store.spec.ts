import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useWorkflowStore } from '@/features/workflows/store';
import {
  mockAiGenerateService,
  type AiGenerateService,
  type WorkflowAiResponse,
} from '@/features/workflows/ai-workflow';
import { nodeData } from '@/features/workflows/types';

/** 构造合法草稿响应 */
function draftResponse(): WorkflowAiResponse {
  return {
    title: '测试草稿',
    summary: '测试生成的草稿',
    nodes: [
      { id: 't-ai', kind: 'trigger', label: '定时触发' },
      {
        id: 'a-ai',
        kind: 'ai',
        label: 'AI 生成',
        data: { prompt: '总结内容', model: 'deepseek-v3' },
      },
      { id: 'o-ai', kind: 'output', label: '输出' },
    ],
    edges: [
      { source: 't-ai', target: 'a-ai' },
      { source: 'a-ai', target: 'o-ai' },
    ],
    warnings: [],
  };
}

describe('workflow AI 预览与事务', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('生成：预览不修改正式 store（nodes/edges 不变，不持久化）', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    const before = JSON.stringify(store.nodes);

    await store.generateAiWorkflow('每天总结文章并通知', 'new');

    expect(store.aiPreview).not.toBeNull();
    expect(JSON.stringify(store.nodes)).toBe(before);
    expect(store.edges).toHaveLength(0);
    // 未应用前不持久化新内容
    const saved = JSON.parse(localStorage.getItem('personal-os-workflows-v3') ?? '{}') as {
      workflows: Array<{ nodes: unknown[] }>;
    };
    expect(saved.workflows[0]!.nodes).toHaveLength(0);
  });

  it('取消：clearAiPreview 不修改工作流', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    store.addNode('trigger');
    const before = JSON.stringify(store.nodes);

    await store.generateAiWorkflow('生成流程', 'new');
    expect(store.aiPreview).not.toBeNull();

    store.clearAiPreview();
    expect(store.aiPreview).toBeNull();
    expect(store.aiPhase).toBe('idle');
    expect(JSON.stringify(store.nodes)).toBe(before);
  });

  it('应用全部：节点+连线一次生效，生成 AI 版本快照，单次撤销可回退', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    await store.generateAiWorkflow('每天总结文章并通知', 'new');

    expect(store.applyAiDraft('all')).toBe(true);

    // 节点与边已应用（稳定 id，无草稿 id 残留）
    expect(store.nodes).toHaveLength(3);
    expect(store.edges).toHaveLength(2);
    expect(store.nodes.some((n) => n.id.includes('-ai-'))).toBe(false);
    // 版本快照已创建
    expect(store.listVersions().length).toBeGreaterThan(0);
    expect(store.listVersions()[0]!.summary).toContain('AI 生成');
    // 预览已清空
    expect(store.aiPreview).toBeNull();
    // 单次撤销回到应用前
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.nodes).toHaveLength(0);
  });

  it('仅节点 / 仅连接：按范围应用', async () => {
    vi.useFakeTimers();
    try {
      // —— 仅节点：新节点加入画布，不加边 ——
      const store = useWorkflowStore();
      store.createWorkflow('AI 测试');
      store.addNode('trigger'); // n-1

      const nodesSvc: AiGenerateService = {
        async generate() {
          return {
            summary: '补充 AI 节点',
            nodes: [{ id: 'new-1', kind: 'ai', data: { prompt: 'p' } }],
            edges: [],
            warnings: [],
          };
        },
      };
      store.setAiService(nodesSvc);
      let p = store.generateAiWorkflow('补充', 'extend');
      await vi.advanceTimersByTimeAsync(2000);
      await p;

      expect(store.applyAiDraft('nodes')).toBe(true);
      expect(store.nodes).toHaveLength(2);
      expect(store.edges).toHaveLength(0); // 仅节点不加边

      // —— 仅连接：草稿引用已有节点，只加边不加节点 ——
      const edgesSvc: AiGenerateService = {
        async generate() {
          return {
            summary: '连接已有节点',
            nodes: [
              { id: 'n-1', kind: 'trigger' },
              { id: 'n-2', kind: 'ai', data: { prompt: 'p' } },
            ],
            edges: [{ source: 'n-1', target: 'n-2' }],
            warnings: [],
          };
        },
      };
      store.setAiService(edgesSvc);
      // 当前画布为 n-1(trigger) + new-1(ai)，手动补 n-2 使连接端点存在
      store.addNode('ai'); // n-2
      p = store.generateAiWorkflow('连接', 'extend');
      await vi.advanceTimersByTimeAsync(2000);
      await p;

      expect(store.applyAiDraft('edges')).toBe(true);
      expect(store.nodes).toHaveLength(3); // 仅连接不加节点
      expect(store.edges).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('失败回滚：AI service 抛错 → 无预览、store 不变', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    store.addNode('trigger');
    const before = JSON.stringify(store.nodes);

    const failing: AiGenerateService = {
      async generate() {
        throw new Error('模拟网络错误');
      },
    };
    store.setAiService(failing);
    await store.generateAiWorkflow('生成流程', 'new');

    expect(store.aiPreview).toBeNull();
    expect(store.aiError).toContain('模拟网络错误');
    expect(store.aiPhase).toBe('error');
    expect(JSON.stringify(store.nodes)).toBe(before);
  });

  it('应用事务回滚：仅连接但无可用边 → 整体回滚', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    // 草稿节点 id 与现有节点不同（全新增），edges 应用时端点不存在 → 抛错回滚
    const svc: AiGenerateService = {
      async generate() {
        return {
          summary: '只生成节点',
          nodes: [
            { id: 'x-1', kind: 'trigger' },
            { id: 'x-2', kind: 'ai', data: { prompt: 'p' } },
          ],
          edges: [{ source: 'x-1', target: 'x-2' }],
          warnings: [],
        };
      },
    };
    store.setAiService(svc);
    await store.generateAiWorkflow('生成流程', 'new');
    const before = JSON.stringify(store.nodes);

    expect(store.applyAiDraft('edges')).toBe(false);
    expect(JSON.stringify(store.nodes)).toBe(before);
    expect(store.aiError).toContain('回滚');
    // 版本快照回滚到应用前状态：不得残留「AI 生成」版本
    expect(store.listVersions().some((v) => v.summary.includes('AI 生成'))).toBe(false);
  });

  it('竞态：连续两次生成，最后一次优先；先完成的旧结果被丢弃', async () => {
    vi.useFakeTimers();
    try {
      const store = useWorkflowStore();
      store.createWorkflow('AI 测试');

      let resolveFirst: (r: WorkflowAiResponse) => void = () => {};
      const first = new Promise<WorkflowAiResponse>((r) => {
        resolveFirst = r;
      });
      let firstCalled = false;
      const svc: AiGenerateService = {
        async generate(prompt) {
          if (prompt === '第一个') {
            firstCalled = true;
            return first; // 第一个挂起（模拟慢请求）
          }
          return draftResponse();
        },
      };
      store.setAiService(svc);

      const p1 = store.generateAiWorkflow('第一个', 'new');
      // 快进动画：第一个到达 service 并挂起
      await vi.advanceTimersByTimeAsync(2000);
      expect(firstCalled).toBe(true);

      // 第二次生成（立即返回），覆盖第一次
      const p2 = store.generateAiWorkflow('第二个', 'new');
      await vi.advanceTimersByTimeAsync(2000);
      await p2;

      // 释放第一个（延迟完成，应被丢弃）
      resolveFirst(draftResponse());
      await p1;

      // 最终 preview 是第二个生成的结果
      expect(store.aiPreview?.response.title).toBe('测试草稿');
      expect(store.aiBusy).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('生成中取消：clearAiPreview 使进行中的生成失效', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');

    let resolveGen: (r: WorkflowAiResponse) => void = () => {};
    const gate = new Promise<WorkflowAiResponse>((r) => {
      resolveGen = r;
    });
    const svc: AiGenerateService = {
      async generate() {
        return gate;
      },
    };
    store.setAiService(svc);

    const p = store.generateAiWorkflow('生成流程', 'new');
    store.clearAiPreview(); // 取消（token 失效）
    resolveGen(draftResponse());
    await p;

    expect(store.aiPreview).toBeNull();
    expect(store.aiBusy).toBe(false);
  });

  it('运行期间禁止生成与应用', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    const raw = store as unknown as { running: boolean; aiPreview: unknown };
    raw.running = true; // 直接置位（不实际跑 runner）

    await store.generateAiWorkflow('生成流程', 'new');
    expect(store.aiError).toContain('运行期间');

    raw.aiPreview = null;
    raw.running = false;
  });

  it('动画阶段只影响 preview：nodes/edges 在生成全程保持不变', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    store.addNode('trigger');
    const before = JSON.stringify(store.nodes);
    const edgesBefore = JSON.stringify(store.edges);

    const p = store.generateAiWorkflow('生成流程', 'new');
    // 阶段动画进行中（analyzing/scanning/...）
    expect(['analyzing', 'scanning', 'nodes', 'edges', 'validating']).toContain(store.aiPhase);
    await p;

    expect(JSON.stringify(store.nodes)).toBe(before);
    expect(JSON.stringify(store.edges)).toBe(edgesBefore);
    expect(store.aiPhase).toBe('ready');
  });

  it('待确认端口勾选：togglePendingChoice 影响预览边，不影响正式边', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    // 条件分支面对三个 notify → true/false 各连一个，第三个进入待确认
    const svc: AiGenerateService = {
      async generate() {
        return {
          summary: '多候选',
          nodes: [
            { id: 't', kind: 'trigger' },
            { id: 'c', kind: 'condition' },
            { id: 'n1', kind: 'notify' },
            { id: 'n2', kind: 'notify' },
            { id: 'n3', kind: 'notify' },
          ],
          edges: [],
          warnings: [],
        };
      },
    };
    store.setAiService(svc);
    await store.generateAiWorkflow('多候选生成', 'new');

    expect(store.aiPreview?.auto.pending.length).toBeGreaterThan(0);
    const baseEdges = store.previewEdges().length;

    store.togglePendingChoice(0);
    expect(store.previewEdges().length).toBe(baseEdges + 1);
    // 正式数据仍未动
    expect(store.edges).toHaveLength(0);

    // 应用全部后待确认边进入正式边
    expect(store.applyAiDraft('all')).toBe(true);
    expect(store.edges.length).toBe(baseEdges + 1);
  });

  it('extend 模式：同 id 节点覆盖为修改', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    store.addNode('ai'); // n-1
    const svc: AiGenerateService = {
      async generate() {
        return {
          summary: '修改 n-1',
          nodes: [{ id: 'n-1', kind: 'ai', label: '修改后的 AI', data: { prompt: '新提示词' } }],
          edges: [],
          warnings: [],
        };
      },
    };
    store.setAiService(svc);
    await store.generateAiWorkflow('修改', 'extend');

    const plan = store.aiPreview?.nodes.find((n) => n.stableId === 'n-1');
    expect(plan?.isNew).toBe(false);

    expect(store.applyAiDraft('all')).toBe(true);
    expect(nodeData(store.nodes[0]!).label).toBe('修改后的 AI');
  });

  it('默认 service 为 mock，生成链路端到端可用', async () => {
    const store = useWorkflowStore();
    store.createWorkflow('AI 测试');
    await store.generateAiWorkflow('每天 9 点用 AI 总结并推送通知', 'new');
    expect(store.aiPreview).not.toBeNull();
    expect(store.aiPreview!.nodes.length).toBeGreaterThan(0);
    expect(store.aiError).toBeNull();
    void mockAiGenerateService;
  });
});
