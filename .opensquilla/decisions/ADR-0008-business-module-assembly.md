# ADR-0008: 业务模块装配与 API 基线恢复

- 状态：Accepted
- 日期：2026-08-15
- 决策人：Orchestrator（业务模块装配分线，Node 后端）

## 背景

API 存在 61 个 typecheck 错误（agents/chat/inspiration/three-d）、21 个测试失败
（装配型 404 + 服务逻辑契约不符）、businessManifests 为空导致全部业务路由 404。
目标：恢复 typecheck 基线、注册业务模块 manifest、恢复业务路由与测试。

## 决策

1. **注册 12 个业务模块**（business-manifests.ts，拓扑由 ModuleRegistry 计算）：
   ai → chat → agents / inspiration → focus → tasks → projects →
   releases / knowledge / data-import / three-d / workflows。
   dependsOn 仅声明真实注册级依赖：chat→ai（BullChatJobQueue 注入
   AiSettingsService）、agents/inspiration→chat、tasks→focus、projects→
   {tasks,focus,releases,knowledge}。auth/users 为占位目录（仅 .gitkeep），
   按单用户约束不注册。
2. **typecheck 修复模式**：
   - 装饰器签名引用的类型（AgentKind/InspirationSource/AssetKind/MessageRole 等）
     一律 `import type`（isolatedModules + emitDecoratorMetadata 约束）。
   - `timestamps: true` 的 schema 类统一补 `createdAt/updatedAt` 类型声明
     （仅类型层，不参与 schema 定义），解决 lean/文档 createdAt 缺失。
   - mongoose `model` 字段与 Document.model() 方法名冲突 → 赋值走 `doc.set()`。
3. **契约修复（实现侧，测试为契约依据）**：
   - 灵感导入判重：携带显式 id → 仅按 id 判重（幂等键）；无 id → 按指纹判重
     （内容级）。原 `$or:[{id},{fingerprint}]` 导致"新 id + 重复内容"被误 skip。
   - 智能体 `startConversation` 返回 `AgentStartResultDto`（{agent,
     conversationId}，与 Controller/Swagger 契约一致）；隐藏智能体拒绝启动。
   - `list` 支持 favorite 过滤（AgentQueryDto 补字段 + filter）。
   - Chat 消息追加在 service 层显式校验长度（fake model 不执行 schema maxlength）。
   - 级联删除契约在 ChatController.deleteConversation 编排（remove +
     removeAll(messages) + removeAll(runs)），service.remove 为单删原语。
4. **测试更新**（均有契约证据，非"以实现为准"）：响应 DTO 不含 ownerId/
   fingerprint（单用户、内部去重字段不暴露）；startConversation 返回解构
   conversationId；列表 total 含 4 个内置模板种子；q 关键字断言数据修正。

## 后果

- 全部 12 个业务模块随 AppModule 装配，业务路由可达（ai-module HTTP 集成
  测试与 platform-health AppModule 集成测试验证 DI smoke）。
- typecheck 0 错误；API 测试 324/324；平台测试 94/94（平台文件零修改）。
- 后续新增模块按 platform/README.md 走 manifest 接入。

## 替代方案

- 级联删除下沉到 ConversationsService（forwardRef 双向依赖）：否决，
  controller 编排已为现有契约，避免循环依赖复杂度。
- 测试断言保留 ownerId/fingerprint：否决，与响应 DTO 契约（单用户设计）
  直接冲突。
