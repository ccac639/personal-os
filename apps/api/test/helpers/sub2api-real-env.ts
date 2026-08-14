/**
 * Sub2API 双模测试环境决策点（阶段 2）。
 *
 * 模式开关：`SUB2API_REAL_BACKEND=1` 启用真实后端冒烟，否则一律 fake。
 * - 默认（CI）：fake adapter（sub2api-module.spec.ts 的权威基线，行为不变）；
 * - 人工：`SUB2API_REAL_BACKEND=1` + `SUB2API_REAL_BASE_URL` +
 *   `SUB2API_REAL_TOKEN` 环境变量注入真实连接（进程内，不落盘、不进 git）。
 *
 * 红线：本文件不包含、不导出任何真实凭据；真实响应体只允许在测试进程内
 * 断言结构，禁止写入快照 / 日志 / 文件。
 */

export const SUB2API_REAL_ENABLED: boolean = process.env.SUB2API_REAL_BACKEND === '1';

/** real 模式凭据（进程内读取；缺失即抛错，避免半配置跑出误导性结果） */
export function realSub2ApiEnv(): { baseUrl: string; apiToken: string } {
  const baseUrl = process.env.SUB2API_REAL_BASE_URL;
  const apiToken = process.env.SUB2API_REAL_TOKEN;
  if (!baseUrl || !apiToken) {
    throw new Error(
      'SUB2API_REAL_BACKEND=1 需要同时提供 SUB2API_REAL_BASE_URL 与 SUB2API_REAL_TOKEN（仅进程内使用，不落盘）',
    );
  }
  return { baseUrl, apiToken };
}

/** 当前模式名称（测试报告可读） */
export function sub2ApiTestModeLabel(): string {
  return SUB2API_REAL_ENABLED ? 'real（真实后端冒烟）' : 'fake（CI 权威基线）';
}
