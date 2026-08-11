# CHANGELOG

## [0.1.0] - 2026-08-12

### Added

- Monorepo 初始化：pnpm workspace + Turborepo + TypeScript 6
- `apps/web`：Vue 3 + Vite 8 + Tailwind v4 + Pinia + Vue Query + reka-ui +
  @vue-flow + Tiptap + Monaco + ECharts + motion/gsap（骨架 + 路由占位页）
- `apps/blog`：Nuxt 4 + @nuxtjs/seo（SSR/SEO/OG/Sitemap/RSS/Schema 能力就绪）
- `apps/api`：NestJS 11 + Fastify + Swagger + Mongoose + pino + BullMQ/ioredis
  依赖就位（模块目录骨架）
- `apps/worker`：独立 Node 进程骨架 + AI Provider 契约
- `packages`：config（统一 TS/ESLint/Prettier/Tailwind）、types（共享接口）、
  utils（date/string/object/validation）、ui（设计系统入口）
- 基础设施：docker-compose（MongoDB/Redis/MinIO）、nginx 模板、scripts 约定
- 工程规范：ESLint 10 flat config、Prettier、Husky + lint-staged、
  Commitlint（conventional commits）、Vitest 统一测试、Playwright E2E 配置
- 文档：README / ARCHITECTURE / BACKLOG / DECISIONS(ADR-0001) / PROJECT_HEALTH
