# ADR-0007: 平台基座安全加固（API Key 强制策略 / 可信代理 / 启动装配）

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Orchestrator（平台基座分线，Node 后端）

## 背景

平台基座分线要求：完善环境变量 Zod fail-fast 校验、X-API-Key 机器级访问保护、
CORS 白名单、可信代理、监听地址、安全响应头、限流/超时/ObjectId/分页/统一错误码、
日志脱敏、健康检查（存活/就绪/Mongo/Redis）、统一响应结构与 requestId，
默认面向 localhost，局域网/公网须显式开启。

## 决策

1. **生产环境强制 API Key（fail-fast）**：`NODE_ENV=production` 时
   `PERSONAL_OS_API_KEY` 缺失或 <8 位 → 启动即抛错退出（无论监听地址是否
   loopback）。开发/测试不配置即显式关闭鉴权。理由：生产缺少鉴权保护的风险
   高于本地便利；替代方案"prod+loopback 可免 Key"被否决（存在误配 0.0.0.0
   的风险敞口）。
2. **可信代理显式开启**：新增 `TRUST_PROXY`（默认 false；`true` / `false` /
   IP·CIDR 逗号列表），传入 FastifyAdapter，影响限流指纹与访问日志中的客户端
   IP。仅在反向代理部署时开启。
3. **启动装配完整化**：`main.ts` 最早阶段 `loadEnvFile` + `configuration()`
   （校验失败进程 fail-fast），FastifyAdapter 注入 `bodyLimit`
   （REQUEST_BODY_LIMIT_BYTES）与 `trustProxy`；接入安全响应头与请求超时
   hook；修复 CORS 读取键名错误（`cors.origin` → `cors.origins`）。
4. **统一错误码补全**：`ERROR_CODES` 增加 API_KEY_MISSING / API_KEY_INVALID /
   METHOD_NOT_ALLOWED / UNSUPPORTED_MEDIA_TYPE / BAD_GATEWAY / GATEWAY_TIMEOUT，
   守卫与异常过滤器改用枚举，业务模块禁止自行发明错误码。
5. **响应与日志双重脱敏**：响应体 `path`、超时 408 的 `path`、开发期请求日志
   URL 一律经 `redactUrl`（敏感 query 参数值 → `[REDACTED]`）；请求头
   （Authorization / X-API-Key / Cookie）不入访问日志；请求正文默认不记录。
6. **限流内存有界**：滑动窗口限流器在 key 数 ≥1000 时惰性触发 cleanup，
   无需外部定时器。

## 后果

- 生产部署必须维护至少 8 位 API Key（单一机器级 Key，个人单用户语义）。
- 反向代理部署需按实际代理地址配置 TRUST_PROXY，否则限流/日志显示代理 IP。
- 默认配置零外部暴露：127.0.0.1 + 无 Key（开发）；生产默认拒绝启动直至配置
  Key——宁缺毋滥。

## 替代方案

- 生产允许 loopback 免 Key：否决（见决策 1）。
- 引入 Helmet 依赖：否决，手写 3 个关键安全头已够（个人系统，减少依赖面）。
- 限流用定时器定期 cleanup：否决，惰性清理更简单、无空闲定时器开销。
