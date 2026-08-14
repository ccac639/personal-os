# ADR-0012：Sub2API 真实连接验证、双模测试与契约校准

- 状态：已接受
- 日期：2026-08-15
- 相关：ADR-0008（业务模块装配）

## 背景

Sub2API 管理模块（`apps/api/src/modules/sub2api/` + `apps/web/src/.../sub2api/`）上一轮
已交付并全绿（api 31/31、web 21/21、全量 1272、双端 typecheck 0、web build 成功），
但所有验证均走 fake adapter，未连接真实 Sub2API 实例；官方契约基于
`.tmp-sub2api/sub2api-main` 源码静态核对（2026-08-15）。

需求：升级为真实后端可验证、契约偏差可校准、CI 保持稳定；清理临时资产并把
契约核对结论沉淀为决策记录。

## 决策

### 1. 双模测试策略（SUB2API_REAL_BACKEND 开关）

- 环境变量 `SUB2API_REAL_BACKEND=1` 启用真实后端冒烟，否则一律 fake。
- 默认（CI）：`test/sub2api-module.spec.ts` 固定注入 `FakeSub2ApiAdapter`
  （权威基线，行为不变）；`test/sub2api-module.real.spec.ts` 经
  `describe.skipIf` 自动跳过，CI 零影响。
- 人工：`SUB2API_REAL_BACKEND=1` + `SUB2API_REAL_BASE_URL` +
  `SUB2API_REAL_TOKEN` 注入真实连接（进程内，不落盘、不进 git）。
  凭据齐备性在 `beforeAll` 校验：缺失即显式失败（提示配置不完整），不静默假绿。
- 真实/测试替身实现同一 `Sub2ApiAdapter` 接口（`client/adapter.ts`），
  替换点单一：spec 内 overrideProvider(SUB2API_ADAPTER) 一处决策。
- 冒烟断言只检查「信封结构合法」或「命中已知稳定 SUB2API_* 错误码
  （401/403/404/409/429/504/5xx/超时/不可达）」；真实响应体（含 PII）
  禁止写入快照 / 日志 / 文件。

### 2. 契约校准结论（静态源码核对，官方仓库 Wei-Shaw/sub2api main 分支）

- 管理端点：`/api/v1/admin/*`（channels / accounts / subscriptions / groups /
  composite routes / dashboard stats·realtime·trend / ops request-errors / system version）。
- **非 /admin 前缀端点**：API 凭据 `/api/v1/keys`、用量 `/api/v1/usage`、
  `/api/v1/usage/stats`（官方 `frontend/src/api/keys.ts` 与 `adminUIRequest.ts`
  均挂在 `/api/v1` 下，非 `/api/v1/admin`）。
- 响应信封 `{ code: 0, message, data }`（code≠0 为业务错误）；
  分页 `{ items, total, page, page_size, pages }`；字段 snake_case。
- 结论：`keys` / `models` 路径前缀无偏差；**`usage` 曾有偏差，已于第三阶段修正**
  （见下文「偏差-修复清单」）。

### 2.1 偏差-修复清单（第三阶段，2026-08-15）

- **偏差**：`sub2api.client.ts` 的 `listUsage` / `getUsageStats` 使用内部路径
  `/admin/usage` / `/admin/usage/stats`，经 `buildUpstreamUrl` 拼为
  `${base}/api/v1/admin/usage`；与上游**非 admin** 的 `/api/v1/usage`、
  `/api/v1/usage/stats` 不符 → 真实实例下 usage 两端点必 404。
  此前 fake 适配器不校验 URL，31 个测试全绿未暴露（根因：缺构造 URL 断言）。
- **修复**：内部路径改为 `/usage` / `/usage/stats`；白名单
  `ALLOWED_PATH_PREFIXES` 中 `/admin/usage` 改为 `/usage`（与 `/keys`、`/models`
  同为非 admin 前缀）；在 fake 权威基线 `sub2api-module.spec.ts` 增加
  `buildUpstreamUrl` 构造断言防回归。
- **验证**：`buildUpstreamUrl('https://s.example','/usage') ===
'https://s.example/api/v1/usage'`；fake 基线 31+ 用例全绿；真实实例冒烟待环境
  （本机无 docker / redis 运行时，保持 skip，不伪造通过）。

### 3. 凭据静态加密：本期不实施

Redis 明文存储与既有 ai 模块同约定（进程内密钥、TTL 30 天、不回显）。
静态加密列为可选后续（复用 `apps/api/src/common/security/`），
不改变「不回显 / 不落 Mongo 明文 / 不落盘」红线。

### 4. 清理临时资产

删除 `.tmp-sub2api/`（官方仓库源码临时解压区，含 tar.gz，不影响构建）。

## 后果

- CI 以 fake 模式为权威基线，永远稳定；本地具备真实实例时可一键切真实冒烟。
- 真实凭据在任何文件 / 快照 / 日志中零出现（测试仅进程内读取）。
- 契约偏差若在真实冒烟中发现（>5 字段或枚举冲突），先在本文档记录偏差清单再改代码。
- 本模块与装配入口（business-manifests.ts）必须同批提交，避免模块游离导致 bootstrap 失败。

## 替代方案

- 本地 docker 起真实 Sub2API 实例：本机无 docker / redis 运行时，环境阻塞；
  保留为将来可选路径，不阻塞双模测试落地。
- 生产装配层加 adapter 开关：不必要 —— 生产恒连真实上游（模块默认
  `SUB2API_ADAPTER: useExisting Sub2ApiClient`），开关只存在于测试侧。
