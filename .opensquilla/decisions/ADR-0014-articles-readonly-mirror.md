# ADR-0014：articles 模块落地——只读镜像 Blog 内容层（G1 选项 A）

- 状态：Accepted
- 日期：2026-08-15
- 相关：ADR-0008（业务模块装配）、ADR-0013（BullMQ 6 收口，同批后端分线）

## 背景

B1 分线（API 业务模块补全）要求落地 `apps/api/src/modules/articles/`
（此前仅 `.gitkeep`，属「应有但未实现」），并按 G1 决策在
「A 只读镜像 Blog 内容」与「B 全量 CRUD」之间选择。同时需对
three-d / inspiration 等模块做契约与健壮性加固评估。

技术约束（实测确认）：

- `apps/api/tsconfig.json`：`rootDir: src` + `include: src/**/*.ts`，
  且 blog 文件用无扩展名 import —— **api 无法直接 import `apps/blog` 代码**
  （rootDir 越界报错）。
- `apps/blog/content/posts/*.md` 是 monorepo 内稳定路径，运行期可读。
- 平台装配唯一注册点是 `platform/business-manifests.ts`（拓扑排序
  fail-fast，ADR-0008），禁改 `app.module.ts`。

## 决策

### 1. G1 选 A：articles 为只读镜像，不写库

- articles 提供 5 个读取端点：列表（分页）/ 详情 / 标签聚合 / 分类聚合 /
  按标签 / 按分类（共 6 路由），语义与 blog `posts.ts` 完全对齐：
  slug 由文件名派生（frontmatter 可选覆盖）、draft 排除、date 倒序、
  相邻导航、tags 去重、mtime 指纹缓存（内容变更自动重扫）。
- **不 import blog 代码**：service 自实现同语义文件型读取层
  （读取 `../blog/content/posts`，相对 monorepo 根的稳定路径），
  自实现零依赖 Markdown 子集渲染器（HTML 转义 + 协议白名单）。
- 理由：blog 是内容权威（Nuxt SSR 直出），articles 的定位是「API 支撑
  的内容读取面」；B 全量 CRUD 需要写库 + 双写同步策略（blog 仍读文件），
  单用户个人项目下成本高、收益低，列为后续可选。
- 响应信封 `{requestId,timestamp,path,statusCode,code,message,data}` 由
  平台 TransformInterceptor 统一包装（红线 4），articles 不自包；
  分页 `{items,total,page,pageSize}` 与平台一致。

### 2. G2 加固评估：three-d / inspiration 已达标，零改动

- 两模块既有实现已满足文档全部加固要求：class-validator DTO（长度/
  枚举/嵌套校验）、统一错误（errNotFound/errBadRequest → AllExceptionsFilter
  统一信封）、分页一致（PaginationQueryDto + Paginated）、文本安全
  （assertTextOnly）、无外部调用面（无 SSRF 风险）。
- 结论：避免无意义 churn，不做「为了改而改」的加固。

### 3. 契约测试（11 用例）

`apps/api/test/articles-module.spec.ts` 覆盖：统一信封、列表倒序 +
draft 排除、pageSize 非法 400、未知 slug 404、正文渲染 HTML +
相邻导航、draft 详情 404、标签/分类聚合（不含 draft）、按标签/分类
筛选、与 blog 内容同步（列表总数 = 非 draft 数）、getDetail 未知
slug null、标签按文章数倒序。

## 后果

- 正向：API 侧获得与 blog 语义一致的内容读取面；未来 blog 切 articles
  API 时 `composables/usePosts.ts` 替换点可直接映射（列表→`GET /articles`、
  详情→`GET /articles/:slug`、标签/分类→对应聚合端点），页面零改动；
  模块零 DB 依赖，装配失败面最小。
- 负向：articles 与 blog 是**实时文件读取**（每次请求 mtime 指纹重扫），
  blog 内容量增长后需加内存 TTL 缓存；Markdown 渲染器是子集实现，若
  blog 引入新语法需同步（当前与 blog 渲染语义一致）。
- 迁移路径：升级为 B 全量 CRUD 时，service 接口保持（list/detail/tags/
  categories），仅替换存储实现（Mongo），controller/DTO 不变。

## 替代方案（已评估）

- **B 全量 CRUD + draft/tags/categories**：需写库 + 与 blog 文件内容
  双写同步策略（blog 仍读文件），单用户场景成本高；列为后续可选，
  若实施需先定同步策略（文件为权威 or DB 为权威）。
- **直接 import blog posts.ts**：rootDir 越界 + 无扩展名 import 导致
  api 编译失败，弃。
- **复制 blog posts.ts 到 api**：代码重复，两处语义漂移风险，弃
  （自实现但语义对齐，单一权威仍为 blog）。
