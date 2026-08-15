# ADR-0017 · API 进程级韧性与异常处理一致性

- 状态：已接受
- 日期：2026-08-15
- 归属：apps/api（维护修复线 B-MNT）

## 背景

HTTP 层异常已由 `AllExceptionsFilter`（全局过滤器）统一兜底（信封 + 脱敏），
但存在三类进程级韧性缺口：

1. **进程级未捕获错误无守卫**：全仓 `process.on('unhandledRejection'|
'uncaughtException')` 零注册 → 崩溃静默且无日志，无法事后排查。
2. **SIGTERM/SIGINT 不触发优雅关闭**：`app.enableShutdownHooks()` 未调用，
   仅 `RedisModule.onApplicationShutdown`（quit）存在但不会被信号触发。
3. **Mongoose 连接韧性不足**：仅 `lazyConnection + serverSelectionTimeoutMS:
3000 + retryAttempts: 1`，无 socket 超时 / 连接池上限 / 写重试。

## 决策

### G1-A · uncaughtException：记录后受控退出（不 resume）

- 结构化日志（`traceId` + `err`，pino 序列化完整堆栈）后触发受控退出：
  `app.close()`（触发 `onApplicationShutdown` → Redis quit + Mongoose
  disconnect，@nestjs/mongoose 11.0.4 自带该钩子）→ `process.exit(1)`。
- **绝不 resume 继续运行**：崩溃后堆/句柄状态不可信，resume 有静默数据损坏风险。

### G2-A · unhandledRejection：记录并受控退出

- 与 uncaughtException 同路径（error 级别日志 + 受控退出）。
- 理由：被忽略的 rejection 多数源于 `await` 缺失或回调竞态，状态同样不可信。

### G3-A · 关联 ID：请求级 requestId + 进程级 traceId

- 请求内错误日志：`requestId`（`RequestIdInterceptor` 生成，`x-request-id` 头或
  randomUUID），`AllExceptionsFilter` 日志改为结构化字段 `{ requestId, err }`
  （原先 stack 被 nestjs-pino 当作 context 字段，非 err 字段）。
- 进程级日志：无请求上下文，生成 `traceId = randomUUID()`。

### 优雅关闭信号

- `app.enableShutdownHooks()`：SIGINT/SIGTERM → Nest 生命周期 →
  `onApplicationShutdown`（Redis quit + Mongoose disconnect）。

### Mongoose 连接韧性（有界，不无限挂起）

- `socketTimeoutMS: 45_000`（socket 无响应超时）
- `maxPoolSize: 20`（默认 100 偏大，个人应用 20 足够）
- `retryWrites: true`（副本集下防瞬时主从切换失败）
- `retryAttempts: 3` + `retryDelay: 1000`（模块级有界重试，替代原 1 次）
- `serverSelectionTimeoutMS: 3000`（保留：驱动级选择超时）

## 后果

- 崩溃有结构化日志（traceId 可跨日志检索），退出路径受控（先断依赖再 exit）。
- 连接失败有界重试，不会无限挂起；/health 仍反映依赖真实状态。
- 守卫逻辑独立为 `src/common/process-guard.ts`（依赖注入 exit/close，
  `process-guard.spec.ts` 4 用例 mock 验证日志 + close + exit 路径）。

## 替代方案

- **uncaughtException 后 resume**：拒绝（状态不可信，静默数据损坏风险）。
- **PM2 / 集群自动重启**：不引入（单进程个人应用；红线禁止 PM2/集群改动）。
- **无限重试**：拒绝（有界 3 次 + 驱动级选择超时 3s 已保证不挂起）。
- **守卫逻辑内联 main.ts**：拒绝（不可单测；独立模块可 mock 验证退出路径）。
