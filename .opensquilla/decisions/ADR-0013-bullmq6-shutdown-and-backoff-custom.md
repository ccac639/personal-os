# ADR-0013：BullMQ 6 关闭幂等性与 backoff custom（B2 分线收口）

- 状态：Accepted
- 日期：2026-08-15
- 相关：ADR-0005（worker-queue-contract）、ADR-0008（业务模块装配）

## 背景

B2 分线（Worker 异步引擎可靠性与生命周期治理）收口一组在途未提交的可靠性
重构时，发现两个 BullMQ 6 语义陷阱，若不纠正会导致「看似优雅退出、实际
强关失效」与「429 retry-after 解析但不生效」两类线上隐患：

1. **`Worker.close` 幂等语义**：BullMQ 6 的 `close()` 是幂等的——第二次调用
   返回第一次调用的 promise，**`force` 参数只在首次调用时生效**。因此
   「先 `close(false)` 等一会，再 `close(true)` 强关」的旧写法是无效的：
   第二次 `close(true)` 不会真正强关（force 被忽略），在途任务可能永不退出。
2. **`settings.backoffStrategy` 触发前提**：BullMQ 6 的
   `Backoffs.lookupStrategy` 对内置类型（`exponential` / `fixed`）优先使用
   内置策略，**只有 `type: 'custom'` 才会调用 worker 侧
   `settings.backoffStrategy`**。此前入队选项用 `type: 'exponential'`，
   自定义策略（消费 `WorkerError.retryAfterMs` 的 429 retry-after）被跳过，
   限流退避退化为固定延迟。

## 决策

### 1. shutdown 顺序固定为 `pause → cancelActive → close(true)`

- `shutdown()` 对每个 worker 依次：
  1. `pause()`：停止接单并等待在途任务自然结束（BullMQ 6 `pause(false)`
     公开语义），**所有 worker 并行共享同一全局 deadline**
     （`shutdownGraceMs`，默认 30s，不是每 worker 各耗一整轮 grace）；
  2. 超预算：对仍未排空的 worker `cancelActive(reason)` —— 向处理器发
     `AbortSignal`（协作式停止，见 ADR-0005 withJobTimeout 超时路径）；
  3. `close(true)`：作为**首次**调用，`force` 真正生效，强关残留。
- 关键不变量：**`close(true)` 必须是该 worker 的首次 close 调用**，否则
  force 被 BullMQ 幂等语义吞掉。已在 `worker-lifecycle.spec.ts` 断言
  （force close 仅对超预算 worker 触发、顺序为 pause→cancelActive→close、
  全局耗时 ≈ graceMs 而非 N×graceMs）。

### 2. 入队 backoff.type 固定 `'custom'`

- `apps/api` 两端入队（chat-job-queue.ts / workflow.queue.ts）的
  `backoff` 从 `{ type: 'exponential', delay }` 改为
  `{ type: 'custom', delay }`，配合 worker 侧 `settings.backoffStrategy`：
  - `custom` → 每次重试都走自定义策略，`WorkerError.retryAfterMs`
    （429 retry-after，clamp [1s, 60s]）真实生效；
  - 无 retry-after 时回退指数退避（策略内部实现）。
- 契约 `QUEUE_CONTRACT` 的 `attempts/backoffMs/removeOnComplete/removeOnFail`
  语义不变（ADR-0005），仅修正 type 值。
- 队列名常量上提 `packages/queue-contract`（`WORKFLOW_RUN_QUEUE` /
  `CHAT_QUEUE_NAME`），api / worker 两端 import 同一契约源；
  `apps/worker/src/queues/contract.ts` 移除 `toEnqueueOptions`
  （BullMQ v5+ 无 job 级 timeout，超时统一由 worker 侧 `withJobTimeout`
  强制，见 ADR-0005 决策 4）。

## 后果

- 正向：优雅退出在超预算时**真正强关**（force 首次生效）；429 限流退避
  按 retry-after 精确退避，上游限流窗口内不再盲等固定延迟；两端队列名
  不再可能漂移（共享契约包 + worker 侧禁止硬编码测试）。
- 负向：`close(true)` 的首次调用约束是隐式契约——未来若在 pause 前
  误调 `close(false)`，强关会静默失效；已通过 lifecycle 测试与注释
  双重防护。`custom` 依赖 BullMQ 6 `lookupStrategy` 行为，若未来版本
  改变需重新验证（ADR-0005 后果已提示同类风险）。
- 迁移路径：新 worker 在 `registration.ts` 注册即自动获得该关闭顺序；
  新任务线入队选项必须以 `custom` 起步（有 queue-contract 测试兜底）。

## 替代方案（已评估）

- **保留 `close(false)` + `close(true)` 两次调用**：BullMQ 6 幂等语义下
  force 失效，弃。
- **每 worker 各耗一整轮 grace 后独立强关**：总停机时间 = N×graceMs，
  与「全局预算」需求冲突，弃（保持 ADR-0005 的全局共享预算语义）。
- **backoff 保持 `exponential` 并在 worker 侧解析 retry-after**：内置策略
  下 `settings.backoffStrategy` 根本不调用，无法实现，弃。
