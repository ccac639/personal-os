# ADR-0016：Blog 图片方案——零依赖策略（G1 选项 B 修订）

- 状态：Accepted
- 日期：2026-08-15
- 相关：ADR-0014（articles 只读镜像，同批 blog 内容线）、09 线分线提示词（Blog 阅读体验与性能，FO2）

## 背景

09 线 Phase 1（图片优化）原计划按 G1 决策在：

- **A：@nuxt/image**（Nuxt 原生、SSR 友好，默认选项）
- **B：手动 sharp 流水线**

之间选择。文档默认 A，但实测出现两个硬约束：

1. **内容现状**：`apps/blog/content/posts/*.md` 全部 5 篇文章**无任何图片**
   引用（纯文本/代码块），`@nuxt/image` 无实际受益对象——属「未来备用」而非
   「当前需要」。
2. **lockfile 污染**：本仓库 lockfile 为 pnpm v9.0 格式，本地 pnpm v11.21 的
   `add` 会触发**整表重排**（实测 +13 包但 diff 达 9202 行：2398 插入 /
   6805 删除，均为格式规范化而非依赖变更）。文档红线精神「最小变更 /
   不引入不必要依赖」与「避免根 lockfile 无关 churn」冲突。

## 决策

### G1 改为「B 修订版：零依赖图片策略」，不装任何包

- markdown 渲染器 `renderMarkdown` 的 `![alt](src)` 输出增加：
  `loading="lazy"`（原有）+ `decoding="async"`（新，降主线程解码阻塞）+
  `width="768" height="432"` 占位（新，防 CLS / Cumulative Layout Shift）。
- CSS `.prose-blog img` 补 `height: auto`，配合占位保持比例不拉伸。
- 明暗主题下均用 `max-w-full` 自适应容器宽度。

### 理由

- 内容无图片时，`@nuxt/image` 的响应式/懒加载/WebP 能力**零收益**；
- 装包触发 9202 行 lockfile 规范化，污染 review 且违反最小变更；
- 将来内容引入封面图时，再评估装 `@nuxt/image`（届时 lockfile 规范化
  可接受，或随 pnpm 升级一并处理）。

### 备选方案

- **A（@nuxt/image）**：被否。原因如上（无受益对象 + lockfile churn）。
- **B 原版（sharp 手动流水线）**：被否。同样引入依赖（sharp 原生编译），
  且内容无图时纯属过度设计。

## 后果

- 正面：blog 零新增依赖；CLS 防护已就位（width/height 占位）；
  图片解码异步化降低主线程阻塞；测试同步更新（markdown.spec 图片断言
  含新属性）。
- 负面：将来图片真正落地时，需重新评估响应式/WebP 能力（当前占位
  768x432 是固定宽高比，非响应式多尺寸）。
- 迁移影响：无（渲染器输出向后兼容——HTML 属性新增不破坏既有消费方；
  测试断言已同步）。

## 执行记录

- 提交：`dbf9a7d`（Phase 1 图片策略）
- 验证：35/35 测试全绿，typecheck 0，SSR/SEO 回归通过
