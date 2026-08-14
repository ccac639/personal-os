import { BadRequestException } from '@nestjs/common';

/** 常见敏感信息形态：API Key / Bearer Token / JWT */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\b(sk-[A-Za-z0-9_-]{8,})\b/g,
  /\b(api[_-]?key)\s*[=:]\s*["']?([A-Za-z0-9_-]{8,})/gi,
  /\b(bearer)\s+([A-Za-z0-9._~+/=-]{16,})/gi,
  /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
];

/** 对服务端生成/记录的文本做脱敏（用户自身输入的消息内容按原样存储） */
export function redactSensitive(input: string): string {
  if (!input) return input;
  return SENSITIVE_PATTERNS.reduce((acc, pattern) => acc.replace(pattern, '[REDACTED]'), input);
}

/**
 * 二进制载荷检测：data:/blob:/file: URI、外链 URL、疑似 base64 长串。
 * base64 判定要求 64+ 字符且含 +/-/= 特征，避免误伤普通英文文本。
 */
export function isBinaryPayload(text: string): boolean {
  const trimmed = text.trim();
  if (/^(data:|blob:|file:)/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  const compact = trimmed.replace(/\s+/g, '');
  if (
    compact.length >= 64 &&
    /[+/]/.test(compact) &&
    /[A-Za-z]/.test(compact) &&
    /\d/.test(compact)
  ) {
    if (/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) return true;
  }
  return false;
}

/**
 * 校验文本字段不含二进制/外链载荷。
 * - allowUrl=true 时允许纯 http(s) 链接（如描述文本），但仍拒绝 data:/blob:/file: 与 base64。
 */
export function assertTextOnly(
  text: string | undefined,
  field: string,
  options?: { allowUrl?: boolean },
): void {
  if (text === undefined || text === '') return;
  const trimmed = text.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  if (isBinaryPayload(trimmed) && !(options?.allowUrl === true && isUrl)) {
    throw new BadRequestException(`字段 ${field} 不允许包含二进制或外链载荷`);
  }
}

/** 正则转义（用于搜索框输入的 safe regex 构造） */
export function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
