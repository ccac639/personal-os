# Chat 生成任务（jobs/chat）

Chat 内容域的任务执行线：消费 API 侧入队的 `chat-generation` 队列，用
deterministic mock 逐段写回 `chat_runs` / `chat_messages`，模拟流式输出。

## 文件职责

| 文件                         | 职责                                                  |
| ---------------------------- | ----------------------------------------------------- |
| `chat-store.ts`              | 数据访问抽象（`ChatStore`）+ 测试用 `MemoryChatStore` |
| `chat-store.mongo.ts`        | MongoDB 实现（与 API 侧同集合、同 id 约定）           |
| `chat-completion.service.ts` | 执行器：分段写回 / 取消检查 / 失败脱敏落库            |
| `chat.worker.ts`             | BullMQ 处理器 + `startChatWorker()` 启动入口          |
| `chat-security.ts`           | 错误信息脱敏（不落密钥类文本）                        |

## 接入方式

`apps/worker/src/main.ts` 后续在骨架模式下直接调用：

```ts
import { startChatWorker } from './jobs/chat/chat.worker.js';

const worker = await startChatWorker(); // 读 MONGODB_URI / REDIS_URL 环境变量
await worker.waitUntilReady();
```

- 默认适配器：`DeterministicMockAdapter`（纯本地计算，无网络）。
- 环境变量 `CHAT_ADAPTER`：仅接受 `deterministic-mock`（或 `mock`）；配置其他值
  会启动失败并提示未实现，绝不静默接真实密钥。
- 取消是协作式的：处理器在每段写回前查询 run 状态，`cancelling`/`cancelled`
  即终止并写终态。
- 失败恢复：adapter 抛错 → run 置 `failed`（错误先脱敏再截断 500 字符）、
  消息置 `failed`；写回过程中途失败同理。

## 未来真实 AI 适配器

在 `providers/ai-completion.ts` 定义同一 `AICompletionAdapter` 接口，新增
`providers/openai.adapter.ts` 等实现，并在 `resolveAdapter()` 中注册选择分支。
处理器与存储层无需改动。
