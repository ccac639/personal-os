import { readFileSync } from 'node:fs';

/**
 * 极简 .env 加载器（不引入 dotenv 依赖）：
 * 在 bootstrap 最早期将 .env 文件填充进 process.env（已存在的变量不覆盖），
 * 供 FastifyAdapter 构造参数（bodyLimit）与配置校验使用。
 * 之后 ConfigModule 仍按自身 envFilePath 加载（幂等，行为一致）。
 *
 * 仅支持本仓库 .env 用到的语法：`KEY=VALUE`、`#` 注释、可选引号包裹。
 */
export function loadEnvFile(paths: string[]): void {
  for (const path of paths) {
    let content: string;
    try {
      content = readFileSync(path, 'utf8');
    } catch {
      continue; // 文件不存在：跳过（与 ConfigModule 行为一致）
    }
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (line.length === 0 || line.startsWith('#')) {
        continue;
      }
      const eq = line.indexOf('=');
      if (eq <= 0) {
        continue;
      }
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }
}
