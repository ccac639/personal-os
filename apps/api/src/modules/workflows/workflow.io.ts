/**
 * 运行输入输出构建（对齐 web 端 io.ts 语义）
 *
 * - buildRunInput：从用户输入 + 默认值合并出完整变量上下文，字段级校验
 * - summarizeOutputs：按输出定义从节点输出中提取结构化结果
 */
import type { WorkflowInputDef, WorkflowOutputDef } from './workflow.types.js';
import { validateInputValue } from './workflow.validation.js';

export interface IoInput {
  variables: Record<string, unknown>;
  errors: Record<string, string>;
}

/** 合并用户输入与默认值，产出运行变量上下文 */
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

/** 从节点输出对象按点路径取值 */
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
