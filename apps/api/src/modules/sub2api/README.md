# Sub2API 管理模块

Personal OS 内置的 Sub2API（Wei-Shaw/sub2api，官方仓库
`https://github.com/Wei-Shaw/sub2api`，契约核对基准 2026-08-15 main 分支）
管理控制台。调用链：**Web → Personal OS API（/api/sub2api/\*）→ Sub2API**，
前端不持有管理凭据、不直连上游。

## 接口能力清单（已核对的真实管理端点）

| 能力           | 上游端点                                                                     | Personal OS 路由                                    |
| -------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| 版本           | `GET /api/v1/admin/system/version`                                           | `GET /sub2api/overview`（聚合）                     |
| 仪表盘统计     | `GET /api/v1/admin/dashboard/stats`                                          | 同上                                                |
| 实时指标       | `GET /api/v1/admin/dashboard/realtime`                                       | 同上                                                |
| 用量趋势       | `GET /api/v1/admin/dashboard/trend`                                          | 同上                                                |
| 请求错误日志   | `GET /api/v1/admin/ops/request-errors`                                       | 同上                                                |
| 渠道 CRUD      | `/api/v1/admin/channels[/:id]`                                               | `/api/sub2api/channels[/:id]`                       |
| 账号（订阅源） | `/api/v1/admin/accounts[/:id]`、`/accounts/:id/test`                         | `/api/sub2api/accounts[/:id]`、`/accounts/:id/test` |
| 订阅           | `/api/v1/admin/subscriptions`、`/subscriptions/:id/revoke`                   | `/api/sub2api/subscriptions[/:id/revoke]`           |
| 模型分组       | `/api/v1/admin/groups[/:id]`                                                 | `/api/sub2api/groups[/:id]`                         |
| 模型路由       | `/api/v1/admin/groups/:id/routes[/:routeId]`                                 | `/api/sub2api/groups/:id/routes[/:routeId]`         |
| API 凭据       | `GET/POST /api/v1/keys`、`PUT/DELETE /api/v1/keys/:id`（**无 /admin 前缀**） | `/api/sub2api/keys[/:id]`                           |
| 请求日志       | `/api/v1/usage`、`/api/v1/usage/stats`（另有 `/admin/usage/*` 管理端变体）   | `/api/sub2api/usage`、`/usage/stats`                |

上游契约要点：响应信封 `{ code: 0, message, data }`；分页
`{ items, total, page, page_size, pages }`；字段 snake_case。

## 字段子集声明策略

`types/sub2api.contract.ts` 只声明本模块实际使用的字段子集；上游新增字段
原样透传不破坏解析。真实冒烟（`SUB2API_REAL_BACKEND=1`）发现偏差时，
先在 `ADR-0012` 记录偏差清单再改代码。

## 双模测试

- 默认（CI）：`test/sub2api-module.spec.ts` 注入 `FakeSub2ApiAdapter`，权威基线；
  `test/sub2api-module.real.spec.ts` 自动 skip。
- 人工冒烟（本地具备真实实例时）：
  ```bash
  SUB2API_REAL_BACKEND=1 \
  SUB2API_REAL_BASE_URL=https://sub2api.example.com \
  SUB2API_REAL_TOKEN=<管理端 token> \
  pnpm --filter @personal-os/api exec vitest run test/sub2api-module.real.spec.ts
  ```
  凭据仅进程内读取，不落盘、不进 git、不写日志；真实响应体禁止入库。

## 安全边界（红线，禁止削弱）

- 凭据存 Redis（`sub2api:base_url` / `sub2api:api_token`，TTL 30 天），
  不落 Mongo 明文 / .env / 日志 / localStorage；token 永不回显。
- SSRF：Base URL 协议/主机/路径校验（含 `..` 段预检）+ 上游路径白名单
  （`client/sub2api.client.ts` 内部模板）+ `redirect: 'error'`。
- 请求保护：超时（AbortSignal）、响应体 2MB 上限、分页强制
  `page/page_size`（默认 20）、列表禁止无限拉取。
- 错误映射：401/403/404/409/429/超时/5xx → 稳定 `SUB2API_*` 码；
  消息脱敏；透传 requestId；不泄漏敏感响应头。

## 未支持能力（明确不在范围）

多用户/登录/注册/JWT/角色权限、iframe 嵌入、用户管理/邀请/套餐充值、
渠道自动/手动补货、故障转移模拟 —— 一律不实现、不预留伪端点。
