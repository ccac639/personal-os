# ADR-0005: Worker 双线装配与统一队列契约（workflow-runs + chat-generation）

- 状态：Accepted（第二轮 P0 优化合并，取代 ADR-0010 第一轮基线）
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
3. **契约单一事实来源**：`packages/queue-contract`（@personal-os/queue-contract，
   纯数据包、**不依赖 BullMQ**）定义 queue/job/attempts(3)/backoff(1s 指数)/
   timeoutMs(120s)/removeOnComplete(200)/removeOnFail(1000)/concurrency/
   lockDuration/stalledInterval/Redis Key/Job Payload 类型；api 与 worker 均
   import 该包（`apps/api/test/queue-contract.spec.ts` 运行时断言两端消费一致，
   不再有镜像常量，也不做源码文本比对）。
   worker 侧 `queues/contract.ts` 仅做转发 + 在适配边界生成 BullMQ JobsOptions。
4. **BullMQ 6 已移除入队侧 `timeout` 选项**（v5 起废弃）：契约保留 `timeoutMs`
   作为统一超时值，改由 worker 侧处理器 `withJobTimeout` 强制：超时先 abort
   传给处理器的 AbortSignal（透传 adapter/engine 协作式中止，SDK 响应 signal
   真正取消底层 HTTP 请求），等底层任务 settle 后再抛可重试错误，杜绝
   「超时后后台继续执行」与 attempt 重叠；入队侧只传 attempts/backoff/
   removeOnComplete/removeOnFail。
5. **幂等**：入队侧 `jobId = runId`（BullMQ 同 jobId 去重）；消费侧双保险——
   workflow 跳过 cancelled/success 终态；chat 跳过 completed/cancelled、
   failed 重试前清空消息已写内容、消费时已 `cancelling` 直接落 cancelled。
6. **API Key 不入队**：Job 负载仅含文本快照；key 由 worker 经注入的
   SecretReader 从共享 Redis 读 `siliconflow:api_key`（与 api 侧
   AiSettingsService 同键，契约测试断言两端一致；main.ts 注入已有 Redis
   客户端，resolveAdapter 不创建隐藏连接，SecretReader 纳入 shutdown
   所有权）；未配置 key 抛 `config` 错误不重试。
7. **Provider 错误四分类 + BullMQ 映射**：`retryable`（5xx/网络/超时）、
   `non-retryable`（非法负载/业务终态）、`rate-limit`（429，携带 retry-after）、
   `config`（4xx/缺 key/模型错误）；未知错误默认 retryable，attempts 上限兜底。
   `toBullMqError`：non-retryable/config → `UnrecoverableError`（job 进入
   failed 集合、attemptsMade 不继续增长、不被记为 completed，只执行一次）；
   retryable/rate-limit/未知 → 原样透传由 BullMQ 重试。
   retry-after 真实生效：`settings.backoffStrategy` 消费 `WorkerError.retryAfterMs`
   （BullMQ 6 签名 `(attemptsMade, type, err, job)`，err 即处理器抛出的错误），
   无 retry-after 时回退指数退避，均 clamp 到 [1s, 60s]。
8. **优雅退出与生命周期**：SIGINT/SIGTERM → 停止接单 → 等待在途
   （shutdownGraceMs 为全局预算，多 worker 并行关闭共享同一预算，超出后统一
   force close，不会每个 worker 各等一整轮）→ 关闭 worker → closables
   （Queue/SecretReader）→ Redis.quit → Mongo.disconnect；
   failurePolicy=all 关闭全部已创建 handle（含初始化失败/超时的半初始化
   handle）；partial 覆盖 factory 创建失败与 waitUntilReady 失败；
   uncaughtException/unhandledRejection 记录 fatal 后走同一有序退出
   （不继续运行，由进程管理器重启）。
9. **单用户队列契约**：负载类型（ChatGenerateJobData / WorkflowRunJobData）
   严禁携带 ownerId/userId 与任何密钥（契约测试断言）；Chat 数据库 Schema 层
   的 ownerId 清理由独立迁移任务处理，不在本契约范围内。
10. **日志红线**：所有 job 日志含 queue/jobId/runId/attempt；错误信息经
    `redactSensitive`（sk-/api_key/bearer/JWT 模式）脱敏后截断 500 字符；
    连接串日志经 `redactUri` 去凭据；不记录提示词全文。

## 后果

- 正向：worker 生命周期完全可测（10 个 spec 文件、103 用例覆盖多 worker 注册/
  非法配置/重试分类/重复 job/shutdown/provider 超时与限流/超时后无后台写入/
  UnrecoverableError 映射/隐藏连接删除）；两端契约漂移会被 queue-contract.spec
  立即捕获；进程崩溃由进程管理器自愈。
- 负向：BullMQ 6 无入队侧 timeout，超时语义从"入队选项"变为"worker 侧强制"，
  新 worker 必须套 `withJobTimeout`（已封装在 registration.ts）；partial
  策略下失败队列的积压任务需人工关注；retry-after 依赖 backoffStrategy 的
  err 透传（BullMQ 6 支持），若未来版本变更需重新验证。

## 替代方案（已评估）

- **每队列独立进程**：隔离性最好但运维面大（个人项目过重）。弃。
- **api/worker 各自镜像常量 + 一致性测试**：第一轮曾用；第二轮改为共享
  packages/queue-contract 包，两端 import 同一契约最不易漂移，测试不再
  readFileSync 比对源码。已采纳共享包方案，镜像方案废弃。
- **恢复 BullMQ 4 的 timeout 选项**：降级依赖，不接受。弃。
