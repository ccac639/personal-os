# ADR-0005: Worker 异步任务分线（workflow-runs + chat-generation）

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Architect / Developer（Worker 分线）

## 背景

Personal OS 需要统一的异步任务分线：Workflow 运行与 Chat 生成都要在独立
Worker 进程中执行，且必须满足：密钥不落队列/Mongo/日志、错误可分类重试、
任务可取消、优雅退出、单 Job 失败不污染其他 Job。此前 worker 仅是骨架
（main.ts 只初始化日志），workflow-runs 与 chat-generation 两条线散落在
api 侧与 worker 侧，契约靠注释约定。

## 决策

1. **队列契约单一事实来源**：`apps/worker/src/queues/contract.ts`
   （`QUEUE_CONTRACT`）统一 queue / job 名、attempts、backoff、timeout、
   removeOnComplete / removeOnFail、concurrency、lockDuration、
   stalledInterval；api 侧镜像常量由 `apps/api/test/queue-contract.spec.ts`
   运行时断言一致（非注释约定）。
2. **双 worker 并行装配**：`apps/worker/src/main.ts` 同时创建
   workflow-runs（`createWorkflowWorker`）与 chat-generation
   （`createChatWorker`）；装配与生命周期抽离为可测试模块
   （`workers/registration.ts` / `workers/manager.ts`），main.ts 只做
   连接与编排。多 worker 初始化失败策略：`WORKER_FAILURE_POLICY=all`
   （默认，任一失败整体退出由进程管理器重启）| `partial`（继续健康 worker）。
3. **幂等：jobId = runId + 状态级重复消费保护**。api 入队
   `jobId: runId`（BullMQ 同 jobId 去重）；worker 消费侧再按 run 状态
   防重（chat：completed/cancelled 直接返回、failed 先清内容再重跑；
   workflow：cancelled/success 跳过）。
4. **密钥不落任何持久化与日志**：Job payload 仅含文本快照与 id
   （chat 负载无 apiKey 字段，queue-contract.spec 断言）；SiliconFlow
   key 由 worker 从 Redis 读取（与 api 侧 AiSettingsService 同键）；
   错误/日志统一经 `chat-security.redactSensitive` 与
   `workflows/redact.ts`（敏感键名 + 长度/深度截断）脱敏。
5. **Provider 错误五分类**（`providers/errors.ts` + `errors/worker-errors.ts`）：
   429 → rate-limit（可重试，携带 retry-after）；4xx → config（不重试）；
   5xx / 网络 / 超时 → retryable（指数退避）；输入非法/终态 → non-retryable
   （落库后正常完成）；未知 → retryable（attempts 兜底）。
6. **超时由 worker 侧强制**：BullMQ 6 已移除入队侧 timeout 选项；
   `registration.ts` 用 `withJobTimeout` 按契约 timeoutMs 包裹处理器，
   adapter 层另有 60s 请求超时双保险。
7. **取消与状态机**：api 侧置 cancelling（chat）/ cancelled（workflow）
   并尝试移除队列任务；worker 每段/每步检查 DB 状态协作式中止；终态
   （completed/failed/cancelled）必落库，单 Job 失败经 BullMQ 内建隔离
   不污染其他 Job，也不让 run 永久停留在 running。
8. **生命周期**：`SIGINT/SIGTERM` → `shutdown()`（停止接单 → 等待在途
   （grace 上限）→ 关闭 worker → Redis → Mongo）；`uncaughtException` /
   `unhandledRejection` 记录后有序退出，交进程管理器重启。

## 后果

- 正向：两端契约不再靠注释，改契约一处即被一致性测试拦截；worker 装配/
  生命周期全部可单测（不依赖真实 Redis/Mongo）；密钥路径全链路可审计。
- 负向：queue 名/job 名是跨进程契约，改名需两端同步（有测试兜底）；
  chat worker 取 key 依赖 Redis 可用（与 api 侧 AiSettingsService 同约束）。
- 迁移路径：新任务线（如媒体任务队列）按 QUEUE_CONTRACT 增条目 +
  registration.ts 注册即可，生命周期与错误分类自动复用。

## 替代方案（已评估）

- **worker 内嵌 api 进程**：省一个进程，但无法独立扩容/重启，优雅退出
  与崩溃隔离差。弃。
- **每队列独立 worker 进程**：隔离更彻底，但连接/生命周期重复、运维
  复杂；单机个人场景双 worker 共进程足够（BullMQ 内建 Job 隔离）。
- **幂等仅靠 jobId**：BullMQ 去重只覆盖「同 runId 重复入队」，不覆盖
  「任务被移除后重投 / worker 半途崩溃后重试」；必须叠加状态级检查。
