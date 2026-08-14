/**
 * 脱敏工具：日志、错误、诊断输出前统一清洗敏感信息。
 *
 * 覆盖：
 * - 连接串 / 凭证类 URL（mongodb://user:pass@host、redis://…、https://user:pass@…）
 * - 常见敏感字段（password/token/secret/key/authorization/cookie 等）
 * - 请求头（Authorization / X-API-Key / Cookie / Set-Cookie）
 * - URL query 中的敏感参数（保留非敏感参数）
 */

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'x-api-key',
  'proxy-authorization',
  'cookie',
  'set-cookie',
]);

const SENSITIVE_QUERY_PARAMS = new Set([
  'key',
  'token',
  'secret',
  'password',
  'passwd',
  'api_key',
  'apikey',
  'access_token',
  'authorization',
  'code',
]);

/** 字段级敏感值：`"password": "xxx"` / `password=xxx` / `token: xxx` 等 */
const SENSITIVE_FIELD_RE =
  /(["\w.-]*?(?:password|passwd|pwd|token|secret|api[_-]?key|authorization|credential|private[_-]?key)["\w.-]*?)(\s*[:=]\s*)(["']?)([^"'\s,;}{]+)/gi;

/** URI 凭证：mongodb://user:pass@host → mongodb://***@host（保留 host 便于排查） */
export function redactUriCredentials(value: string): string {
  return value
    .replace(/(mongodb(\+srv)?:\/\/)([^@\s]+)@/gi, '$1***@')
    .replace(/(rediss?:\/\/)([^@\s]+)@/gi, '$1***@')
    .replace(/(https?:\/\/)([^@\s/]+)@/gi, '$1***@');
}

/** 敏感字段值脱敏：`"password":"hunter2"` → `"password":"[REDACTED]"` */
export function redactSensitiveFields(value: string): string {
  return value.replace(SENSITIVE_FIELD_RE, (_match, name, sep, quote) => {
    void _match;
    return `${name}${sep}${quote}[REDACTED]`;
  });
}

/** 通用字符串脱敏（URI 凭证 + 敏感字段） */
export function redactSensitive(value: string): string {
  return redactSensitiveFields(redactUriCredentials(value));
}

/** 请求头脱敏：返回新对象，敏感头替换为 [REDACTED]，不做原地修改 */
export function redactHeaders(headers: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(headers)) {
    out[name] = SENSITIVE_HEADERS.has(name.toLowerCase()) ? '[REDACTED]' : value;
  }
  return out;
}

/**
 * URL 脱敏：query 中敏感参数值替换为 [REDACTED]。
 * 用于访问日志的 url 字段（route 不得包含 query 敏感信息）。
 */
export function redactUrl(url: string): string {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) {
    return url;
  }
  const path = url.slice(0, queryIndex);
  const query = url.slice(queryIndex + 1);
  const pairs = query.split('&').map((pair) => {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      return pair;
    }
    const name = pair.slice(0, eq);
    if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
      return `${name}=[REDACTED]`;
    }
    return pair;
  });
  return `${path}?${pairs.join('&')}`;
}
