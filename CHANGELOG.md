# CHANGELOG

## [Unreleased]

### Added

- 工作流列表视图：玻璃拟态卡片 + 环形成功率（67%）+ 按运行中/已完成/失败排序 +
  hover 显示「立即运行 / 查看日志」操作 + 运行中条目超细进度条 + 日志弹窗
- 工作流页支持「列表 / 编排画布」双视图切换（默认列表，画布保留编辑能力）

### Changed

- 主题同步补全：开发中页 TechTree、图标兜底、导航下划线、首页光斑等遗留固定中性色
  全部接入主题变量，任意背景/深色主题下所有 div 同步换肤
- 修复默认布局测试（补 Pinia 注册、同步新语义色类），存量失败测试转绿

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
