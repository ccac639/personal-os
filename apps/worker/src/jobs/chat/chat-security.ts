/** Worker 侧敏感信息脱敏（与 API 侧策略一致：不记录密钥类文本） */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9_-]{8,})\b/g,
  /\b(api[_-]?key)\s*[=:]\s*["']?([A-Za-z0-9_-]{8,})/gi,
  /\b(bearer)\s+([A-Za-z0-9._~+/=-]{16,})/gi,
  /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
];

export function redactSensitive(input: string): string {
  if (!input) return input;
  return SENSITIVE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), input);
}
