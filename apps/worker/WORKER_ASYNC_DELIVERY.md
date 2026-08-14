# Personal OS Worker 异步任务分线 — 第二轮 P0 优化交付报告

- 日期：2026-08-15（第二轮 P0）
- 范围：`apps/worker/**`、`apps/api/src/modules/chat/chat-job-queue.ts`、
  `apps/api/src/modules/chat/generation.service.ts`、
  `apps/api/src/modules/workflows/workflow.queue.ts`、
  `apps/api/test/queue-contract.spec.ts`、`packages/queue-contract/**`
- 相关 ADR：ADR-0004（SiliconFlow 接入）、ADR-0005（Worker 双线装配与统一
  队列契约，含 P0 优化）、ADR-0010（第一轮基线，被 ADR-0005 取代）
- 基线提交：`c3e1946 feat(worker): 统一异步任务装配与队列契约`（并行 agent
  提交）；本分线补充 `refactor(worker): workflow processor 直接消费共享队列契约`

---

## 1. 契约位置（任务 1：真正的单一事实来源）

**共享包 `packages/queue-contract`（`@personal-os/queue-contract`）**，纯数据
契约，**不依赖 BullMQ**：

- `QUEUE_CONTRACT`：queue / job 名、attempts、backoffMs、timeoutMs、
  removeOnComplete / removeOnFail、concurrency、lockDurationMs、stalledIntervalMs
- 别名常量：`WORKFLOW_RUN_QUEUE` / `WORKFLOW_RUN_JOB` / `CHAT_QUEUE_NAME` /
  `CHAT_JOB_NAME`
- Redis Key：`SILICONFLOW_API_KEY_REDIS_KEY`（api 写入 ↔ worker 读取同一键）
- retry-after 上下限：`RETRY_AFTER_MIN_MS`（1s）/ `RETRY_AFTER_MAX_MS`（60s）
- Job Payload 类型：`ChatGenerateJobData`（runId / conversationId / messageId /
  provider / model / maxTokens / temperature / systemPrompt / history 文本快照；
  **无 ownerId / userId / 密钥字段**）、`WorkflowRunJobData`（仅 runId）

消费方（全部直接 `import`，无镜像常量、无跨应用相对路径、无
readFileSync+正则源码断言）：

| 消费方 | 文件                                                                                                                                                                       |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| worker | `main.ts` / `workers/registration.ts` / `jobs/workflows/processor.ts` / `jobs/chat/chat.worker.ts` / `jobs/chat/chat-completion.service.ts` / `providers/ai-completion.ts` |
| api    | `modules/chat/chat-job-queue.ts` / `modules/workflows/workflow.queue.ts`                                                                                                   |
| 测试   | `apps/api/test/queue-contract.spec.ts`（运行时断言两端消费一致）                                                                                                           |

BullMQ `JobsOptions` 在适配边界生成：worker 侧 `registration.ts`（Worker
选项 + backoffStrategy）、api 侧 `chat-job-queue.ts` / `workflow.queue.ts`
（入队选项）。worker 侧 `src/queues/contract.ts` 仅为转发层（无源码引用，
保留兼容，不构成双份定义）。

契约值：attempts=3、backoff=1s 指数、timeoutMs=120s（worker 侧强制）、
removeOnComplete=200、removeOnFail=1_000、concurrency 4/2、
lockDuration=300s、stalledInterval=60s。

## 2. 取消时序（任务 2/7：超时与取消）

```
BullMQ 超时（timeoutMs=120s）
   │
   ├─ withJobTimeout（registration.ts）
   │    1. 超时 → controller.abort()（透传 AbortSignal 到处理器）
   │    2. 处理器/适配器/引擎协作式中止：
   │       · chat：ChatCompletionService 每段写回前检查 signal.aborted；
   │              已写段保留、未写段不追加；run 落 failed 终态
   │       · siliconflow adapter：mergeSignals(外部 signal, 60s 超时) →
   │              传入 OpenAI SDK；raceAbort 竞速兜底（AbortError）
   │       · workflow engine：每节点前 isAborted 检查 → 立即停止，
   │              不执行后续节点、不产生节点结果
   │    3. 等底层任务 settle 后才抛可重试错误（不竞速丢弃）
   │
   ├─ 用户取消（API 侧）
   │     · chat：cancel → run 置 cancelling + queue.remove(jobId)
   │     · workflow：cancelRun → 置 cancelled + queue.remove(runId)
   │     · worker 消费侧：chat 检查 run.state === cancelling → 落 cancelled
   │       终态；workflow 每节点 isRunCancelled → 立即中止
   │
   └─ attempt 不重叠保证
         BullMQ 对同一 job 串行处理；withJobTimeout 先 abort 后等待 settle，
         不存在「第一次执行仍在跑、第二次已开始」的窗口
```

## 3. 错误到 BullMQ 状态的映射（任务 3/6）

统一映射 `toBullMqError`（`errors/worker-errors.ts`）：

| WorkerError.kind | 判定                                                  | BullMQ 抛出          | Job 终态             | attemptsMade       |
| ---------------- | ----------------------------------------------------- | -------------------- | -------------------- | ------------------ |
| non-retryable    | 非法 payload / 缺字段 / 非法 history / maxTokens 非法 | `UnrecoverableError` | failed（可观察）     | 不增长，只执行一次 |
| config           | 缺 API Key / 4xx（401/403/404/422）/ 模型错误         | `UnrecoverableError` | failed（可观察）     | 不增长，只执行一次 |
| rate-limit       | HTTP 429（携带 retry-after）                          | 原样上抛             | 重试中 → 最终 failed | 增长               |
| retryable        | 5xx / 网络 / 连接 / 超时 / AbortError / 未知错误      | 原样上抛             | 重试中 → 最终 failed | 增长               |
| 业务终态         | 生成完成 / 取消 / 工作流不存在（业务失败）            | 正常返回             | completed            | —                  |

- 非法/配置损坏的 Job **绝不记为 completed**（保留 failed 集合可观察）；
  正常业务终态可完成，与「输入/配置损坏」明确区分。
- workflow 与 chat 使用同一套 `toBullMqError` / `isRetryableError` 规则。
- 未知错误默认按 retryable（attempts=3 兜底，避免静默丢失）。

## 4. 重试延迟规则（任务 4：retry-after 真实生效）

`makeBackoffStrategy`（`registration.ts`）→ `retryDelayMs`（`worker-errors.ts`）：

```
delay(attemptsMade, err) =
  err 携带 retryAfterMs（429 头） → clamp(retry-after, 1s .. 60s)
  无 retry-after                  → clamp(backoffMs × 2^(attemptsMade-1), 1s .. 60s)
```

- 通过 `settings.backoffStrategy` 接入 BullMQ 6（签名
  `(attemptsMade, type, err, job)`，err 即处理器抛出的错误）。
- 已删除「解析但未消费」的无效字段——`retryAfterMs` 被 backoffStrategy 真实消费。
- 测试：`worker-lifecycle.spec.ts`（makeBackoffStrategy clamp/指数/封顶）、
  `timeout-abort.spec.ts`（retryDelayMs 规则）。

## 5. 资源所有权（任务 5/6：生命周期与连接）

| 资源                                             | 创建者                        | 关闭者                         | 顺序                           |
| ------------------------------------------------ | ----------------------------- | ------------------------------ | ------------------------------ |
| BullMQ Worker（workflow-runs / chat-generation） | `startWorkers`（factories）   | `shutdown`                     | 1（并行，共享全局 grace 预算） |
| Queue（api 侧 BullMqRunQueue.close）             | api 模块                      | `shutdown.closables`           | 2                              |
| SecretReader（RedisSecretReader）                | `main.ts`（复用共享 Redis）   | `shutdown.closables`           | 2                              |
| Redis                                            | `main.ts`                     | `shutdown`（redis.quit）       | 3                              |
| MongoDB                                          | `main.ts`（mongoose.connect） | `shutdown`（mongo.disconnect） | 4                              |

- `failurePolicy=all`：关闭**全部**已创建 handle（含初始化失败 / 超时的
  半初始化 handle）后抛 `WorkerStartupError`；`partial`：关闭失败 worker，
  健康 worker 继续（覆盖 factory 创建失败与 waitUntilReady 失败）。
- `shutdownGraceMs` 为**全局预算**：多 worker 并行关闭共享同一预算，超过后
  统一 force close（测试断言总时长 ≈ graceMs，而非 N×graceMs）。
- **隐藏 Redis 连接已删除**：`resolveAdapter` 不再创建模块级 redisReader
  单例；API Key 由 `main.ts` 注入的 `RedisSecretReader`（复用共享 Redis，
  close 幂等、get 在关闭后拒绝）读取，纳入 shutdown 所有权。
- `uncaughtException` / `unhandledRejection` → 记录 fatal 后走同一有序退出
  （exit 非零，由进程管理器重启）。

## 6. 单用户队列契约（任务 7）

- `ChatGenerateJobData` / `WorkflowRunJobData` **不含 ownerId / userId**；
  `validateJobData` 必填字段（runId/conversationId/messageId/provider/model）
  无 ownerId；`queue-contract.spec.ts` 断言负载无 ownerId/apiKey/token/secret。
- API 业务层（generation.service / conversations.service 等）的 ownerId 仍
  作为单用户默认值保留（Schema 层历史字段），**不在本轮队列链路迁移范围**；
  后续独立迁移任务清理 Chat 数据库 Schema 的 ownerId。

## 7. 环境变量

| 变量                                                                  | 默认          | 说明                                                              |
| --------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| `MONGODB_URI` / `REDIS_URL` / `LOG_LEVEL`                             | 同 api        | 缺失或非法 fail-fast（`WorkerConfigError` 列全部问题后 exit(1)）  |
| `CHAT_ADAPTER`                                                        | `siliconflow` | `siliconflow`/`sf` \| `deterministic-mock`/`mock`（离线/测试）    |
| `WORKER_FAILURE_POLICY`                                               | `all`         | `all`：任一 worker 初始化失败整体退出；`partial`：继续健康 worker |
| `WORKER_CONCURRENCY` / `CHAT_CONCURRENCY`                             | 4 / 2         | 队列并发                                                          |
| `WORKER_SHUTDOWN_GRACE_MS`                                            | 30000         | 全局优雅关闭预算，超时强制关闭                                    |
| `WORKER_INIT_TIMEOUT_MS`                                              | 20000         | worker 创建+就绪等待上限                                          |
| `WORKER_REDIS_CONNECT_TIMEOUT_MS` / `WORKER_MONGO_CONNECT_TIMEOUT_MS` | 10000 / 5000  | 连接超时                                                          |

API Key **不落环境变量 / 队列 / Mongo / 日志**（Web 设置页写入 Redis，
worker 经 SecretReader 读取）。

## 8. 测试结果

### apps/worker（typecheck + 全部测试）

```
$ pnpm typecheck   → 0 错误
$ pnpm test        → 10 files / 103 tests 全部通过
```

| 测试文件                    | 覆盖                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| worker-config.spec.ts       | 配置校验 / 默认值 / 非法值 fail-fast                                                                                                                          |
| worker-errors.spec.ts       | WorkerError 分类 / toBullMqError / retryDelayMs / 消息提取                                                                                                    |
| worker-lifecycle.spec.ts    | 双 worker 注册、backoffStrategy（retry-after）、all/partial（含 factory 创建失败）、shutdown 全局 grace / 超时强关 / 顺序                                     |
| timeout-abort.spec.ts       | 超时后无后台写入（chat 消费前/写回中、engine 节点停止）、attempt 不重叠、UnrecoverableError 只执行一次、retry-after、隐藏 Redis 删除、SecretReader close 幂等 |
| chat-idempotency.spec.ts    | jobId 幂等 + 状态级重复消费保护                                                                                                                               |
| chat-generation.spec.ts     | 处理器校验 / 分段写回 / 取消 / 失败恢复                                                                                                                       |
| siliconflow.adapter.spec.ts | OpenAI 兼容协议、切段、错误分类（fake client，不触真实网络）                                                                                                  |
| workflow-engine.spec.ts     | 引擎执行 / 拓扑 / 限制 / abort                                                                                                                                |
| workflow-processor.spec.ts  | workflow-run 处理器状态机与错误语义                                                                                                                           |
| smoke.spec.ts               | 启动装配冒烟                                                                                                                                                  |

### apps/api（队列相关测试）

```
$ pnpm vitest run test/queue-contract.spec.ts test/chat-generation.spec.ts \
  test/workflows-run.spec.ts test/workflows-service.spec.ts test/workflows-validation.spec.ts
  → 5 files / 57 tests 全部通过
```

| 测试文件                           | 结果                                                                         |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| queue-contract.spec.ts（9）        | ✅ 共享包为唯一事实来源 / 负载无 ownerId·密钥 / jobId=runId / Redis Key 一致 |
| chat-generation.spec.ts（8）       | ✅ 投递前置校验 / 入队 / 取消                                                |
| workflows-run.spec.ts（11）        | ✅ 运行创建 / 取消 / 入队                                                    |
| workflows-service.spec.ts（16）    | ✅                                                                           |
| workflows-validation.spec.ts（13） | ✅                                                                           |

> 说明：agents / inspiration / three-d / ai-module / chat-conversations 等
> 测试失败与队列分线无关（其他并行分线在途模块，见第一轮报告归因），本轮
> 未触碰。

## 9. 协作与并发说明（重要）

- 工作区存在多个并行分线 agent；worker 分线实现曾被并行 agent 整体删除并
  回退为骨架，随后由并行 agent 恢复并提交 `c3e1946`（含全部实现与测试）。
  本分线在提交后补充：processor 直接消费共享契约（`51b2052`）。
- ADR 编号冲突：原两个 `ADR-0005`（worker-async-lines / worker-queue-contract）
  与 backend-projects 分线编号重复。已按 backend-projects 报告建议处理：
  queue-contract 保留 **ADR-0005**（内容更全，含 P0 决策），async-lines
  重排为 **ADR-0010**（状态 Superseded，标注被 ADR-0005 取代）。
- 测试目录中的调试残留（debug-abort.spec.ts 等）已清理。

## 10. 部署注意事项

1. **进程管理器**：worker 以 `node dist/main.js` 独立运行；配置非法、启动
   失败、崩溃（含 uncaughtException / unhandledRejection 触发的有序退出）
   均非零退出，由 pm2/systemd 自动重启。
2. **Redis 依赖**：BullMQ 连接需 `maxRetriesPerRequest: null`；Redis 不可用
   时 worker 无法消费，SiliconFlow key 也依赖 Redis 读取。
3. **优雅关闭窗口**：`WORKER_SHUTDOWN_GRACE_MS`（默认 30s）应大于最长单任务
   预期；超时后强制关闭，在途任务由 BullMQ 重试语义恢复（chat 重试先清空
   已写内容，workflow 重试重新执行）。
4. **超时语义**：BullMQ 6 无入队侧 timeout，由 worker 侧 `withJobTimeout`
   按契约 timeoutMs 强制（先 abort 后等 settle）；新 worker 必须套用。
5. **清理策略**：completed 保留 200 / failed 保留 1_000（按队列），长期运行
   注意 Redis 内存。
6. **日志红线**：worker 日志只含 queue / jobId / runId / attempt 与脱敏后
   错误；不打印 Job 原始 data、不记录提示词全文与密钥。
7. **契约变更流程**：改 `packages/queue-contract/src/index.ts`（单一事实
   来源）→ 两端自动生效 → 跑 queue-contract.spec.ts 拦截不一致；队列名变更
   属破坏性操作，需停机迁移存量任务。
8. **新增任务线**：契约包增条目 + `registration.ts` 注册 + `main.ts` 装配，
   生命周期 / 错误映射 / retry-after / abort 自动复用。

## 11. 未解决风险

1. **backoffStrategy 依赖 err 透传**：BullMQ 6 的 backoffStrategy 签名
   `(attemptsMade, type, err, job)` 当前会将处理器抛出的 WorkerError 传入；
   若未来 BullMQ 主版本变更该签名（err 不再透传），retry-after 将退化为
   指数退避，需重新验证（`timeout-abort.spec.ts` / `worker-lifecycle.spec.ts`
   已有断言可捕获）。
2. **无法可靠中止的执行器**：若未来 adapter 不响应 AbortSignal（不监听
   abort、请求无法取消），`withJobTimeout` 会等待其自然 settle（不产生
   重叠执行），但超时判定会延迟；极端情况由 BullMQ stalled 检测兜底。
   当前 SiliconFlow adapter（SDK 响应 signal）+ deterministic-mock + engine
   均可中止。
3. **ownerId 迁移范围**：队列链路已清除 ownerId；Chat 数据库 Schema /
   API 业务层 ownerId 字段需独立迁移任务清理（单用户系统下为历史冗余）。
4. **queue-contract 包构建**：`exports` 直接指向 `src/index.ts`（tsx/vitest
   可消费）；若生产以纯 JS 运行（node dist）需先 `pnpm --filter
@personal-os/queue-contract build`，否则依赖解析到 src 需要 tsx。
