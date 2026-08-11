# BACKLOG

> 统一管理 TODO / Bug / Feature / 技术债。优先级 P0（阻塞）> P1（高）> P2（中）> P3（低）。

## 进行中

- [ ] P0 初始化 Monorepo（本阶段）— 完成目录骨架与依赖安装后关闭

## 待办（后续阶段）

### 基础设施

- [ ] P1 认证模块（passport-jwt + bcrypt + users）
- [ ] P1 Redis 连接 provider（ioredis）与 BullMQ 队列注册
- [ ] P1 MinIO bucket 初始化脚本（infrastructure/scripts）
- [ ] P2 API 全局异常过滤器 / 拦截器（common/）

### Web

- [ ] P1 Dashboard 首页（概览卡片 + ECharts 可视化）
- [ ] P1 Chat 工作区（socket.io 流式对话 + Tiptap 富文本）
- [ ] P2 Agents 管理页（Agent CRUD + 运行状态）
- [ ] P2 Workflows 编排页（@vue-flow 画布 + 节点面板）
- [ ] P2 Projects / Tasks 看板
- [ ] P2 Achievements 成果展示
- [ ] P2 Settings / Admin

### Blog

- [ ] P1 文章 / 标签 / 分类 / 专题模型与页面
- [ ] P1 RSS + Sitemap 内容接入
- [ ] P2 项目介绍 / 成果展示页

### Worker

- [ ] P1 AI Provider 适配器（openai / anthropic 优先，google / openrouter 预留）
- [ ] P1 AI Task / Workflow 执行 Job
- [ ] P2 Embedding（MongoDB Vector Search 前置）
- [ ] P2 Notification / Media Processing

## 技术债

- [ ] P2 根 tsconfig 仅占位（solution-style references 待各包 composite 化后启用）
- [ ] P2 Playwright 浏览器二进制未预装（`npx playwright install` 按需执行）
- [ ] P3 TS 7 升级跟踪（待 typescript-eslint 兼容后评估）
