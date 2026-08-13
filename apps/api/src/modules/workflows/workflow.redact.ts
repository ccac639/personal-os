/**
 * 运行数据脱敏（运行记录不存 API Key / Token / 二进制 / 完整附件）
 *
 * - 敏感字段名（password/token/secret/apikey/authorization/cookie/credential…）→ [REDACTED]
 * - 字符串截断、数组限长、对象深度限制
 * - Buffer / TypedArray / Blob 等二进制 → [binary]
 * - 循环引用防护（WeakSet）
 */
import type { RunParams } from './workflow.types.js';

const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'token',
  'access_token',
  'refresh_token',
  'secret',
  'client_secret',
  'apikey',
  'api_key',
  'apikeytext',
  'authorization',
  'cookie',
  'credential',
  'credentials',
  'privatekey',
  'private_key',
  'x-api-key',
  'proxy-authorization',
]);

const MAX_STRING = 200;
const MAX_ARRAY = 20;
const MAX_DEPTH = 6;
const MAX_OBJECT_KEYS = 50;

/** 键名是否敏感（值应脱敏） */
export function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    SENSITIVE_KEYS.has(lower) ||
    lower.includes('password') ||
    lower.includes('token') ||
    lower.includes('secret') ||
    lower.includes('apikey') ||
    lower.includes('authorization')
  );
}

function isBinary(v: unknown): boolean {
  return (
    v instanceof Uint8Array ||
    v instanceof ArrayBuffer ||
    (typeof Buffer !== 'undefined' && Buffer.isBuffer(v)) ||
    (typeof Blob !== 'undefined' && v instanceof Blob)
  );
}

/** 递归脱敏（返回安全可持久化的 JSON 值） */
export function redactValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…（已截断）` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '[unsupported]';
  if (isBinary(value)) return '[binary]';
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    try {
      if (depth >= MAX_DEPTH) {
        return Array.isArray(value) ? `[数组 ${value.length} 项]` : '[对象]';
      }
      if (Array.isArray(value)) {
        const out: unknown[] = [];
        for (const item of value.slice(0, MAX_ARRAY)) {
          out.push(redactValue(item, depth + 1, seen));
        }
        if (value.length > MAX_ARRAY) out.push(`…（共 ${value.length} 项）`);
        return out;
      }
      const out: Record<string, unknown> = {};
      let count = 0;
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (count >= MAX_OBJECT_KEYS) {
          out['…'] = `（其余 ${Object.keys(value as Record<string, unknown>).length - count} 个键已省略）`;
          break;
        }
        count++;
        if (isSensitiveKey(k)) {
          out[k] = '[REDACTED]';
          continue;
        }
        out[k] = redactValue(v, depth + 1, seen);
      }
      return out;
    } finally {
      seen.delete(value);
    }
  }
  return String(value);
}

/** 构建运行输入摘要（脱敏后的变量上下文：用户传入变量 + 标准化变量） */
export function buildInputSummary(
  params: RunParams | undefined,
  variables: Record<string, unknown>,
): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if (params?.initialText !== undefined) {
    summary.input = redactValue(params.initialText);
  }
  // 用户显式传入的变量（脱敏保留），再覆盖标准化后的输入定义变量
  for (const [k, v] of Object.entries(params?.variables ?? {})) {
    summary[k] = isSensitiveKey(k) ? '[REDACTED]' : redactValue(v);
  }
  for (const [k, v] of Object.entries(variables)) {
    summary[k] = isSensitiveKey(k) ? '[REDACTED]' : redactValue(v);
  }
  return summary;
}

/** 构建运行输出摘要（脱敏） */
export function buildOutputSummary(outputs: Record<string, unknown>): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(outputs)) {
    summary[k] = redactValue(v);
  }
  return summary;
}

/** 节点输出脱敏（nodeResults 持久化用） */
export function redactNodeOutput(value: unknown): unknown {
  return redactValue(value, 0);
}
