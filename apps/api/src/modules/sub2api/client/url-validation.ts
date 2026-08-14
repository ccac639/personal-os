/**
 * Sub2API Base URL 校验与上游 URL 构造。
 *
 * 安全边界（SSRF 防护）：
 * - 仅允许 http / https 协议；
 * - 主机名必须存在且为合法 host（域名 / IPv4 / IPv6，不含空格、换行）；
 * - 禁止 userinfo（user:pass@）、query、hash；
 * - 路径只允许空或 / 开头的合法路径，禁止 .. 段；
 * - 代理目标路径只能来自内部固定白名单（见 sub2api.client.ts），
 *   客户端永远无法指定任意上游 URL —— 这是「禁止代理任意 URL」的根本手段。
 */

const MAX_BASE_URL_LENGTH = 2_048;

export type BaseUrlValidation = { ok: true; url: URL } | { ok: false; reason: string };

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

export function validateBaseUrl(raw: string): BaseUrlValidation {
  const value = raw.trim();
  if (!value) return { ok: false, reason: '不能为空' };
  if (value.length > MAX_BASE_URL_LENGTH) {
    return { ok: false, reason: `长度不能超过 ${MAX_BASE_URL_LENGTH}` };
  }

  let url: URL;
  // URL 构造会规范化路径（/a/../b → /b），必须先检查原始字符串中的 .. 段，
  // 否则基于 pathname 的检查会被绕过（SSRF 路径穿越）。
  const rawPath = value.split(/[?#]/)[0] ?? value;
  if (rawPath.split('/').includes('..')) {
    return { ok: false, reason: '路径不允许包含 .. 段' };
  }
  try {
    url = new URL(value);
  } catch {
    return { ok: false, reason: '不是合法的 URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: '仅支持 http / https 协议' };
  }
  if (url.username || url.password) {
    return { ok: false, reason: '不允许包含用户名或密码' };
  }
  if (url.search || url.hash) {
    return { ok: false, reason: '不允许携带 query 或 hash' };
  }
  if (!url.hostname || !HOSTNAME_RE.test(url.hostname)) {
    return { ok: false, reason: '主机名不合法' };
  }
  const path = url.pathname;
  if (path.split('/').includes('..')) {
    return { ok: false, reason: '路径不允许包含 .. 段' };
  }
  return { ok: true, url };
}

/**
 * 由 Base URL + 白名单内路径构造上游完整 URL。
 * @param baseUrl 已通过 validateBaseUrl 的 Base URL
 * @param apiPath 必须以 / 开头（如 /admin/system/version）；本模块所有调用方
 *                只传入内部常量，不接受外部输入拼路径
 */
export function buildUpstreamUrl(baseUrl: string, apiPath: string): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (!apiPath.startsWith('/')) {
    throw new Error(`internal: apiPath must start with '/', got ${apiPath}`);
  }
  return `${normalized}/api/v1${apiPath}`;
}
