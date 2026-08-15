# ADR-0015：API 版本化策略（URI，无 defaultVersion）与会话鉴权暂缓（G1/G2）

- 状态：Accepted
- 日期：2026-08-15
- 相关：ADR-0007（平台安全加固）、ADR-0012（sub2api 双模式验证）、阶段 10 分线提示词（API 安全与契约加固）

## 背景

阶段 10「API 安全与契约加固」要求确立 API 版本化策略（URI 或 Header），
稳定契约。红线明确：不得破坏 Sub2API 31 端点 URL 契约、不得因版本化破坏
现有 `/api` 前缀可用性。

实测基线：`main.ts` 仅有 `setGlobalPrefix('api')`，无 `VersioningType` /
`enableVersioning`；全部 19 个 `@Controller` 无 `@Version` 标注。

决策网关 G1（版本化方式）默认选项 A 为 URI 版本化 `/api/v1/...`，但**原样
执行会改写全部现有路由 URL**（NestJS 无原生双路径兼容），与红线直接冲突，
故提交用户裁决；G2（会话鉴权）按红线默认「不引入 JWT」。

## 决策

### 1. G1 选 A'：URI 版本化，不设 defaultVersion（零破坏）

`app.enableVersioning({ type: VersioningType.URI })`，**不设
`defaultVersion`**：

- 现有 controller 未标 `@Version` → 路由保持 `/api/...` 不变（Sub2API
  31 端点 URL 零变化，红线满足）。
- 未来新版本模块显式 `@Version('2')` → 自动获得 `/api/v2/...`，与
  未版本化路由共存。
- 版本前缀位于全局前缀之后、controller 路径之前（`/api/v2/...`）。
- Swagger 正常生成文档，未版本化路由按原路径展示。

### 2. G2 确认：不引入用户 JWT 会话认证（维持设计现状）

- 保持仅 `api-key` 机器鉴权（全局 `ApiKeyGuard`，ADR-0007 已固化）；
  不引入 Passport/JWT/RolesGuard，除非未来出现多用户场景重新决策。
- `@nestjs/jwt` / `@nestjs/passport` / `passport-jwt` 为既有依赖
  （历史遗留），本决策不涉及移除。

### 3. 契约测试（4 用例）

`apps/api/test/platform-versioning.spec.ts` 覆盖：未版本化路由 `/api`
前缀零破坏；版本化路由 `/api/v2` 可访问；版本化路由无版本前缀 404；
未版本化路由带版本前缀 404。

## 后果

- 正向：契约获得显式版本化语义，未来 v2 平滑演进；现有客户端零迁移；
  测试锁定「版本前缀互斥」行为，防未来误标 `@Version` 破坏现状。
- 负向：未版本化路由与版本化路由并存，Swagger 文档不区分版本分组
  （可接受，当前无 v2 模块）；若未来需要「未标版本 = v1」语义，需
  显式 `defaultVersion: '1'` 并全量标注，届时为一次显式迁移。
- 迁移路径：引入 v2 模块时仅需在 controller 加 `@Version('2')`；
  如需 v1 显式化，全量加 `@Version('1')` + 设 defaultVersion 即可，
  路由不变。

## 替代方案（已评估）

- **A 原样 URI 版本化 + defaultVersion '1'**：全部现有路由 URL 变
  `/api/v1/...`，破坏 Sub2API 31 端点契约与前端调用，违反红线，弃。
- **B Header 版本化（X-API-Version）**：URL 不变、语义由 header 表达，
  但对前端/工具不直观、curl 不便；保留为未来备选（若出现需要
  无路径版本化的场景）。
- **C 暂缓版本化**：契约由测试锁定即算版本；但无法表达「v2 演进」
  语义，本阶段目标 3 明确要求确立策略，弃。
