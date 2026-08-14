# ADR-0005: Worker 双线装配与统一队列契约（workflow-runs + chat-generation）

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Developer（Worker 线所有者，经用户任务授权）

## 背景

`apps/worker` 原本只有 workflow-runs worker 骨架；chat-generation 与 AI
provider 已有基础代码但未统一装配。用户要求：配置/连接/注册/退出可测试拆分、
双 worker 同时装配且单点失败策略明确、队列契约（queue/job/attempts/backoff/
timeout/removeOn*）统一、Job 幂等、API Key 严禁入队、Provider 错误分类、
优雅退出、uncaughtException 有序退出、日志含 queue/jobId/runId 但不含
提示词与密钥。

## 决策

1. **启动入口拆分**（`main.ts` 薄壳 + `config.ts` + `workers/manager.ts` +
   `workers/registration.ts`）：配置校验失败打印问题清单并 `exit(1)`（进程
   管理器重启）；连接 Mongo → Redis → 装配两个 worker → `startWorkers`
   并行等待就绪。
2. **单 worker 初始化失败策略**：`WORKER_FAILURE_POLICY=all`（默认，任一失败
   关闭已就绪 worker 并整体退出）| `partial`（关闭失败 worker，继续运行健康
   worker，日志明确告警）。
3. **契约单一事实来源**：`worker/src/queues/contract.ts` 的 `QUEUE_CONTRACT`
   定义 queue/job/attempts(3)/backoff(1s 指数)/timeoutMs(120s)/
   removeOnComplete(200)/removeOnFail(1000)/concurrency/lockDuration/
   stalledInterval；api 侧镜像常量，由 `apps/api/test/queue-contract.spec.ts`
   运行时断言两端一致。
4. **BullMQ 6 已移除入队侧 `timeout` 选项**（v5 起废弃）：契约保留 `timeoutMs`
   作为统一超时值，改由 worker 侧处理器 `withJobTimeout` 强制（超时按可重试
   错误上抛，指数退避重试）；入队侧只传 attempts/backoff/removeOnComplete/
   removeOnFail。
5. **幂等**：入队侧 `jobId = runId`（BullMQ 同 jobId 去重）；消费侧双保险——
   workflow 跳过 cancelled/success 终态；chat 跳过 completed/cancelled、
   failed 重试前清空消息已写内容、消费时已 `cancelling` 直接落 cancelled。
6. **API Key 不入队**：Job 负载仅含文本快照；key 由 worker 从 Redis
   `siliconflow:api_key` 读取（与 api 侧 AiSettingsService 同键，契约测试
   断言两端一致）；未配置 key 抛 `config` 错误不重试。
7. **Provider 错误四分类**：`retryable`（5xx/网络/超时）、`non-retryable`
   （非法负载/业务终态）、`rate-limit`（429，携带 retry-after）、`config`
   （4xx/缺 key/模型错误）；未知错误默认 retryable，attempts 上限兜底。
8. **优雅退出**：SIGINT/SIGTERM → 停止接单 → 等待在途（grace 默认 30s，
   超时强制关闭）→ 关闭 worker → Redis.quit → Mongo.disconnect；
   uncaughtException/unhandledRejection 记录 fatal 后走同一有序退出
   （不继续运行，由进程管理器重启）。
9. **日志红线**：所有 job 日志含 queue/jobId/runId/attempt；错误信息经
   `redactSensitive`（sk-/api_key/bearer/JWT 模式）脱敏后截断 500 字符；
   连接串日志经 `redactUri` 去凭据；不记录提示词全文。

## 后果

- 正向：worker 生命周期完全可测（9 个 spec 文件、86 用例覆盖多 worker 注册/
  非法配置/重试分类/重复 job/shutdown/provider 超时与限流）；两端契约漂移
  会被 queue-contract.spec 立即捕获；进程崩溃由进程管理器自愈。
- 负向：BullMQ 6 无入队侧 timeout，超时语义从"入队选项"变为"worker 侧强制"，
  新 worker 必须套 `withJobTimeout`（已封装在 registration.ts）；partial
  策略下失败队列的积压任务需人工关注。

## 替代方案（已评估）

- **每队列独立进程**：隔离性最好但运维面大（个人项目过重）。弃。
- **共享 packages 常量包**：两端 import 同一契约最不易漂移，但跨 app 运行时
  依赖引入装配复杂度；当前用镜像常量 + 一致性测试等价达成。备选记录。
- **恢复 BullMQ 4 的 timeout 选项**：降级依赖，不接受。弃。
