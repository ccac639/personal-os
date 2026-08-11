# PROJECT_HEALTH — 项目健康度

> 六维评分 0-100，每周例行更新（project-health skill）。

## 2026-08-12（初始化基线）

| 维度       | 分数 | 说明                                                       |
| ---------- | ---- | ---------------------------------------------------------- |
| 架构清晰度 | 85   | 分层与边界明确（web/blog/api/worker/packages），ADR 已建立 |
| 代码质量   | 80   | 严格 TS + ESLint/Prettier 全绿；业务代码尚未开始           |
| 测试覆盖   | 55   | Vitest 环境就绪 + smoke 测试；业务测试待后续阶段           |
| 依赖健康   | 75   | 全量当前稳定版；TS 7 受 typescript-eslint 限制暂缓         |
| 文档完整   | 80   | README/ARCHITECTURE/BACKLOG/CHANGELOG/DECISIONS 齐备       |
| 工程效率   | 85   | Turborepo 编排 + Husky 门禁 + lint-staged 已启用           |

**综合：77 / 100（初始化基线）**

## 已知风险

- 业务功能未实现，测试覆盖分低属预期
- Playwright 浏览器二进制需按需安装
- Nuxt 4 `srcDir: '.'` 为项目定制，升级 Nuxt 时需回归验证
