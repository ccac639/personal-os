# ADR-0004: 接入硅基流动（SiliconFlow）四类 AI 能力

- 状态：Accepted
- 日期：2026-08-13
- 决策人：Architect（经用户确认方案 A）

## 背景

用户要求为 Personal OS 接入硅基流动（SiliconFlow）平台，覆盖四类能力：
对话 / 生图 / 视频 / 语音（TTS）。关键约束：**API Key 必须在 Web 界面由用户
输入后才能使用 AI**（不预置 .env、不落库明文）。

官方 API（docs.siliconflow.cn 已核实，Base `https://api.siliconflow.cn/v1`，
Bearer 认证）：

| 能力 | 端点                                        | 特性                           |
| ---- | ------------------------------------------- | ------------------------------ |
| 对话 | `POST /chat/completions`                    | OpenAI 兼容，支持流式          |
| 生图 | `POST /images/generations`                  | 同步返回，图片 URL 1 小时有效  |
| 视频 | `POST /video/submit` + `POST /video/status` | 异步轮询，视频 URL 10 分钟有效 |
| TTS  | `POST /audio/speech`                        | 返回音频二进制                 |

## 决策

1. **API Key 由 Web 输入、存 Redis**：设置页输入 → `PUT /api/ai/settings`
   存入 Redis `siliconflow:api_key`（TTL 30 天，可续）。前端只存
   「已配置」布尔，不回显 key；不写 .env、不入 MongoDB 明文。
2. **对话走现有 Chat 队列链路**：新增 worker 侧
   `SiliconFlowCompletionAdapter`（实现既有 `AICompletionAdapter` 契约），
   `resolveAdapter` 支持 `CHAT_ADAPTER=siliconflow`（改为默认值）；api 侧
   `BullChatJobQueue.enqueue` 在 provider=siliconflow 时先校验 key 已配置。
   队列 Job 数据仍不携带密钥（遵守既有契约），worker 从 Redis 读 key。
3. **生图 / 视频 / TTS 在 api 进程内直接调用**（fetch），暂不经过
   worker/BullMQ（媒体任务队列属后续阶段，见 BACKLOG）。视频为
   submit → 前端轮询 `GET /api/ai/videos/:requestId`（每次实时查官方 status）。
4. **默认对话模型切换**：`AGENT_PROVIDERS` 增加 `siliconflow`；
   `DEFAULT_MODEL` 与 conversation 默认 modelSettings 改为
   `Qwen/Qwen2.5-72B-Instruct`。生图默认 `Kwai-Kolors/Kolors`、
   视频默认 `Wan-AI/Wan2.2-T2V-A14B`、TTS 默认 `fnlp/MOSS-TTSD-v0.5`。
5. **生成物 URL 会过期**（图 1h / 视频 10min）：本次直接透传 URL 并在
   Web 提示尽快下载；MinIO 归档列入 BACKLOG 下一阶段。
6. **安全边界**：auth 模块未上线，AI 端点沿用全局 ApiKeyGuard 策略
   （未配置 `PERSONAL_OS_API_KEY` 时放行，个人本机使用）。

## 后果

- 正向：key 不落盘明文，符合「web 输入后可用」；对话复用既有队列架构；
  四类能力全部打通，后续可平滑迁移媒体任务到 worker。
- 负向：Redis 不可用时 AI 端点不可用（与队列同理）；worker 取 key 依赖
  Redis；测试需注入 fake key provider / fake fetch。
- 迁移路径：媒体任务接入 worker 时，仅需将 `AiService` 的调用改为入队，
  客户端逻辑（`siliconflow.client.ts`）保持不变。

## 替代方案（已评估）

- **key 存浏览器 localStorage**：实现最简，但 XSS 可窃取、刷新/换机丢失。
  弃（个人项目也要防脚本注入）。
- **key 写 .env**：不符合用户「web 输入后可用」的要求。弃。
- **生图/视频/TTS 也走 BullMQ**：范围过大（需先打通媒体任务队列基建），
  且同步生图/TTS 无排队必要。延迟到下一阶段。
