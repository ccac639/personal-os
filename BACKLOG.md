# BACKLOG

> 统一管理 TODO / Bug / Feature / 技术债。优先级 P0（阻塞）> P1（高）> P2（中）> P3（低）。

## 进行中

- [x] P0 初始化 Monorepo（目录骨架与依赖安装）
- [ ] P1 Sub2API 真实实例冒烟与凭据静态加密（Sub2API 真实实例线）
- [x] P1 Blog 内容源 A/B 决策与收尾提交（Blog 内容线；2026-08-15 交付，ADR-0014）
- [x] P1 Worker 线在途改动提交（Worker 线；2026-08-15 收口，ADR-0013）
- [ ] P1 Web 同步层数据源切换（Web 恢复与同步线 Phase 1/2）

## 待办（后续阶段）

### 基础设施

- [ ] P1 认证模块（passport-jwt + bcrypt + users）
- [ ] P1 Redis 连接 provider（ioredis）与 BullMQ 队列注册
- [ ] P1 MinIO bucket 初始化脚本（infrastructure/scripts）
- [ ] P2 API 全局异常过滤器 / 拦截器（common/）

### Web

- [x] P1 Dashboard 首页（概览卡片 + ECharts 可视化）
- [x] P2 Workflows 编排页（@vue-flow 画布 + 节点面板 + 属性面板 + 持久化 + 模拟运行）
- [ ] P1 Chat 工作区（socket.io 流式对话 + Tiptap 富文本；基础会话/导出已实现）
- [x] P2 Agents 管理页（Agent CRUD + 运行状态，契约收敛至后端 API）
- [x] P2 Projects / Tasks 看板
- [x] P2 Achievements 成果展示
- [ ] P2 Settings / Admin（部分完成）

### Blog

- [x] P1 文章 / 标签 / 分类 / 专题模型与页面（页面已提交，A/B 待决）
- [ ] P1 RSS + Sitemap 内容接入（sitemap 路由在途）
- [ ] P2 项目介绍 / 成果展示页

### Sub2API（管理模块）

- [x] P1 后端管理模块（controller/service/client/settings，31 用例）
- [x] P1 前端控制台（六视图 + 路由/导航，21 用例）
- [ ] P1 真实实例冒烟 + 凭据静态加密（本机无 docker/redis，阻塞中）

### Worker

- [x] P1 队列契约统一（queue-contract，两端一致性断言）
- [x] P1 AI Task / Workflow 执行 Job（workflow-runs + chat-generation）
- [ ] P2 Embedding（MongoDB Vector Search 前置）
- [ ] P2 Notification / Media Processing

## 技术债

- [ ] P2 根 tsconfig 仅占位（solution-style references 待各包 composite 化后启用）
- [ ] P2 Playwright 浏览器二进制未预装（`npx playwright install` 按需执行）
- [x] P2 repo-index 脚本已恢复至项目 workspace 层（`.opensquilla/skills/repo-index/scripts/`，2026-08-15），索引已刷新入库
- [ ] P3 TS 7 升级跟踪（待 typescript-eslint 兼容后评估）
- [ ] P2 repo-index 脚本未随项目分发（`.opensquilla/index/` 6:08 构建已过期，增量更新需 workspace 层 indexer.py；见 repo-index skill）

## FO3 测试体系收口登记（2026-08-15 Phase 0）

### 覆盖缺口清单

- [ ] sync：createProjectSync/createTaskSync/createReleasesSync handle 级测试（hydrate/乐观/离线三态）
- [ ] sync：sync-status-banner.vue 组件测试（merged 状态 → 可见性/tone/text）
- [ ] sub2api：route-form-dialog 路由表单校验（白名单相关，isAllowedPath 为后端概念）
- [ ] chat：多轮上下文 store 端到端（buildHistory regenerate 边界，对应 7e325d5）

### 本线治理项

- [ ] 全局错误边界 AppErrorBoundary（Phase 1）
- [ ] Playwright E2E 冒烟 3 条（Phase 3）
- [ ] a11y 基线 eslint-plugin-vue-a11y（Phase 4）
- [ ] dashboard-home 并发超时 flaky 根治（Phase 5）
