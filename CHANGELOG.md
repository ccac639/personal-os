# CHANGELOG

## [Unreleased]

### Added

- 路由页面过渡 v2「系统切换」：中心光束 + 定位环 + 细线六边形 + 状态文本
  （切换至 X）+ 视觉进度条，新页面以中央竖缝 clip-path 视口展开（不支持时
  自动淡入降级）；遮罩 z-index 定为 45（低于弹窗层），整体切换 ≤ 900ms
- 统一路由页面过渡系统：旧页淡出缩小 → 中心扫描线/光带 → 新页从中心展开 →
  内容分层进入（首页/Chat/工作流/项目主要区块），仅 transform/opacity/filter、
  遮罩 pointer-events 穿透、快速连续切换只保留最后一次导航、支持
  prefers-reduced-motion 降级（见 ADR-0003）
- 工作流列表视图：玻璃拟态卡片 + 环形成功率（67%）+ 按运行中/已完成/失败排序 +
  hover 显示「立即运行 / 查看日志」操作 + 运行中条目超细进度条 + 日志弹窗
- 工作流页支持「列表 / 编排画布」双视图切换（默认列表，画布保留编辑能力）

### Changed

- 过渡遮罩 z-index 9000 → 45（低于 modal/dialog/toast/popover 的 z-50+，
  高于页面内容 z-40），彻底消除与弹窗层的层级争议
- 路由视图下沉到 default-layout（RouterView + Transition + KeepAlive），
  顶部导航等持久 UI 不参与页面动画；motion-v 仅保留导航下划线/涟漪等微动效
- 导航项补齐键盘 focus-visible 高亮（ring 样式，与 hover 状态一致）
- 路由懒加载失败时由 router.onError 兜底清理过渡层并记录日志，不中断当前页面
- 主题同步补全：开发中页 TechTree、图标兜底、导航下划线、首页光斑等遗留固定中性色
  全部接入主题变量，任意背景/深色主题下所有 div 同步换肤
- 修复默认布局测试（补 Pinia 注册、同步新语义色类），存量失败测试转绿

### Fixed

- 修复首页（及所有路由页面）无法滚动：default-layout 的 `<main>` 误用
  `overflow-y-clip`（完全禁止滚动，既不能滚轮也不能编程滚动），改为
  `overflow-y-auto`，内容在 main 区域内正常滚动、顶部导航保持固定
- 修复 e2e 存量失败：smoke 断言首页不存在的 "Dashboard" 标题，改为真实区块
  "今日工作台"；新增滚动回归测试（内容溢出 + 真实滚轮滚动 + 可滚到底部），
  并等待 vite 冷启动依赖预构建完成再断言

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
