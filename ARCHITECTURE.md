# Personal OS — 架构总览

> 本文件为架构级说明，随项目演进持续更新（配合 ADR 使用，见 `DECISIONS/README.md`）。

## 系统拓扑

```text
┌────────────┐   ┌────────────┐
│  Web (Vue3)│   │ Blog (Nuxt4)│
│  :5173     │   │ :3001      │
└─────┬──────┘   └─────┬──────┘
      │ REST/WS        │ SSR 直出（不依赖 API 也可发布）
      ▼                ▼
┌─────────────────────────────┐
│      API (NestJS+Fastify)   │  :3000  REST /api + WebSocket + Swagger /api
└──────┬──────────────┬───────┘
       │              │
       ▼              ▼
   MongoDB         Redis ──── BullMQ ──── Worker (独立进程)
   (Mongoose)      (ioredis)  队列        │
                               │         ├─ AI Task / Agent / Workflow
                               │         ├─ Embedding / Document
                               ▼         └─ Media / Notification / Scheduled
                          MinIO (S3 兼容存储)
```

## 分层

- **apps/web** — Vue 3 + Vite 8 工作台 SPA；Pinia 状态、Vue Query 服务端状态、
  ofetch HTTP、reka-ui + Tailwind v4 UI、@vue-flow Workflow 画布、Tiptap 编辑器、
  Monaco 代码编辑器、ECharts 可视化、socket.io-client 实时。
- **apps/blog** — Nuxt 4 SSR 博客；@nuxtjs/seo 提供 SEO/OG/Sitemap/RSS/Schema。
- **apps/api** — NestJS 11 + Fastify；模块化（auth/users/dashboard/projects/tasks/
  chat/agents/workflows/documents/achievements/articles/admin）；Mongoose ODM；
  class-validator DTO；pino 日志。
- **apps/worker** — 独立 Node 进程；BullMQ 消费者；AI Provider 适配层
  （openai/anthropic/google/openrouter 契约已定）。
- **packages** — config（TS/ESLint/Prettier/Tailwind 统一配置）、types（共享
  TypeScript 接口）、utils（date/string/object/validation 工具）、ui（设计系统）。

## 数据流示例（规划）

Chat 消息 → API 写入 MongoDB → 推送 Redis Pub/Sub → Worker 消费 → 调 Provider →
流式回传（socket.io）→ Web 渲染。

## 约束

- 单数据库 MongoDB；Redis 承担 cache/session/ratelimit/pubsub/queue/流状态。
- 文件存储统一 S3 兼容（MinIO），不引入本地磁盘直存。
- 禁止 React / Next.js；Web 固定 Vue 3 + Vite；Blog 固定 Nuxt。
