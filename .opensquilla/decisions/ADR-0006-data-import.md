# ADR-0006: localStorage 数据导入（版本 / 上限 / 重复 ID / 引用完整性 / 幂等）

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Developer（Node 后端分线）

## 背景

前端将项目/任务/发布/知识/focus 数据持久化于 localStorage（离线缓存）。用户
换设备、清浏览器或重置本地库后需要把导出数据导回后端。需求约束：导入必须校验
**版本、数量上限、重复 ID、引用关系**，且多集合写入需具备**幂等性**（可重试）。

## 决策

新增独立模块 `apps/api/src/modules/data-import/`，端点 `POST /api/data/import`
（经模块 manifest 注册，注册片段交由主协调 agent 汇入 `business-manifests.ts`）。

1. **格式版本**：`version` 必填且必须等于 `IMPORT_VERSION = 1`，否则 400。
   导出方（前端）必须携带版本；未来契约演进时升版本并做迁移。
2. **数量上限**：单集合超限整体拒绝（DTO `ArrayMaxSize`）：
   projects 500 / tasks 5000 / milestones 1000 / releases 1000 /
   knowledge 5000 / plans 2000 / sessions 10000 / weeklyGoals 1000。
3. **重复 ID**：每个集合内 `id` 必须唯一（`id` 为合法 ObjectId），重复即 400。
   `id` 同时是幂等 upsert 的键。
4. **引用完整性（自包含快照语义）**：所有引用必须在导入数据集内解析，
   不允许引用库中既有数据（保证可预测性与可回滚）：
   - 任务 `projectId` → 项目存在；任务 `dependencies` → 任务存在 + 非自身 +
     无重复 + 无环（Kahn 拓扑）+ **同域**（同项目 / 同为收件箱，见 ADR-0009）；
   - 里程碑 / 发布 `projectId` → 项目存在；发布 `taskIds` / `milestoneIds` →
     对应实体存在；
   - 知识条目 `projectId` / `taskId` / `milestoneId` → 存在，且任务/里程碑与
     项目关联一致（与 `KnowledgeService.assertRefsValid` 同规则）；
   - focus 计划/专注记录/周目标的 `taskId` → 任务存在。
5. **先校验后写入**：任一校验失败整体 400，不写任何数据（不产生半完成状态）。
6. **写入策略**：按导入 `id` 逐文档 `findOneAndUpdate({ _id }, $set, upsert)`
   ——已存在整体覆盖、不存在按 id 创建；重复导入结果一致（幂等）。写入顺序
   先被引用方（projects → tasks → milestones → releases → knowledge → focus），
   多集合写入经 `withTransaction`（支持事务的连接原子执行，否则补偿顺序可重试）。
7. **时间戳**：接受导出数据中的 `createdAt` / `updatedAt` 字段（兼容旧快照）
   但忽略不写，由 Mongo `timestamps` 统一维护（导入时刻）。
8. **字段契约**：导入数据必须符合 API 契约（全局 `forbidNonWhitelisted`），
   未知字段（如 `ownerId`、`assigneeId`）整体拒绝——单用户系统不接受这些字段。

## 后果

- 正向：一次调用恢复完整本地快照；校验失败无副作用；重复导入安全；
  与在线 CRUD 的约束规则完全一致（同域依赖、跨项目一致性）。
- 负向：引用必须自包含——若用户 localStorage 只有部分数据且引用已入库数据，
  导入会 400（错误信息明示「必须自包含」），需先完整导出再导入；
  导入时间戳不保留（文档说明）。
- 迁移路径：`version` 升版时新增迁移函数；后续如需「合并到既有库」语义，
  可增加 `mode: merge` 扩展（本期不做，保持简单）。

## 替代方案（已评估）

- **bulkWrite 批量 upsert**：单次调用高效，但测试 mock 不支持、重复键定位
  粒度差（需要拆错误再回查）。逐文档 upsert 对单机个人应用完全够用。弃。
- **导入 = 清空重建（replace）**：破坏既有数据风险高，且与「导入 ≠ 同步」
  语义不符。弃（upsert 更安全）。
- **引用允许指向库中既有数据**：校验需混合内存 + 数据库查询，事务窗口内
  一致性难保证、错误定位复杂。弃（自包含快照）。
