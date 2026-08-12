/**
 * AI 工作流生成：类型、JSON 解析与严格校验、模拟生成器、service 注入边界
 *
 * 流程：输入需求 -> AI 生成（service）-> 解析/校验（parseAiResponse）-> 画布预览
 * -> 用户确认 -> 一次性应用（store.applyAiDraft）。
 * 本模块只产出「草稿」（WorkflowAiResponse），绝不直接写入正式 store。
 */

import type { WorkflowEdgeModel, WorkflowNodeData, WorkflowNodeKind, XYPosition } from './types';
import { NODE_KINDS } from './types';
import { getNodeSchema, normalizeDelay, validateNodeData } from './schema';
import { getPorts } from './ai-workflow-schema';
import { topoSort } from './topo';

/** AI 生成模式 */
export type AiGenMode = 'new' | 'extend';

/** 草稿节点（AI 返回；id 为临时 id，应用时映射为稳定 id） */
export interface WorkflowNodeDraft {
  id?: string;
  kind: WorkflowNodeKind;
  label?: string;
  position?: XYPosition;
  data?: Partial<WorkflowNodeData>;
}

/** 草稿边（引用草稿节点 id） */
export interface WorkflowEdgeDraft {
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

/** AI 结构化响应 */
export interface WorkflowAiResponse {
  title?: string;
  summary: string;
  nodes: WorkflowNodeDraft[];
  edges: WorkflowEdgeDraft[];
  warnings: string[];
}

/** 解析结果 */
export interface AiParseResult {
  ok: boolean;
  response: WorkflowAiResponse | null;
  errors: string[];
}

/** AI 生成 service 注入边界（未来接真实 LLM / 后端） */
export interface AiGenerateService {
  generate(prompt: string, mode: AiGenMode): Promise<WorkflowAiResponse>;
}

/* ---------- 敏感字段检测（导出脱敏 / 校验共用） ---------- */

const SENSITIVE_KEY_RE =
  /(api[_-]?key|token|secret|passwd|password|private[_-]?key|authorization|bearer|cookie|credential|session)/i;

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/** 递归清洗草稿数据中的敏感字段（就地剔除，返回命中数） */
export function stripSensitiveFields(value: unknown, path = ''): number {
  let hit = 0;
  if (Array.isArray(value)) {
    for (const v of value) hit += stripSensitiveFields(v, path);
    return hit;
  }
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (isSensitiveKey(key)) {
        delete obj[key];
        hit++;
      } else {
        hit += stripSensitiveFields(obj[key], `${path}.${key}`);
      }
    }
  }
  return hit;
}

/* ---------- JSON 解析 ---------- */

/** 从 LLM 文本中提取 JSON 对象（容忍 markdown 代码块围栏与前后杂讯） */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fence ? fence[1]! : trimmed).trim();
  // 定位第一个 { 与最后一个 }
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/* ---------- 草稿校验 ---------- */

export interface DraftValidation {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

/** 校验草稿节点（类型白名单 / 参数 schema / 变量 / 敏感字段） */
export function validateNodeDraft(
  draft: WorkflowNodeDraft,
  index: number,
  errors: string[],
  warnings: string[],
): WorkflowNodeData | null {
  const label = draft.id ?? `#${index + 1}`;
  if (!draft.kind || !NODE_KINDS.has(draft.kind)) {
    errors.push(`节点 ${label}：未知节点类型「${String(draft.kind ?? '')}」`);
    return null;
  }
  const kind = draft.kind as WorkflowNodeKind;
  const schema = getNodeSchema(kind);
  const data: WorkflowNodeData = {
    kind,
    status: 'idle',
    ...schema.defaults,
    ...(draft.data ?? {}),
    label: draft.label?.trim() || schema.defaults.label || kind,
  };
  // 敏感字段：直接剔除并警告（不阻止生成）
  const hit = stripSensitiveFields(data);
  if (hit > 0) warnings.push(`节点 ${label} 包含 ${hit} 个敏感字段，已自动剔除`);
  // 字段级校验
  const fieldErrors = validateNodeData(data);
  for (const [key, msg] of Object.entries(fieldErrors)) {
    errors.push(`节点 ${label} 配置错误：${msg}（字段 ${key}）`);
  }
  // 变量插值校验：模板/提示词/消息中的变量仅做缺失提示（运行期可注入）
  for (const v of ['template', 'prompt', 'message', 'expr'] as const) {
    const text = data[v];
    if (typeof text === 'string' && text.includes('{{')) {
      const matches = text.match(/\{\{\s*([\w.]+)\s*\}\}/g) ?? [];
      if (matches.length === 0) {
        warnings.push(`节点 ${label}：变量语法不完整（缺少闭合 }}）`);
      }
    }
  }
  return normalizeDelay(data);
}

/** 校验草稿边（引用存在 / 端口合法 / 自连接 / 重复） */
export function validateDraftEdges(
  draft: WorkflowAiResponse,
  nodeKinds: Map<string, WorkflowNodeKind>,
  errors: string[],
  warnings: string[],
): WorkflowEdgeDraft[] {
  const edgeKey = new Set<string>();
  const edges: WorkflowEdgeDraft[] = [];
  draft.edges.forEach((e, i) => {
    const label = `连线 #${i + 1}（${e.source} -> ${e.target}）`;
    if (!e.source || !e.target) {
      errors.push(`${label}：缺少 source/target`);
      return;
    }
    const sk = nodeKinds.get(e.source);
    const tk = nodeKinds.get(e.target);
    if (!sk || !tk) {
      errors.push(`${label}：引用不存在的节点`);
      return;
    }
    if (e.source === e.target) {
      errors.push(`${label}：自连接不允许`);
      return;
    }
    const key = `${e.source}:${e.sourceHandle ?? ''}:${e.target}`;
    if (edgeKey.has(key)) {
      errors.push(`${label}：重复连线`);
      return;
    }
    edgeKey.add(key);
    // 端口合法性（宽松校验：不存在则警告，不阻断——画布锚点较简单）
    const srcPorts = getPorts(sk).outputs;
    const dstPorts = getPorts(tk).inputs;
    if (e.sourceHandle && !srcPorts.some((p) => p.id === e.sourceHandle)) {
      warnings.push(`${label}：源端口「${e.sourceHandle}」不存在，将按默认处理`);
    }
    if (e.targetHandle && !dstPorts.some((p) => p.id === e.targetHandle)) {
      warnings.push(`${label}：目标端口「${e.targetHandle}」不存在，将按默认处理`);
    }
    edges.push(e);
  });
  return edges;
}

/** 整体校验：解析 + 白名单 + 参数 + 变量 + 端口 + 重复/自连接 + 循环 */
export function parseAiResponse(text: string): AiParseResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const obj = extractJsonObject(text);
  if (obj === null) {
    return { ok: false, response: null, errors: ['无法从 AI 输出中解析出 JSON 对象'] };
  }
  if (typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, response: null, errors: ['AI 输出不是对象结构'] };
  }
  const raw = obj as Record<string, unknown>;

  if (!Array.isArray(raw.nodes)) {
    return { ok: false, response: null, errors: ['缺少 nodes 数组'] };
  }
  if (!Array.isArray(raw.edges)) {
    return { ok: false, response: null, errors: ['缺少 edges 数组'] };
  }
  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (!summary) errors.push('缺少 summary 说明');
  const title = typeof raw.title === 'string' ? raw.title : undefined;
  const rawWarnings = Array.isArray(raw.warnings)
    ? raw.warnings.filter((w): w is string => typeof w === 'string')
    : [];

  // 节点
  const nodes: WorkflowNodeDraft[] = [];
  const nodeKinds = new Map<string, WorkflowNodeKind>();
  const idCount = new Map<string, number>();
  for (let i = 0; i < raw.nodes.length; i++) {
    const n = raw.nodes[i] as Record<string, unknown> | null;
    if (!n || typeof n !== 'object') {
      errors.push(`节点 #${i + 1}：不是有效对象`);
      continue;
    }
    const draft: WorkflowNodeDraft = {
      id: typeof n.id === 'string' ? n.id : undefined,
      kind: n.kind as WorkflowNodeKind,
      label: typeof n.label === 'string' ? n.label : undefined,
      position:
        n.position && typeof n.position === 'object'
          ? ({
              x: Number((n.position as Record<string, unknown>).x ?? 0),
              y: Number((n.position as Record<string, unknown>).y ?? 0),
            } as XYPosition)
          : undefined,
      data: n.data && typeof n.data === 'object' ? (n.data as Record<string, unknown>) : undefined,
    };
    const data = validateNodeDraft(draft, i, errors, warnings);
    if (data === null) continue;
    // 稳定 id：AI 未提供或冲突时补 n-ai-N
    const base = draft.id && !nodeKinds.has(draft.id) ? draft.id : `ai-${i + 1}`;
    const count = idCount.get(base) ?? 0;
    const id = count === 0 ? base : `${base}-${count}`;
    idCount.set(base, count + 1);
    nodeKinds.set(id, data.kind);
    nodes.push({
      id,
      kind: data.kind,
      label: data.label,
      position: draft.position,
      data,
    });
  }

  // 边
  const draftEdges = validateDraftEdges(
    { summary, nodes, edges: raw.edges as WorkflowEdgeDraft[], warnings: rawWarnings },
    nodeKinds,
    errors,
    warnings,
  );

  // 循环检测：构造边图跑 topo，有环则报错
  const edgeModels: WorkflowEdgeModel[] = draftEdges.map((e, i) => ({
    id: `draft-e-${i}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
  }));
  const fakeNodes = nodes.map((n, i) => ({
    id: n.id!,
    position: { x: i * 10, y: 0 },
    data: { kind: n.kind, label: n.label ?? n.kind, status: 'idle' as const } as WorkflowNodeData,
  }));
  const topo = topoSort(fakeNodes, edgeModels);
  if (topo.cycleIds.length > 0) {
    errors.push(`连线存在循环：${topo.cycleIds.join('、')}`);
  }

  const response: WorkflowAiResponse = {
    title,
    summary,
    nodes,
    edges: draftEdges,
    warnings: [...rawWarnings, ...warnings],
  };
  return { ok: errors.length === 0, response: errors.length === 0 ? response : null, errors };
}

/* ---------- 模拟生成器（本地规则引擎，未来替换为真实 service） ---------- */

const KIND_HINTS: Array<{ re: RegExp; kind: WorkflowNodeKind; label: string }> = [
  { re: /(定时|每天|每天|每[周月]|cron|凌晨|早上|触发)/, kind: 'trigger', label: '定时触发' },
  { re: /(提示词|模板|prompt|指令)/, kind: 'prompt', label: '提示词模板' },
  { re: /(AI|ai|生成|总结|分析|摘要|摘要|改写|翻译|审查|润色)/, kind: 'ai', label: 'AI 生成' },
  { re: /(脚本|代码|python|计算|转换|清洗|执行)/, kind: 'code', label: '代码执行' },
  { re: /(判断|条件|如果|分支|校验|过滤)/, kind: 'condition', label: '条件判断' },
  { re: /(延迟|等待|间隔|稍后)/, kind: 'delay', label: '延迟等待' },
  { re: /(通知|提醒|推送|邮件|钉钉|飞书|发送)/, kind: 'notify', label: '发送通知' },
  { re: /(输出|导出|保存|报告|结果)/, kind: 'output', label: '输出' },
];

/** 规则引擎：按关键词命中顺序生成节点链（可解释、确定性） */
export function mockGenerate(prompt: string, mode: AiGenMode = 'new'): WorkflowAiResponse {
  const text = prompt.trim();
  const nodes: WorkflowNodeDraft[] = [];
  const warnings: string[] = [];

  if (!text) {
    return {
      summary: '需求为空，未生成任何节点',
      nodes: [],
      edges: [],
      warnings: ['请输入工作流需求描述'],
    };
  }

  // 按关键词命中顺序给节点排序，避免固定顺序导致的语义错位
  const hits: Array<{ hint: (typeof KIND_HINTS)[number]; pos: number }> = [];
  for (const hint of KIND_HINTS) {
    const m = text.match(hint.re);
    if (m && m.index !== undefined) hits.push({ hint, pos: m.index });
  }
  hits.sort((a, b) => a.pos - b.pos);

  if (hits.length === 0) {
    // 未命中任何关键词：给一个最小可运行骨架
    nodes.push(
      { id: 'trigger-1', kind: 'trigger', label: '手动触发' },
      { id: 'ai-1', kind: 'ai', label: 'AI 生成', data: { prompt: text } },
      { id: 'output-1', kind: 'output', label: '输出结果' },
    );
    warnings.push('未能识别明确节点类型，已生成通用骨架（触发 → AI → 输出）');
  } else {
    // 保证首个是触发类（若第一个命中不是 trigger）
    const kinds = hits.map((h) => h.hint.kind);
    if (!kinds.includes('trigger') && mode === 'new') {
      nodes.push({ id: 'trigger-1', kind: 'trigger', label: '定时触发' });
    }
    let idx = 1;
    for (const h of hits) {
      if (h.hint.kind === 'trigger' && nodes.some((n) => n.kind === 'trigger')) continue;
      const data: Partial<WorkflowNodeData> = {};
      switch (h.hint.kind) {
        case 'ai':
          data.prompt = text;
          break;
        case 'notify':
          data.message = text;
          break;
        case 'condition':
          data.expr = 'result == "ok"';
          break;
        case 'delay':
          data.delayValue = 1;
          data.delayUnit = 's';
          break;
        default:
          break;
      }
      nodes.push({ id: `node-${idx++}`, kind: h.hint.kind, label: h.hint.label, data });
    }
    // 末端输出：若命中列表不含 output/notify，补一个 output
    if (!kinds.includes('output') && !kinds.includes('notify')) {
      nodes.push({ id: 'output-1', kind: 'output', label: '输出结果' });
    }
    if (hits.length >= 4) {
      warnings.push('需求较复杂，已生成多条节点链，请检查自动连线是否符合预期');
    }
  }

  const edges: WorkflowEdgeDraft[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      source: nodes[i]!.id!,
      sourceHandle: undefined,
      target: nodes[i + 1]!.id!,
      targetHandle: undefined,
    });
  }

  const summary =
    mode === 'new'
      ? `根据需求生成 ${nodes.length} 个节点、${edges.length} 条连线的草稿`
      : `基于当前画布补充 ${nodes.length} 个节点、${edges.length} 条连线`;
  return { title: text.slice(0, 24), summary, nodes, edges, warnings };
}

/** 默认 AI service（mock 实现；真实接入时替换 generate 实现） */
export const mockAiGenerateService: AiGenerateService = {
  async generate(prompt, mode) {
    await new Promise((r) => setTimeout(r, 120));
    return mockGenerate(prompt, mode);
  },
};

/** 草稿节点转预览模型（含稳定 id 与位置偏移） */
export function draftToPreviewNodes(
  drafts: WorkflowNodeDraft[],
  startX = 60,
  startY = 60,
): Array<{ model: ReturnType<typeof makeDraftNode>; id: string }> {
  return drafts.map((d, i) => ({
    id: d.id!,
    model: makeDraftNode(d, i, startX, startY),
  }));
}

function makeDraftNode(d: WorkflowNodeDraft, index: number, startX: number, startY: number) {
  const x = (d.position?.x ?? startX) + index * 30;
  const y = (d.position?.y ?? startY) + index * 20;
  return {
    id: d.id!,
    type: 'custom' as const,
    position: { x, y },
    data: (d.data ?? {}) as WorkflowNodeData,
  };
}

/** 预览节点与现有画布节点的 diff 分类 */
export function diffDraftNodes(
  draftNodes: Array<{ id: string; kind: WorkflowNodeKind }>,
  existingIds: string[],
): { added: string[]; existing: string[] } {
  const existing = new Set(existingIds);
  return {
    added: draftNodes.filter((n) => !existing.has(n.id)).map((n) => n.id),
    existing: draftNodes.filter((n) => existing.has(n.id)).map((n) => n.id),
  };
}
