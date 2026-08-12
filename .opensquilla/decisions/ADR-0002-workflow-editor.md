# ADR-0002：工作流编排页实现方案（@vue-flow + 轻量 Store 模型）

- 状态：已接受
- 日期：2026-08-12
- 关联：BACKLOG「P2 Workflows 编排页」、ADR-0001

## 背景

「工作流」导航页此前为占位符。依赖 `@vue-flow/core` 1.48.2 及其
background/controls/minimap 扩展已预装，需要落地一个可用的编排页：
节点画布、节点库、属性面板、持久化、导入导出与运行演示。

同时发现两个工程级问题：

1. **vue-tsc 对 Vue Flow `Node` 泛型报错**：项目同时安装 `motion`（13.x）与
   `motion-v`（2.x），二者都通过 module augmentation 增强了 `vue` 的
   `HTMLAttributes`（`animate`/`dragControls` 等）。Vue Flow 的 `Node` 类型
   内含 `domAttributes?: Omit<HTMLAttributes, …>`，在该环境下类型解析自相矛盾——
   同一个 `Node` 类型对自身赋值/比较都会失败（`dragControls` 在两个位置解析出
   不同形状），且实例化泛型会触发 TS2589 深层实例化。
2. **Vue Flow 受控模式**：`:nodes` 为受控 prop，Vue Flow 内部持有节点副本；
   原地深改 `node.data` 不会驱动自定义节点重渲染，必须换新数组/新对象。

## 决策

1. **Store 与 Vue Flow 类型解耦**：`stores/workflow.ts` 内部使用自研轻量模型
   `WorkflowNodeModel / WorkflowEdgeModel`（`features/workflows/types.ts`，
   带索引签名 `[key: string]: unknown` 兼容运行时附加字段），
   画布组件在边界用 `as unknown as Node[]` 转换，规避类型增强冲突。
2. **画布受控 + 变更回写**：不使用 `v-model:nodes`，改用
   `:nodes` + `@nodes-change` → `applyNodeChanges(changes, …)` 回写 Store，
   删除键（Backspace/Delete）、拖拽、选中均走 Vue Flow 原生 change 事件。
3. **状态驱动重渲染**：模拟运行（BFS 拓扑序逐节点点亮）时每次状态变更生成
   新节点数组（`nodes.value = nodes.value.map(…)`），确保 Vue Flow 收到新
   引用并重渲染；连线高亮用 edge.class（`wf-edge-active`）+ CSS 动画。
4. **持久化**：localStorage 防抖自动保存（600ms，运行期间跳过）；
   序列化剥离 `status`/`selected`；恢复时按类型合并默认字段。
5. **主题一致性**：画布/节点/控件/缩略图全部使用 `--color-surface-*` 等主题
   变量，点阵背景色随 `theme.palette.dark` 切换，跟随全局换肤。
6. **测试**：Store 逻辑单测（vitest + jsdom）覆盖添加/连线/删除/序列化/
   导入/执行顺序；存量 `default-layout.spec.ts` 因 PagePet 引入 Pinia 依赖、
   主题重构替换 `text-black` 而失败，已同步修复。

## 后果

- 画布层存在少量 `as unknown as` 边界转换（集中在 workflow-canvas.vue），
  换取 Store 层完全可测、类型干净。
- 运行演示为前端模拟（420ms/节点），真实执行需后续接 worker 的 AI Task Job，
  接口已按 `simulateRun` 单点预留。
- 条件节点双出口：右侧 `true` 锚点 + 底部 `false` 锚点，连线携带 sourceHandle。

## 替代方案

- **直接使用 `Node<WorkflowNodeData, any, 'custom'>` 类型**：触发 TS2589 /
  自反赋值失败，否决。
- **`v-model:nodes` 双向绑定**：同样受 Node 类型自反失败影响，且深改不生效，
  否决。
- **移除 motion 或 motion-v 之一**：二者分别服务不同组件（motion-v 用于导航
  动画、motion 用于其他），改动面大且非本次范围，记录为后续技术债候选。
