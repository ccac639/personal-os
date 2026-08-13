import { z } from 'zod';

/**
 * 环境变量严格校验 schema（zod）。
 *
 * 规则（与 .env.example 一一对应）：
 * - 必填：API_HOST / API_PORT / MONGODB_URI / REDIS_URL / CORS_ORIGIN / NODE_ENV / LOG_LEVEL
 * - 可选：PERSONAL_OS_API_KEY（配置后启用 X-API-Key 鉴权）、SWAGGER_ENABLED
 * - 非法值直接抛错（fail-fast），不静默回退默认值
 */

const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
const nodeEnvs = ['development', 'test', 'production'] as const;

/** 严格 URL 校验：必须可解析且协议在白名单内（zod .url() 对裸 host:port 过宽松） */
function urlWithProtocol(protocols: string[], label: string) {
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

export const envSchema = z.object({
  NODE_ENV: z.enum(nodeEnvs).default('development'),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  API_HOST: z.string().min(1, '不能为空').default('127.0.0.1'),
  API_PORT: z.coerce.number().int('必须是整数').min(1, '范围 1-65535').max(65535, '范围 1-65535').default(3000),
  MONGODB_URI: urlWithProtocol(['mongodb:', 'mongodb+srv:'], 'mongodb:// 或 mongodb+srv://'),
  REDIS_URL: urlWithProtocol(['redis:', 'rediss:'], 'redis:// 或 rediss://'),
  CORS_ORIGIN: urlWithProtocol(['http:', 'https:'], 'http:// 或 https://'),
  PERSONAL_OS_API_KEY: z.string().min(8, '至少 8 位').optional(),
  SWAGGER_ENABLED: z.enum(['true', 'false']).optional(),
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
