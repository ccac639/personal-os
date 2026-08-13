/**
 * 工作流输入输出契约（纯函数，无 Vue 依赖）
 *
 * - 输入定义校验：名称唯一、必填、默认值、类型相符、select 选项
 * - 输出定义校验：名称唯一、来源节点存在、变量路径有效
 * - 运行输入标准化：从用户输入 + 默认值合并出完整变量上下文
 * - 输出汇总：按输出定义从节点输出中提取结构化结果
 */
import type { WorkflowInputDef, WorkflowOutputDef } from './types';

export interface IoIssue {
  path: string;
  message: string;
}

export interface IoInput {
  /** 标准化的运行输入（变量上下文） */
  variables: Record<string, unknown>;
  /** 字段级校验错误 */
  errors: Record<string, string>;
}

/* ---------- 基础值校验 ---------- */

export function validateInputValue(def: WorkflowInputDef, value: unknown): string | null {
  if (value === undefined || value === null || value === '') {
    return def.required ? '该输入为必填项' : null;
  }
  switch (def.type) {
    case 'text':
      return typeof value === 'string' ? null : '需要文本类型';
    case 'number': {
      if (typeof value === 'number' && Number.isFinite(value)) return null;
      if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
        return null;
      }
      return '需要数字类型';
    }
    case 'boolean':
      return typeof value === 'boolean' ? null : '需要布尔类型（true / false）';
    case 'json':
      // JSON 输入：接受任意对象 / 数组 / 原始值
      return value === undefined ? '需要 JSON 值' : null;
    case 'select': {
      const options = def.options ?? [];
      const str = String(value ?? '');
      return options.includes(str)
        ? null
        : `需要选择项之一：${options.join(' / ') || '（未配置选项）'}`;
    }
    default:
      return null;
  }
}

/** 解析 JSON 文本输入为值（用于 json 类型），返回错误信息或 null */
export function parseJsonInput(
  text: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: true, value: undefined };
  try {
    return { ok: true, value: JSON.parse(t) };
  } catch (e) {
    return { ok: false, error: `JSON 解析失败：${e instanceof Error ? e.message : '语法错误'}` };
  }
}

/* ---------- 输入定义校验 ---------- */

export function validateInputDefs(defs: WorkflowInputDef[]): IoIssue[] {
  const issues: IoIssue[] = [];
  const seen = new Set<string>();
  defs.forEach((def, i) => {
    const path = `inputs[${i}]`;
    if (!def.name || !def.name.trim()) {
      issues.push({ path, message: '输入名称不能为空' });
      return;
    }
    if (seen.has(def.name)) {
      issues.push({ path, message: `输入名称「${def.name}」重复` });
    }
    seen.add(def.name);
    if (!/^[A-Za-z_][A-Za-z0-9_.]*$/.test(def.name)) {
      issues.push({
        path,
        message: `输入名称「${def.name}」包含非法字符（仅字母/数字/下划线/点）`,
      });
    }
    // 默认值类型校验
    if (def.defaultValue !== undefined && def.defaultValue !== null) {
      const err = validateInputValue(def, def.defaultValue);
      if (err) issues.push({ path, message: `默认值：${err}` });
    }
    // select 需要选项
    if (def.type === 'select' && (!def.options || def.options.length === 0)) {
      issues.push({ path, message: '选择型输入必须配置选项' });
    }
  });
  return issues;
}

/* ---------- 输出定义校验 ---------- */

export function validateOutputDefs(defs: WorkflowOutputDef[], nodeIds: string[]): IoIssue[] {
  const issues: IoIssue[] = [];
  const seen = new Set<string>();
  defs.forEach((def, i) => {
    const path = `outputs[${i}]`;
    if (!def.name || !def.name.trim()) {
      issues.push({ path, message: '输出名称不能为空' });
      return;
    }
    if (seen.has(def.name)) {
      issues.push({ path, message: `输出名称「${def.name}」重复` });
    }
    seen.add(def.name);
    // 来源：节点 id 或 节点 id.路径
    if (!def.source) {
      issues.push({ path, message: '输出来源不能为空' });
      return;
    }
    const nodeId = def.source.split('.')[0] ?? '';
    if (!nodeIds.includes(nodeId)) {
      issues.push({ path, message: `输出来源节点「${nodeId}」不存在` });
    }
  });
  return issues;
}

/* ---------- 运行输入标准化 ---------- */

/**
 * 合并用户输入与默认值，产出运行变量上下文。
 * 校验必填缺失 / 类型不符，返回字段级错误。
 */
export function buildRunInput(
  defs: WorkflowInputDef[],
  userInput: Record<string, unknown>,
): IoInput {
  const variables: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const def of defs) {
    const hasUser = Object.prototype.hasOwnProperty.call(userInput, def.name);
    const raw = hasUser ? userInput[def.name] : def.defaultValue;
    const err = validateInputValue(def, raw);
    if (err) {
      errors[def.name] = err;
      continue;
    }
    if (raw !== undefined && raw !== null) variables[def.name] = raw;
  }
  return { variables, errors };
}

/* ---------- 输出提取 ---------- */

/** 从节点输出对象按点路径取值（与 vars.lookupPath 同语义，独立实现避免循环依赖） */
export function extractPath(obj: unknown, path: string | undefined): unknown {
  if (!path) return obj;
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (!part) continue;
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/** 按输出定义汇总运行输出（缺失来源时置为 null 并给出说明） */
export function summarizeOutputs(
  defs: WorkflowOutputDef[],
  nodeOutputs: Record<string, unknown>,
): { outputs: Record<string, unknown>; missing: string[] } {
  const outputs: Record<string, unknown> = {};
  const missing: string[] = [];
  for (const def of defs) {
    const parts = def.source.split('.');
    const nodeId = parts[0] ?? '';
    const nodeOut = nodeOutputs[nodeId];
    if (nodeOut === undefined) {
      missing.push(def.source);
      outputs[def.name] = null;
      continue;
    }
    const value = parts.length > 1 ? extractPath(nodeOut, parts.slice(1).join('.')) : nodeOut;
    outputs[def.name] = value === undefined ? null : value;
    if (value === undefined) missing.push(def.source);
  }
  return { outputs, missing };
}

/** 运行输入摘要（脱敏：截断长字符串与深层对象） */
export function summarizeValue(value: unknown, maxDepth = 2): unknown {
  if (typeof value === 'string') {
    return value.length > 80 ? `${value.slice(0, 80)}…（已截断）` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) {
    if (maxDepth <= 0) return `[数组 ${value.length} 项]`;
    return value.slice(0, 5).map((v) => summarizeValue(v, maxDepth - 1));
  }
  if (typeof value === 'object') {
    if (maxDepth <= 0) return '[对象]';
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (['apikey', 'token', 'secret', 'authorization', 'password'].includes(k.toLowerCase())) {
        out[k] = '[已脱敏]';
        continue;
      }
      out[k] = summarizeValue(v, maxDepth - 1);
    }
    return out;
  }
  return String(value);
}
