# 交付报告：Node 后端「项目与任务业务分线」

- 日期：2026-08-15
- 负责人：Developer（Node 后端分线）
- 范围：projects / tasks / focus / releases / knowledge 模块 + packages/types 契约 + 对应测试
- 约束遵守：未触碰 Chat / AI / Workflow / Worker / 平台安全基座；未改 `app.module.ts`；
  未回滚或覆盖他人代码；未做全仓格式化；模块注册片段已单独给出（见 §7）。

## 1. 审计结论（先审计后修改）

现有代码已具备较高完成度：CRUD / 分页（`_shared/pagination`）/ 搜索（转义正则）/
筛选 / 排序 / 响应 DTO 已统一；`ParseObjectIdPipe` 与 `mapMongoError`（CastError→400、
DuplicateKey 11000→409、ValidationError→400、其余→500）已全局复用；删除级联与
`withTransaction` 补偿路径已实现并有测试。**基线 97 个测试全绿**。

审计确认的**实质缺口**（本次修复）：

| #   | 缺口                                                                                                                                                                                                       | 对应任务    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| 1   | 任务依赖未校验**跨项目无效依赖**（依赖任务与当前任务不同域）                                                                                                                                               | 任务 4      |
| 2   | **localStorage 数据导入功能完全缺失**（无版本/上限/重复ID/引用校验）                                                                                                                                       | 任务 7      |
| 3   | `packages/types` 的 Project/Task 契约与后端不一致：含违反单用户约束的 `ownerId`/`assigneeId` 必填字段，缺 `favorite/progressMode/progress/archived/techStack/targetDate`、`tags/dependencies/sortOrder` 等 | 任务 2      |
| 4   | Release/Milestone 的 `taskIds`/`milestoneIds` 未防重复引用（DTO 缺 `@ArrayUnique`）                                                                                                                        | 任务 8 加固 |

审计确认**无缺口**项：任务 3（projectId/taskId/milestoneId/ObjectId 校验）、任务 5
（删除策略已完整）、任务 6（事务 helper + 幂等顺序）、任务 8（重复键/并发/不存在/
异常映射不泄漏 Mongo 内部错误）、任务 9（pagination / ParseObjectIdPipe / 统一错误结构复用）。

## 2. 修复的问题

1. **跨项目无效依赖拦截**（`apps/api/src/modules/tasks/tasks.service.ts`）
   - 规则（ADR-0009）：依赖任务必须与当前任务**同域**——同项目内可互依；
     收件箱任务（`projectId=null`）只能依赖收件箱任务；禁止跨项目 / 收件箱⇄项目。
   - `create` 按最终 `projectId` 校验；`update` 以「更新后的最终状态」校验
     （`projectId` 与 `dependencies` 同时变更、只改其一均覆盖；只改 `projectId`
     也会校验既有依赖与新域一致）。
   - 校验在 BFS 遍历依赖图时一次查询完成「存在性 + 同域」双重校验。
2. **数据导入**（新模块 `apps/api/src/modules/data-import/`，见 §5）。
3. **types 契约同步**（`packages/types/src/project.ts`、`task.ts`）
   - 对齐后端响应形状；`ownerId`/`assigneeId` 降级为 `@deprecated` 可选字段
     （保留以兼容 web 分线在途代码，API 层仍拒绝），`ProjectStatus` 保留
     `archived`（前端筛选兼容值，注释说明）。
   - 验证：`@personal-os/types` typecheck 通过；`@personal-os/web` typecheck
     错误清单中**无**任何 types 相关错误（web 现有报错均属其自身在途代码）。
4. **DTO 加固**：`CreateReleaseDto` / `CreateMilestoneDto` 的 `taskIds` /
   `milestoneIds` 增加 `@ArrayUnique`（重复引用直接 400）。

## 3. API 契约（统一口径）

- 所有列表端点：`GET /api/projects|tasks|releases|releases/milestones|knowledge`
  → `{ items, total, page, pageSize, totalPages }`（`PageQueryDto`：page≥1、pageSize 1..100、
  `sortBy` 白名单、`sortOrder` asc|desc；非法值 400）。
- 所有路径参数：`ParseObjectIdPipe`，非法 ObjectId → 400 `VALIDATION_ERROR`。
- 响应形状：文档 `toJSON`（`_id → id`、`versionKey` 去除），与各 `*Dto` Swagger 声明一致。
- 错误结构：`{ requestId, timestamp, path, statusCode, code, message, fields? }`
  （`AllExceptionsFilter` 统一输出；业务 400/404/409 消息中文、不泄漏 Mongo 内部错误）。
- 任务依赖域规则：`dependencies` 必须同域（同项目 / 同为收件箱），禁止自依赖、
  重复、循环、跨项目、悬空引用；`update` 传 `dependencies` 时整体替换。
- **新增** `POST /api/data/import`（见 §5）。

## 4. 删除策略（现状确认，未改动）

| 场景                                                           | 行为                                                                                                                                                                                                                                              |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DELETE /api/projects/:id`（默认）                             | 软删除：`archived=true`，任务/里程碑/发布/知识全保留                                                                                                                                                                                              |
| `DELETE /api/projects/:id?permanent=true&taskStrategy=cascade` | 任务删除（外部任务对它们的依赖引用已同域保证无需跨项目清理）；里程碑删除并清理 release.milestoneIds；知识条目（projectId/taskId/milestoneId 命中）删除；release 解除项目关联（projectId=null）并清理 taskIds 悬空引用；focus 引用清空；最后删项目 |
| `DELETE /api/projects/:id?permanent=true&taskStrategy=inbox`   | 任务 projectId 置空转入收件箱；release.taskIds **保留**（任务仍存在）；其余同上                                                                                                                                                                   |
| `DELETE /api/tasks/:id`                                        | focus 三集合 taskId→null → release.taskIds 移除 → 其他任务 dependencies $pull → 删任务                                                                                                                                                            |
| `DELETE /api/releases/milestones/:id`                          | release.milestoneIds $pull → 删里程碑                                                                                                                                                                                                             |

多集合写入统一走 `withTransaction`（replica set 原子；standalone 按
「先清理关联、最后删主文档」的补偿顺序，幂等可重试）。本分线未修改上述逻辑，
仅因「同域规则」收紧使 cascade 场景的跨项目清理分支不再可能发生（测试同步更新）。

## 5. 数据导入策略（新增，ADR-0006）

端点：`POST /api/data/import`，Body 结构：

```jsonc
{
  "version": 1,                       // 必须等于 IMPORT_VERSION=1，否则 400
  "projects": [{ "id": "...", "name": "...", /* 与 CreateProjectDto 同契约 */ }],
  "tasks":    [{ "id": "...", "projectId": "...|null", "title": "...", "dependencies": [...] }],
  "milestones": [...], "releases": [...], "knowledge": [...],
  "focus": { "plans": [...], "sessions": [...], "weeklyGoals": [...] }
}
```

校验规则（**全部通过才写入**，任一失败整体 400 无副作用）：

1. **版本**：`version === 1`（DTO `@IsIn` + service 双保险）。
2. **数量上限**（DTO `@ArrayMaxSize`）：projects 500 / tasks 5000 / milestones 1000 /
   releases 1000 / knowledge 5000 / plans 2000 / sessions 10000 / weeklyGoals 1000。
3. **重复 ID**：各集合内 `id`（合法 ObjectId）必须唯一。
4. **引用完整性（自包含快照语义）**：所有引用必须在导入集内解析——
   - 任务 `projectId` → 项目存在；`dependencies` → 任务存在 + 非自身 + 无重复 +
     无环（Kahn 拓扑）+ **同域**（与在线规则一致）；
   - 里程碑/发布 `projectId` → 项目存在；发布 `taskIds`/`milestoneIds` → 实体存在；
   - 知识条目引用存在 + 任务/里程碑与项目关联一致；
   - focus 计划/专注/周目标的 `taskId` → 任务存在。
5. **字段契约**：`forbidNonWhitelisted`，未知字段（如 `ownerId`）整体拒绝；
   `createdAt`/`updatedAt` 接受但忽略（时间由 Mongo timestamps 维护）。
6. **幂等写入**：按 `id` 逐文档 `findOneAndUpdate({_id}, $set, upsert)`（已存在覆盖、
   不存在按 id 创建）；重复导入结果一致；写入顺序先被引用方（projects → tasks →
   milestones → releases → knowledge → focus），经 `withTransaction`。

响应：`{ imported: { projects, tasks, milestones, releases, knowledge, plans, sessions, weeklyGoals }, total }`。

## 6. 测试结果

```
Test Files  6 passed (6)   Tests  121 passed (121)
```

| 文件                                 | 用例数 | 覆盖                                                                                                                     |
| ------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------ |
| test/projects.spec.ts                | 32     | CRUD/搜索/分页/筛选/排序/归档/永久删除(cascade+inbox)/级联清理/Mongo 错误映射/事务路径/并发/进度模式/跨项目依赖拒绝      |
| test/tasks.spec.ts                   | 31     | CRUD/收件箱/筛选搜索排序/依赖约束（自依赖/重复/不存在/循环/长链/**跨项目 7 例**）/删除级联/并发                          |
| test/releases.spec.ts                | 13     | 发布/里程碑 CRUD、引用存在性、重复版本 409、删除清理引用                                                                 |
| test/knowledge.spec.ts               | 14     | 三类条目/引用完整性（含跨项目一致性）/过滤搜索分页                                                                       |
| test/projects-focus.spec.ts          | 14     | 计划/专注记录/周目标 CRUD、日期校验、taskId 引用校验                                                                     |
| **test/data-import.spec.ts（新增）** | 17     | 版本/上限/未知字段/重复ID/各类引用 400/跨项目 400/循环 400/**成功导入计数与落库**/**重复导入幂等**/部分导入/**事务路径** |

Typecheck：

- `pnpm --filter @personal-os/types typecheck` ✅ 通过
- `pnpm --filter @personal-os/api typecheck` ⚠️ 仍失败，但错误清单仅剩其他分线
  在途模块（`agents/chat/inspiration/three-d`）；本次涉及文件（projects/tasks/focus/
  releases/knowledge/data-import/dto）**零错误**——属工作区基线问题，非本分线引入。
- `pnpm --filter @personal-os/web typecheck` ⚠️ web 分线自身在途错误（sync.ts 等），
  与 types 改动无关（无 ownerId/assigneeId/subtasks 相关报错）。

## 7. 模块注册片段（交给主协调 agent 汇入 `apps/api/src/platform/business-manifests.ts`）

`data-import/manifest.ts` 已创建（id: `data-import`，无依赖）。主协调 agent 需在
`business-manifests.ts` 追加（projects/tasks/focus/releases/knowledge 的 manifest
已存在于各模块目录，同样待注册）：

```ts
import { projectsManifest } from '../modules/projects/manifest.js';
import { tasksManifest } from '../modules/tasks/manifest.js';
import { focusManifest } from '../modules/focus/manifest.js';
import { releasesManifest } from '../modules/releases/manifest.js';
import { knowledgeManifest } from '../modules/knowledge/manifest.js';
import { dataImportManifest } from '../modules/data-import/manifest.js';

export const businessManifests: ModuleManifest[] = [
  focusManifest,
  knowledgeManifest,
  releasesManifest,
  tasksManifest, // dependsOn focus
  projectsManifest, // dependsOn tasks/focus/releases/knowledge
  dataImportManifest,
];
```

## 8. 协作注意事项

- **ADR 编号冲突（已解决本线侧）**：worker 分线创建的 `ADR-0005-worker-async-lines.md`、
  `ADR-0005-worker-queue-contract.md` 与本线 `ADR-0005-task-dependency-scope.md` 编号重复
  （并行工作所致）。本线已将自己的 ADR 重命名为 **ADR-0009-task-dependency-scope.md**
  （0001-0008 已全部占用，0009 为下一个可用编号），正文引用同步更新；worker 分线的
  两个 ADR-0005 重复问题保留给 worker 分线/主协调 agent 重排。
- 本分线未提交（工作区协作模式）：改动均为工作区增量，未 commit；
  其余 M/?? 文件属其他分线在途工作，未触碰。
- 依赖「同域」规则的既有测试语义已同步（`projects.spec.ts` 中收件箱依赖项目任务
  由「允许 + 级联清理」改为「400 拒绝」）。
