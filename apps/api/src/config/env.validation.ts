import { isIP } from 'node:net';

import { z } from 'zod';

/**
 * 环境变量严格校验 schema（zod）。
 *
 * 规则（与 .env.example 一一对应）：
 * - 必填：API_HOST / API_PORT / MONGODB_URI / REDIS_URL / CORS_ORIGIN / NODE_ENV / LOG_LEVEL
 * - 可选：PERSONAL_OS_API_KEY（production 必填，≥8 位）、SWAGGER_ENABLED
 * - 请求保护：REQUEST_TIMEOUT_MS / REQUEST_BODY_LIMIT_BYTES / HEALTH_CHECK_TIMEOUT_MS /
 *   RATE_LIMIT_MAX_REQUESTS / RATE_LIMIT_WINDOW_MS（有安全下限，非法值抛错）
 * - TRUST_PROXY：'true' | 'false' | IP/CIDR 逗号列表（默认 false，不信任代理头）
 * - 非法值直接抛错（fail-fast），不静默回退默认值
 */

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const nodeEnvs = ['development', 'test', 'production'] as const;

/** 严格 URL 校验：必须可解析且协议在白名单内（zod .url() 对裸 host:port 过宽松） */
function urlWithProtocol(protocols: string[]) {
  return z.string().refine(
    (value) => {
      try {
        return protocols.includes(new URL(value).protocol);
      } catch {
        return false;
      }
    },
    `必须是 ${protocols.join(' / ')} 开头的合法 URL`,
  );
}

/** 合法 IP（v4/v6）或 CIDR（v4 前缀 1-32、v6 前缀 1-128）；非法返回 false */
function isIpOrCidr(value: string): boolean {
  if (value.includes('/')) {
    const [ip, prefix] = value.split('/');
    if (ip === undefined || prefix === undefined || !/^\d{1,3}$/.test(prefix)) {
      return false;
    }
    const prefixNum = Number(prefix);
    if (isIP(ip) === 4) {
      return prefixNum >= 1 && prefixNum <= 32;
    }
    if (isIP(ip) === 6) {
      return prefixNum >= 1 && prefixNum <= 128;
    }
    return false;
  }
  return isIP(value) !== 0;
}

/**
 * CORS_ORIGIN：逗号分隔的 http(s) origin 白名单。
 * 拒绝 `*`（宽松 CORS 任何环境都不允许）、拒绝空项、拒绝非 http(s) 值。
 */
const corsOriginsSchema = z
  .string()
  .transform((value) => value.split(',').map((part) => part.trim()))
  .pipe(
    z
      .array(
        z.string().refine((origin) => {
          try {
            const url = new URL(origin);
            return url.protocol === 'http:' || url.protocol === 'https:';
          } catch {
            return false;
          }
        }, '必须是 http:// 或 https:// 开头的合法 origin'),
      )
      .refine((origins) => origins.every((o) => o.length > 0), '不能包含空项'),
  );

/**
 * TRUST_PROXY：'true' / 'false' → boolean；否则按 IP/CIDR 逗号列表解析为 string[]。
 * 空项（如 `127.0.0.1,,8.8.8.8`）与非法 IP/CIDR 直接抛错（fail-fast）。
 */
const trustProxySchema = z.preprocess(
  (value) => {
    if (value === undefined) {
      return undefined;
    }
    const raw = String(value);
    if (raw === 'true' || raw === 'false') {
      return raw === 'true';
    }
    return raw.split(',').map((part) => part.trim());
  },
  z
    .union([
      z.boolean(),
      z
        .array(z.string())
        .min(1, '不能为空')
        .refine((items) => items.every((item) => item.length > 0), '不能包含空项')
        .refine((items) => items.every(isIpOrCidr), '必须是合法 IP 或 CIDR'),
    ])
    .default(false),
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(nodeEnvs).default('development'),
    LOG_LEVEL: z.enum(logLevels).default('info'),
    API_HOST: z.string().min(1, '不能为空').default('127.0.0.1'),
    API_PORT: z.coerce
      .number()
      .int('必须是整数')
      .min(1, '范围 1-65535')
      .max(65535, '范围 1-65535')
      .default(3000),
    MONGODB_URI: urlWithProtocol(['mongodb:', 'mongodb+srv:']),
    REDIS_URL: urlWithProtocol(['redis:', 'rediss:']),
    CORS_ORIGIN: corsOriginsSchema,
    PERSONAL_OS_API_KEY: z.string().min(8, '至少 8 位').optional(),
    SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
    REQUEST_TIMEOUT_MS: z.coerce.number().int('必须是整数').min(1, '必须 ≥ 1').default(30_000),
    REQUEST_BODY_LIMIT_BYTES: z.coerce
      .number()
      .int('必须是整数')
      .min(1024, '必须 ≥ 1024')
      .default(1_048_576),
    HEALTH_CHECK_TIMEOUT_MS: z.coerce.number().int('必须是整数').min(1, '必须 ≥ 1').default(2_000),
    RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int('必须是整数').min(1, '必须 ≥ 1').default(300),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int('必须是整数').min(1, '必须 ≥ 1').default(60_000),
    TRUST_PROXY: trustProxySchema,
  })
  .superRefine((data, ctx) => {
    // 生产环境安全策略：任何监听方式都必须配置 API Key（fail-fast）
    if (data.NODE_ENV === 'production' && data.PERSONAL_OS_API_KEY === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['PERSONAL_OS_API_KEY'],
        message: '生产环境安全策略：NODE_ENV=production 时必须配置 PERSONAL_OS_API_KEY',
      });
    }
  });

export type EnvVars = z.infer<typeof envSchema>;

/** 解析并严格校验 process.env；失败时抛出带字段明细的错误（fail-fast） */
export function parseEnv(env: NodeJS.ProcessEnv = process.env): EnvVars {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`环境配置校验失败（请检查 .env / .env.example）：\n${issues}`);
  }
  return result.data;
}
