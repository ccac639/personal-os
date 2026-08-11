# Personal OS

> 个人工作台 + AI Agent + Workflow + 项目管理 + 成果管理 + 博客 的一体化个人操作系统

当前状态：**Monorepo 初始化完成（v0.1.0）**——框架、依赖、目录结构、工程规范就绪，
业务功能尚未开发。

## 架构

```text
Vue 3 + Vite 8 ──► Personal OS Web（工作台 SPA，:5173）
Nuxt 4          ──► Public Blog（SSR 博客，:3001）
NestJS + Fastify──► REST / WebSocket API（:3000，Swagger: /api）
Node Worker     ──► BullMQ / AI / Workflow（独立进程）
MongoDB · Redis · MinIO（docker-compose 提供）
pnpm + Turborepo ──► Monorepo 编排
```

详细架构见 [`ARCHITECTURE.md`](./ARCHITECTURE.md)。

## 技术栈

| 层          | 选型                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monorepo    | pnpm 11 + Turborepo 2 + TypeScript 6                                                                                                                                                                        |
| Web         | Vue 3.5 · Vite 8 · Pinia 4 · Vue Router 5 · TanStack Vue Query · ofetch · Tailwind CSS v4 · reka-ui · @lucide/vue · motion · GSAP · ECharts · @vue-flow · Tiptap · Monaco · marked · zod · socket.io-client |
| Blog        | Nuxt 4 · @nuxtjs/seo（内置 robots/sitemap/OG/Schema/RSS）                                                                                                                                                   |
| API         | NestJS 11 · Fastify · Swagger · Mongoose · passport-jwt · bcrypt · BullMQ · ioredis · socket.io · pino · class-validator                                                                                    |
| Worker      | BullMQ · ioredis · mongoose · pino · zod · openai · @anthropic-ai/sdk（google/openrouter 预留适配）                                                                                                         |
| 数据库/存储 | MongoDB（Mongoose）· Redis（ioredis）· MinIO（S3 兼容，@aws-sdk/client-s3）                                                                                                                                 |
| 测试/规范   | Vitest · @vue/test-utils · Playwright · ESLint 10（flat config）· Prettier · Husky · lint-staged · Commitlint                                                                                               |

## 环境要求

- Node.js ≥ 24（开发环境已装 v24.17.0）
- pnpm ≥ 11（`npm i -g pnpm`）
- Docker（MongoDB / Redis / MinIO；未安装则无法启动数据库服务）

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础服务（MongoDB / Redis / MinIO）
pnpm docker:up

# 3. 复制环境变量
cp .env.example .env   # Windows: copy .env.example .env

# 4. 启动全部应用（web + blog + api + worker）
pnpm dev
```

访问地址：

| 服务         | 地址                                             |
| ------------ | ------------------------------------------------ |
| Web 工作台   | http://localhost:5173                            |
| Blog         | http://localhost:3001                            |
| API          | http://localhost:3000                            |
| Swagger      | http://localhost:3000/api                        |
| MinIO 控制台 | http://localhost:9001（minioadmin / minioadmin） |
| MongoDB      | localhost:27017                                  |
| Redis        | localhost:6379                                   |

> 端口冲突可调整：应用端口改各 app 配置（web: `vite.config.ts`、blog: `nuxt.config.ts`、api: `.env` 的 `API_PORT`），并同步修改 `.env.example` 与 `docker-compose.yml`。

## 常用命令

| 命令                                  | 说明                                            |
| ------------------------------------- | ----------------------------------------------- |
| `pnpm dev`                            | 并行启动 web / blog / api / worker              |
| `pnpm build`                          | 全量构建                                        |
| `pnpm lint`                           | ESLint 全量检查                                 |
| `pnpm typecheck`                      | TypeScript 类型检查                             |
| `pnpm test`                           | Vitest 单测                                     |
| `pnpm test:e2e`                       | Playwright E2E（需先 `npx playwright install`） |
| `pnpm format` / `pnpm format:check`   | Prettier 格式化 / 校验                          |
| `pnpm clean`                          | 清理构建产物与 node_modules                     |
| `pnpm docker:up` / `pnpm docker:down` | 启动 / 停止基础服务                             |

## 目录结构

```text
personal-os/
├── apps/
│   ├── web/                  # Vue 3 + Vite 8 工作台
│   │   └── src/
│   │       ├── app/          # 应用级初始化（query-client 等）
│   │       ├── layouts/      # 布局（default-layout）
│   │       ├── pages/        # 路由页面（7 个模块占位页）
│   │       ├── features/     # 业务模块（dashboard/chat/agents/workflows/projects/achievements/settings）
│   │       ├── components/   # 通用组件（PagePlaceholder）
│   │       ├── composables/  # 组合式函数
│   │       ├── stores/       # Pinia stores
│   │       ├── services/     # ofetch API 客户端 / socket 地址
│   │       └── router/       # 路由
│   ├── blog/                 # Nuxt 4 SSR 博客
│   │   ├── pages/  components/  layouts/  server/  assets/
│   ├── api/                  # NestJS 11 + Fastify
│   │   └── src/
│   │       ├── modules/      # auth/users/dashboard/projects/tasks/chat/agents/workflows/documents/achievements/articles/admin
│   │       ├── common/       # 共享基础设施（预留）
│   │       ├── config/       # configuration.ts 环境配置
│   │       └── main.ts
│   └── worker/               # 独立 Node 进程
│       └── src/
│           ├── jobs/         # ai/workflow/embedding/media/notification
│           └── providers/    # openai/anthropic/google/openrouter + types.ts 契约
├── packages/
│   ├── ui/                   # 设计系统（components/composables/styles + index.ts）
│   ├── types/                # 共享 TS 接口（auth/user/project/task/chat/agent/workflow/document/article/achievement）
│   ├── utils/                # date/string/object/validation
│   └── config/               # 统一 ESLint / Prettier / TS / Tailwind 配置
├── infrastructure/
│   ├── docker/               # Docker 补充说明
│   ├── nginx/                # 生产反向代理模板（预留）
│   └── scripts/              # 辅助脚本（规划中）
├── docker-compose.yml        # MongoDB / Redis / MinIO
├── package.json / pnpm-workspace.yaml / turbo.json
├── .env.example
└── README.md
```

## 工程文档

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — 架构总览
- [`DECISIONS/README.md`](./DECISIONS/README.md) — ADR 决策索引（记录于 `.opensquilla/decisions/`）
- [`BACKLOG.md`](./BACKLOG.md) — 待办与技术债
- [`CHANGELOG.md`](./CHANGELOG.md) — 变更记录
- [`PROJECT_HEALTH.md`](./PROJECT_HEALTH.md) — 项目健康度

## 已装依赖清单

安装时全部采用 npm registry 核实的**当前稳定版本**（镜像滞后时取镜像最新）。

### 根（工程规范）

`turbo@2.10.9` · `typescript@6.0.3` · `eslint@10.8.1` · `typescript-eslint@8.67.0` ·
`@typescript-eslint/parser@8.67.0` · `eslint-plugin-vue@10.10.0` · `@stylistic/eslint-plugin@5.10.0` ·
`eslint-config-prettier@10.1.8` · `prettier@3.9.6` · `prettier-plugin-tailwindcss@0.8.1` ·
`husky@9.1.7` · `lint-staged@17.3.0` · `@commitlint/cli@21.2.1` · `@commitlint/config-conventional@21.2.0` · `rimraf@6.1.3`

### apps/web（deps）

`vue@3.5.41` · `vue-router@5.2.0` · `pinia@4.0.2` · `@vueuse/core@14.4.0` ·
`@tanstack/vue-query@5.101.4` · `ofetch@1.5.1` · `tailwindcss@4.3.3` · `reka-ui@2.10.3` ·
`@lucide/vue@1.31.0` · `motion@13.1.0` · `gsap@3.15.0` · `echarts@6.1.0` · `vue-echarts@8.1.0` ·
`@vue-flow/{core,background,controls,minimap}` · `@tiptap/*@3.30.0`（vue-3/starter-kit/placeholder/link/image/code-block-lowlight）· `lowlight@3.3.0` ·
`monaco-editor@0.56.0` · `@guolao/vue-monaco-editor@1.6.0` · `marked@18.0.9` · `dompurify@3.4.13` ·
`zod@4.4.3` · `socket.io-client@4.8.3`

### apps/blog

`nuxt@4.5.2` · `@nuxtjs/seo@5.3.12` · `tailwindcss@4.3.3`

### apps/api

`@nestjs/{core,common,platform-fastify,config,swagger,jwt,passport,websockets,platform-socket.io,mongoose}@11.x` ·
`mongoose@9.9.2` · `passport@0.7.0` · `passport-jwt@4.0.1` · `bcrypt@6.0.0` ·
`ioredis@6.0.0` · `bullmq@6.0.10` · `socket.io@4.8.3` · `pino@10.3.1` · `nestjs-pino@4.6.1` ·
`class-validator@0.15.1` · `class-transformer@0.5.1` · `zod@4.4.3` · `@fastify/{static,cors}` · `rxjs@7.8.2` · `reflect-metadata@0.2.2`

### apps/worker

`bullmq@6.0.10` · `ioredis@6.0.0` · `mongoose@9.9.2` · `pino@10.3.1` · `zod@4.4.3` ·
`openai@7.4.0` · `@anthropic-ai/sdk@0.116.0`（google / openrouter 预留，SDK 未装）

### packages

- `utils`：`date-fns@4.4.0` · `lodash-es@4.18.1` · `nanoid@6.0.1` · `zod@4.4.3`
- `types` / `ui` / `config`：无第三方运行时依赖（config 含工程工具 devDeps）

### 测试

`vitest@4.1.10` · `@vue/test-utils@2.4.11` · `jsdom@30.0.1` · `@playwright/test@1.62.1` · `supertest@7.2.2`

## 已知说明

- **TypeScript 锁定 6.0.3**：npm latest（7.0.2，Go 重写版）与 typescript-eslint@8 的 peer 约束（`<6.1.0`）冲突，待工具链兼容后升级（见 ADR-0001）。
- **pnpm 11 供应链策略**：`pnpm-workspace.yaml` 的 `allowBuilds`（构建白名单）与 `minimumReleaseAgeExclude`（新发布包豁免）由 pnpm 自动维护，勿手动删除。
- **API 启动需要 MongoDB**（`pnpm docker:up` 先行）；无 Docker 时可单独验证 web / worker。
- **Playwright 浏览器二进制**未预装，首次 E2E 前执行 `npx playwright install`。
