# Personal OS Worker 异步任务分线 — 交付报告

- 日期：2026-08-15
- 范围：`apps/worker/**`、`apps/api/src/modules/workflows/**`、
  `apps/api/src/modules/chat/chat-job-queue.ts`、`generation.service.ts`、
  队列契约相关测试
- 相关 ADR：ADR-0004（SiliconFlow 接入）、ADR-0005（Worker 异步任务分线）

---

## 1. 队列契约（单一事实来源）

`apps/worker/src/queues/contract.ts`（`QUEUE_CONTRACT`）统一定义两条队列；
api 侧镜像常量（`chat-job-queue.ts` / `workflow.queue.ts`）由
`apps/api/test/queue-contract.spec.ts` 运行时断言一致。

| 契约项                     | workflow-runs        | chat-generation      |
| -------------------------- | -------------------- | -------------------- |
| queue                      | `workflow-runs`      | `chat-generation`    |
| job                        | `workflow-run`       | `chat-generate`      |
| attempts                   | 3                    | 3                    |
| backoff                    | exponential, 1_000ms | exponential, 1_000ms |
| timeoutMs（worker 侧强制） | 120_000              | 120_000              |
| removeOnComplete           | 200                  | 200                  |
| removeOnFail               | 1_000                | 1_000                |
| concurrency                | 4                    | 2                    |
| lockDurationMs             | 300_000              | 300_000              |
| stalledIntervalMs          | 60_000               | 60_000               |

Job DTO：

- workflow：`{ runId }`（仅此一项；工作流快照/输入不随队列传输，worker 按
  runId 从 Mongo 加载）
- chat：`ChatGenerateJobData`（runId / conversationId / messageId / ownerId /
  provider / model / maxTokens / temperature / systemPrompt / history 文本快照；
  **无任何密钥字段**，`validateJobData` 在消费侧校验必填与上限）

> 注：BullMQ 6 已移除入队侧 `timeout` 选项，超时统一由 worker 侧处理器
> 按契约 `timeoutMs` 强制（`workers/registration.ts` 的 `withJobTimeout`），
> adapter 层另有 60s 请求超时双保险。

## 2. 重试策略

`errors/worker-errors.ts`（`WorkerError`）+ `providers/errors.ts`
（`classifyProviderError`）五分类：

| 类别                   | 判定                                                                                        | 是否重试 | 处理                                          |
| ---------------------- | ------------------------------------------------------------------------------------------- | -------- | --------------------------------------------- |
| rate-limit             | HTTP 429（携带 retry-after）                                                                | ✅       | BullMQ 指数退避；适配器可读 `retryAfterMs`    |
| retryable（瞬时/上游） | 5xx、网络/连接/超时（APIConnectionError/APITimeoutError/AbortError/TimeoutError）、未知错误 | ✅       | BullMQ 指数退避，attempts=3 兜底              |
| config（配置错误）     | 4xx（401/403/404/422）、缺 API Key、模型/请求非法                                           | ❌       | 落库 failed（脱敏）后正常完成，等用户修复配置 |
| non-retryable（业务）  | 负载缺字段、history 非法、maxTokens 非法、目标状态终态                                      | ❌       | 落库 failed 后正常完成                        |
| 未知                   | 非 WorkerError                                                                              | ✅ 默认  | attempts 上限兜底，避免静默丢失               |

chat 处理器（`chat.worker.ts`）：可重试错误上抛触发 BullMQ 重试；不可重试
错误落库后正常完成（不污染 failed 集合）。
workflow 处理器（`processor.ts`）：非法负载（缺 runId）→ non-retryable 留在
failed 集合可见；业务失败（工作流不存在）→ 落库 failed 不重试；基础设施
错误 → 落库 failed + 上抛重试。

## 3. 幂等方案

两层防重，防止重复执行：

1. **入队侧 jobId 幂等**：api 入队一律 `jobId: runId`（BullMQ 对同 jobId
   去重，重复投递不产生重复任务）。`queue-contract.spec.ts` 用源码断言
   强制该约定。
2. **消费侧状态级重复消费保护**：
   - chat（`chat-completion.service.ts`）：run 已 `completed/cancelled` →
     直接返回；`cancelling` → 落 cancelled 终态；`failed`（上次尝试失败）→
     先 `resetMessageContent` 清空已写内容再重跑，防止重试重复追加。
   - workflow（`processor.ts`）：run 已 `cancelled/success` → skipped。

## 4. 环境变量（新增，见 .env.example）

| 变量                              | 默认          | 说明                                                              |
| --------------------------------- | ------------- | ----------------------------------------------------------------- |
| `CHAT_ADAPTER`                    | `siliconflow` | `siliconflow`/`sf`                                                | `deterministic-mock`/`mock`（离线/测试） |
| `WORKER_FAILURE_POLICY`           | `all`         | `all`：任一 worker 初始化失败整体退出；`partial`：继续健康 worker |
| `WORKER_CONCURRENCY`              | `4`           | workflow-runs worker 并发                                         |
| `CHAT_CONCURRENCY`                | `2`           | chat-generation worker 并发                                       |
| `WORKER_SHUTDOWN_GRACE_MS`        | `30000`       | 优雅关闭等待在途任务上限，超时强制关闭                            |
| `WORKER_INIT_TIMEOUT_MS`          | `20000`       | worker 就绪等待上限                                               |
| `WORKER_REDIS_CONNECT_TIMEOUT_MS` | `10000`       | Redis 连接超时                                                    |
| `WORKER_MONGO_CONNECT_TIMEOUT_MS` | `5000`        | Mongo serverSelection 超时                                        |

复用 api 侧变量：`MONGODB_URI` / `REDIS_URL` / `LOG_LEVEL`（缺失或非法值
fail-fast，`WorkerConfigError` 列出全部问题后 exit(1)）。

密钥不落环境变量（SiliconFlow key 由 Web 设置页写入 Redis，worker 从
Redis 读取，见 ADR-0004）。

## 5. 测试结果

### apps/worker（typecheck + 全部测试）

```
$ pnpm typecheck        # tsc -p tsconfig.json --noEmit → 通过（exit 0）
$ pnpm test             # vitest run → 9 files / 84 tests 全部通过
```

| 测试文件                    | 覆盖                                                          |
| --------------------------- | ------------------------------------------------------------- |
| worker-config.spec.ts       | 配置校验 / 默认值 / 非法值 fail-fast                          |
| worker-errors.spec.ts       | WorkerError 五分类 / retryable 判定 / 消息提取                |
| worker-lifecycle.spec.ts    | 双 worker 注册、all/partial 失败策略、shutdown 顺序与超时强关 |
| chat-idempotency.spec.ts    | jobId 幂等 + 状态级重复消费保护                               |
| chat-generation.spec.ts     | 处理器校验 / 分段写回 / 取消 / 失败恢复                       |
| siliconflow.adapter.spec.ts | OpenAI 兼容协议、切段、错误分类（不触真实网络）               |
| workflow-engine.spec.ts     | 引擎执行 / 拓扑 / 限制                                        |
| workflow-processor.spec.ts  | workflow-run 处理器状态机与错误语义                           |
| smoke.spec.ts               | 启动装配冒烟                                                  |

### apps/api（受影响的 workflow/chat/队列契约测试）

```
$ pnpm vitest run test/queue-contract.spec.ts test/chat-generation.spec.ts \
  test/chat-conversations.spec.ts test/workflows-run.spec.ts \
  test/workflows-service.spec.ts test/workflows-validation.spec.ts \
  test/agents-chat.spec.ts test/ai-module.spec.ts \
  test/inspiration-chat.spec.ts test/three-d-chat.spec.ts test/platform-redact.spec.ts
```

| 测试文件                           | 结果                                               |
| ---------------------------------- | -------------------------------------------------- |
| queue-contract.spec.ts（9）        | ✅ 通过（队列名/job/入队选项/幂等约定/负载无密钥） |
| chat-generation.spec.ts（8）       | ✅ 通过（投递前置校验 / 入队 / 取消）              |
| workflows-run.spec.ts（11）        | ✅ 通过（运行创建 / 取消 / 入队）                  |
| workflows-service.spec.ts（16）    | ✅ 通过                                            |
| workflows-validation.spec.ts（13） | ✅ 通过                                            |
| platform-redact.spec.ts（7）       | ✅ 通过（脱敏策略）                                |
| three-d-chat.spec.ts（10）         | ✅ 通过                                            |
| chat-conversations.spec.ts（12）   | ⚠️ 2 失败（见下）                                  |
| agents-chat.spec.ts（7）           | ⚠️ 3 失败（范围外）                                |
| inspiration-chat.spec.ts（10）     | ⚠️ 3 失败（范围外）                                |
| ai-module.spec.ts（13）            | ⚠️ 13 失败（范围外）                               |

**失败归因（均不在本次负责范围）**：

- `chat-conversations.spec.ts`：2 个失败位于 `conversations.service.ts`
  （删除级联清消息）与 `messages.service.ts`（append 角色校验）——chat
  模块其他在途文件，非 `chat-job-queue.ts` / `generation.service.ts`。
- `agents-chat` / `inspiration-chat` / `ai-module`：均为仓库中未跟踪的
  在途新模块（agents / inspiration / ai），与队列契约无关；api 全量
  typecheck 报错也集中在这批模块（DTO 装饰器 import type、createdAt 类型等）
  与平台基座在途改动（`main.ts` 尚传 `cors.origin` 字符串，cors.ts 已改数组），
  不在本任务范围，未触碰（协作限制：不改无关共享文件/平台基座）。

### 验证结论

本次负责范围内 typecheck + 全部 Worker 测试 + 受影响的 API workflow/chat
测试均通过；未调用任何真实 AI 服务（测试全程使用 `DeterministicMockAdapter`
/ `MemoryChatStore` / fake queue，siliconflow 用例注入 fake OpenAI client）。

## 6. 部署注意事项

1. **进程管理器**：worker 以 `node dist/main.js`（或 `pnpm --filter
@personal-os/worker start`）独立运行；配置非法、启动失败、崩溃（含
   uncaughtException / unhandledRejection 触发的有序退出）均以非零码退出，
   由进程管理器（pm2/systemd 等）自动重启。
2. **Redis 依赖**：BullMQ 连接需 `maxRetriesPerRequest: null`（已在
   main.ts 设置）；Redis 不可用时 worker 无法消费，chat SiliconFlow key
   也依赖 Redis 读取。
3. **Mongo 依赖**：worker 启动即连接 Mongo（短 serverSelectionTimeout），
   失败快速退出交给进程管理器重试；运行/工作流数据都在 Mongo。
4. **优雅关闭窗口**：`WORKER_SHUTDOWN_GRACE_MS`（默认 30s）应大于最长
   单任务耗时预期；超时后会强制关闭 worker（在途任务可能中断，交由
   BullMQ 重试语义恢复——chat 重试会先清空已写内容，workflow 重试会重新
   执行）。
5. **清理策略**：completed 保留 200 条 / failed 保留 1000 条（按队列），
   长期运行注意监控 Redis 内存。
6. **日志脱敏**：worker 日志只含 queue / jobId / runId / attempt 与脱敏后
   错误信息；不要在生产日志中打印 Job 原始 data。
7. **契约变更流程**：改队列名 / attempts / backoff / 清理策略时，先改
   `queues/contract.ts`（单一事实来源），再同步 api 镜像常量，跑
   `queue-contract.spec.ts` 拦截不一致；队列名变更属破坏性操作，需停机
   迁移存量任务。
8. **新增任务线**：按 `QUEUE_CONTRACT` 增条目 + `registration.ts` 注册 +
   `main.ts` 装配，生命周期/错误分类/幂等约定自动复用。

## 7. 交付物清单（本分线新增/重构源码）

- `apps/worker/src/main.ts`（双 worker 启动装配 + 信号/兜底退出）
- `apps/worker/src/config.ts`（配置校验，fail-fast）
- `apps/worker/src/errors/worker-errors.ts`（统一错误分类）
- `apps/worker/src/queues/contract.ts`（队列契约单一事实来源）
- `apps/worker/src/workers/registration.ts` / `manager.ts`（注册与生命周期）
- `apps/worker/src/jobs/chat/**`（chat 消费线：processor / completion
  service / store / security）
- `apps/worker/src/jobs/workflows/**`（workflow 消费线：processor / engine /
  adapter / run-store / redact / limits）
- `apps/worker/src/providers/**`（AICompletionAdapter 契约 + siliconflow /
  deterministic-mock 实现 + 错误分类）
- `apps/api/src/modules/chat/chat-job-queue.ts`（BullMQ 入队，jobId=runId）
- `apps/api/src/modules/workflows/workflow.queue.ts`（BullMQ 入队，jobId=runId）
- `apps/api/test/queue-contract.spec.ts`（两端契约一致性测试）
- `.opensquilla/decisions/ADR-0005-worker-async-lines.md`（决策记录）
