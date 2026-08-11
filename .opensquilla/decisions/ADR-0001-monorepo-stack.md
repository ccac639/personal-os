# ADR-0001: Monorepo 技术栈与初始化决策

- 状态：已接受（2026-08-12）
- 决策者：个人 AI 软件工程团队（Orchestrator + Developer 角色）

## 背景

初始化 `personal-os` 全栈 Monorepo：个人工作台 + AI Agent + Workflow +
项目管理 + 成果管理 + 博客。本阶段仅搭建框架、安装依赖、建立目录结构，
不实现业务逻辑。

## 决策

### 1. Monorepo 工具链：pnpm + Turborepo

pnpm workspace 管理依赖（磁盘高效、严格 node_modules），Turborepo 编排
build/dev/lint/test/typecheck。`pnpm dev` 并行启动 web/blog/api/worker。

### 2. TypeScript 版本：6.0.3（非 7.0.2）

npm `latest` 已发布 TS 7.0.2（Go 原生重写版），但
`typescript-eslint@8.67` 的 peer 要求 `typescript >=4.8.4 <6.1.0`，
TS 7 会导致 lint 工具链不兼容。锁定 6.0.3（6.x 最新 patch）。

### 3. 前端：Vue 3 + Vite 8 + Tailwind CSS v4（CSS-first）

Tailwind v4 不再需要 `tailwind.config.js`，采用 `@tailwindcss/vite` 插件 +
CSS `@theme` 设计令牌（统一放在 `packages/config/tailwind.css`）。

### 4. 博客：Nuxt 4 + @nuxtjs/seo（内置 sitemap/robots）

`@nuxtjs/seo@5` 已聚合 robots + sitemap + OG + Schema.org，
**不重复安装** `@nuxtjs/sitemap` / `@nuxtjs/robots`。
Nuxt 4 默认 `srcDir='app/'`，为贴合项目结构设 `srcDir: '.'`。

### 5. 后端：NestJS 11 + Fastify Adapter

API 端口 3000，全局前缀 `/api`，Swagger UI 挂载于 `/api`。
Fastify 需要 `@fastify/static`（Swagger UI）与 `@fastify/cors`。

### 6. 校验方案分层

- Controller 层 DTO：`class-validator` + `class-transformer`（NestJS 官方）
- AI / Workflow 内部数据：`zod`
  不引入重复的全量校验方案。

### 7. 数据库：MongoDB + Mongoose（不引入 PostgreSQL/Prisma/Drizzle）

数据结构以文档为主；预留 MongoDB Vector Search；本阶段不装独立向量库
（不装 Pinecone/Milvus/Qdrant/Weaviate）。

### 8. 队列与 Redis：BullMQ + ioredis

bullmq@6 peer 接受 ioredis >=5，统一使用 ioredis 6，不混用 `redis` 包。

### 9. Worker 独立进程

`apps/worker` 为独立 Node 应用（tsx dev / tsc build），本阶段仅建
jobs/providers 目录与 Provider 契约接口，不实现 AI 业务。

### 10. 测试：Vitest 统一

单元测试用 Vitest（web 配 jsdom + @vue/test-utils，api 配 supertest e2e），
E2E 用 Playwright（仅初始化配置，不运行）。

### 11. pnpm 10+ postinstall 白名单

`pnpm-workspace.yaml` 配置构建白名单（bcrypt/esbuild/msgpackr-extract 等），
否则原生依赖构建失败。**执行时发现 pnpm 11 已改用 `allowBuilds` 键
（package.json 的 `pnpm` 字段不再读取），由 `pnpm approve-builds --all`
自动生成**；同时 pnpm 11 引入供应链策略（minimum release age），
新发布包需列入 `minimumReleaseAgeExclude`（自动维护）。

### 12. 内部包源码直出

`packages/*` 的 `exports` 直接指向 `src/*.ts`，避免 dev 阶段 paths 映射
复杂度；`dist` 仅作构建产物验证。

### 13. 图标库迁移：lucide-vue-next → @lucide/vue

`lucide-vue-next@1.0.0` 已被官方标记 deprecated（迁移至 `@lucide/vue`），
安装时即检出，采用 `@lucide/vue@1.31.0` 并更新 import。

### 14. TypeScript 6 的 moduleResolution 迁移

TS 6 弃用 `moduleResolution: node`（node10）。API 迁移至
`module: nodenext`（相对导入加 `.js` 后缀、关闭 `verbatimModuleSyntax`，
NestJS + CommonJS 的标准组合）；worker 原生使用 NodeNext。

## 后果

- 正向：工具链全部为当前稳定版，`pnpm lint/typecheck/build/test` 可全绿。
- 负向：TypeScript 停留在 6.x，待 typescript-eslint 兼容 TS 7 后再升级；
  Nuxt 4 的 `srcDir: '.'` 与官方默认结构略有差异，需在 README 说明。
- 风险：`@nestjs/schematics@11.1.0` 等配套版本随 Nest 11 小版本演进，
  升级时需同步核对 peer 依赖。

## 替代方案

- TypeScript 7.0.2：被 typescript-eslint peer 限制否决。
- @nuxtjs/sitemap + @nuxtjs/robots 单独安装：被 @nuxtjs/seo 聚合能力取代。
- Jest（NestJS 默认）：为保持 monorepo 单测试框架统一，选 Vitest。
