# ADR-0011: 队列契约第二轮 P0 硬化（超时取消 / retry-after / 生命周期 / 连接所有权）

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Developer（队列契约第二轮 P0，Orchestrator 委派）

## 背景

第一轮已把队列契约收敛到共享包 `@personal-os/queue-contract`（API 与 Worker 共同
消费，测试改为运行时断言），但审查发现五个 P0 缺口：

1. retry-after 只解析不生效：`settings.backoffStrategy` 已装配，但两条队列入队侧
   `backoff.type` 均为内置 `exponential`，BullMQ 6 的 `Backoffs.lookupStrategy`
   对内置类型优先使用内置策略，自定义 backoffStrategy 永远不会被调用。
2. Worker 生命周期 force close 失效：`Worker.close` 幂等（第二次调用返回第一次的
   promise，`force` 只在首次调用生效），旧 shutdown 的「先 close(false) 超时再
   close(true)」无法真正强关。
3. shutdownGraceMs 语义：需明确为全局时间预算（并行共享同一 deadline），并覆盖
   factory 创建失败与初始化超时的 handle。
4. 隐藏 Redis 连接：resolveAdapter 历史版本曾维护模块级 Redis 单例（已在上轮删除，
   本轮复核并固化到测试）。
5. 超时取消：需以 AbortSignal 驱动底层停止（已在第一轮实现，本轮复核并补测试）。

## 决策

### 1. retry-after 生效：入队侧 backoff.type 固定为 'custom'

- 两处 API 入队点（`chat-job-queue.ts` / `workflow.queue.ts`）与 worker 侧
  `queues/contract.ts` 的入队选项统一改为 `backoff: { type: 'custom', delay: backoffMs }`。
- worker 侧 `settings.backoffStrategy`（消费 `WorkerError.retryAfterMs`，无
  retry-after 时回退指数退避）由此真正被 BullMQ 调用。
- 依据：直接阅读 bullmq@6.0.10 `dist/esm/utils/backoffs.js`——
  `lookupStrategy(backoff, customStrategy)` 对 `type in Backoffs.builtinStrategies`
  返回内置实现，只有非内置类型才落到 customStrategy；`job.js` 在可重试失败时调用
  `Backoffs.calculate(opts.backoff, attemptsMade+1, err, job, opts.settings?.backoffStrategy)`。
- 约束：任何人不得把入队侧 backoff 改回内置类型（否则 retry-after 静默失效），
  该限制已写入共享契约注释与注册文件注释。

### 2. shutdown 生命周期（全局 grace + 真 force close）

新时序（`workers/manager.ts`）：

1. 所有 worker 并行 `pause()`（BullMQ 6 公开语义 pause(false) = 停止接单 + 等待
   在途任务结束；内部调用私有 whenCurrentJobsFinished），每个 handle 的等待上限为
   `max(0, deadline - now)`，deadline = 全局 shutdownGraceMs。
2. 超预算（pause 超时）：对该 handle `cancelActive(reason)`（worker.cancelAllJobs，
   向在途处理器发 AbortSignal，协作式停止，见 registration.withJobTimeout），随后
   统一 `close(true)`——由于这是首次 close 调用，force 参数真正生效。
3. closables（SecretReader/Queue）→ Redis → Mongo，异常不阻断后续。

WorkerHandle 增加 `pause()` / `cancelActive(reason)` 原语（close 保留 force 参数），
`whenCurrentJobsFinished` 在 BullMQ 6 中是私有方法，不直接依赖。

### 3. 不可重试错误语义（复核，不修改）

非法 payload / 配置错误 → `WorkerError`(non-retryable/config) →
`toBullMqError` 包装为 `UnrecoverableError` 上抛：BullMQ 6 `job.js` 对
UnrecoverableError 不再重试（attemptsMade 不增长）、job 进入 failed 集合、不记
completed。正常业务终态（completed/cancelled）返回成功，与不可重试错误明确区分。

### 4. 连接所有权（复核，不修改）

main.ts 创建唯一 Redis（BullMQ + SecretReader 共享），`resolveAdapter` 只接收
`getApiKey` 注入点，不创建任何 Redis 连接；shutdown 关闭顺序 worker →
SecretReader（closable，不 quit 共享 Redis）→ Redis.quit → Mongo.disconnect。

### 5. 超时取消（复核，不修改）

`registration.withJobTimeout`：超时先 `AbortSignal.abort` → 等待底层 settle（期间
不再写库）→ 抛可重试错误；ChatCompletionService / workflow engine 每段写回前检查
signal。测试（timeout-abort.spec.ts）证明超时后消息内容不再增长、attempt 不重叠。

## 后果

- 正向：retry-after 真正影响重试延迟；force close 在真实 BullMQ 下生效；全局
  grace 预算严格化；连接所有权单一化；不可重试错误行为与注释一致。
- 负向：入队侧 backoff 类型成为隐性约束（已注释 + ADR 固化）；pause 等待在途的
  时长受全局预算约束，超长任务会被 abort 并重试（进程退出场景由进程管理器重启）。
- 迁移路径：无（队列契约与 worker 内部实现，API 入队选项字段不变，仅 type 值变）。

## 替代方案（已评估）

- **保持内置 exponential，靠 stall/重试兜底 retry-after**：retry-after 语义丢失，
  429 限流重试过快会继续触发限流。弃。
- **shutdown 用 close(false) 竞速 + close(true)**：BullMQ close 幂等使 close(true)
  成为 no-op，无法强关。弃。
- **直接用私有 whenCurrentJobsFinished**：v6 类型声明为 private，升级即破坏。弃，
  改用 pause(false) 公开语义。
