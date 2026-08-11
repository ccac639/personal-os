# apps/worker/src/jobs

BullMQ Job 处理器目录（本阶段为空占位）：

- `ai/` — AI Task（对话 / 生成）
- `workflow/` — Workflow Execution
- `embedding/` — Embedding（MongoDB Vector Search 前置）
- `media/` — Media Processing
- `notification/` — Notification

每个子目录后续包含 `queue.ts`（队列定义）与 `processor.ts`（处理器）。
