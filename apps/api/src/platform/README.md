# 模块装配协议（Platform Module Assembly Protocol）

平台基座通过**独立注册描述文件（manifest）**装配业务模块，
业务 Agent **禁止直接编辑 `app.module.ts`**（避免并发竞争）。

## 目录结构

```text
apps/api/src/
├── app.module.ts              # 平台核心（Config/Logger/Mongo/Redis/Health/Platform）+ 业务模块（registry 解析）
├── platform/
│   ├── module-manifest.ts     # ModuleManifest 类型（id/module/enabledWhen/dependsOn/healthContributor）
│   ├── module-registry.ts     # ModuleRegistry：注册 + 校验（重复 ID/循环/缺失依赖）+ 拓扑排序
│   ├── business-manifests.ts  # ★ 业务模块汇总（唯一共享编辑接入点，当前为空数组）
│   └── platform.module.ts     # @Global 暴露 ModuleRegistry provider
└── modules/<name>/            # 业务模块（各自维护）
    └── manifest.ts            # ★ 业务 Agent 新增的 manifest 文件
```

## 业务模块接入步骤（后续 Agent 遵循）

1. 在自己的模块目录创建 `src/modules/<name>/manifest.ts`：

```ts
import { ChatModule } from './chat.module.js';
import type { ModuleManifest } from '../../platform/module-manifest.js';

export const chatManifest: ModuleManifest = {
  id: 'chat',
  module: ChatModule,
  enabledWhen: true, // 可选：false 禁用；函数按 { nodeEnv } 求值
  dependsOn: ['agents'], // 可选：依赖模块 ID（先装配依赖）
  healthContributor: {
    // 可选：就绪检查（进 /api/ready，带超时）
    id: 'chat',
    check: async () => ({ id: 'chat', status: 'up', durationMs: 0 }),
  },
};
```

2. 在 `platform/business-manifests.ts` 追加 import + 元素：

```ts
import { chatManifest } from '../modules/chat/manifest.js';
export const businessManifests: ModuleManifest[] = [chatManifest];
```

3. 完成。平台启动时自动：校验（重复 ID / 循环依赖 / 缺失依赖 / 依赖被禁用）
   → 过滤禁用模块 → 拓扑排序 → 装配。校验失败抛错并 fail-fast。

## 规则

- **不直接编辑 app.module.ts**；业务模块接入的唯一共享文件是 `business-manifests.ts`
- manifest 声明的模块必须可编译、DI 完整；DI 错误会导致整个 API 启动失败
- 平台不 import 任何业务模块；`businessManifests` 为空时平台独立可测
- 健康贡献者必须快速返回，平台叠加 `HEALTH_CHECK_TIMEOUT_MS` 超时保护
