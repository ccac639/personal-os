import type { ModuleManifest } from './module-manifest.js';

/**
 * 模块注册表（纯逻辑，无 I/O、无 DI）：
 * - register：重复 ID / 重复注册 → 抛错（fail-fast，不静默）
 * - resolve：校验缺失依赖、循环依赖、依赖被禁用，按确定性拓扑顺序返回已启用模块
 *
 * 平台 app.module.ts 只装配核心模块 + 本注册表解析出的业务模块；
 * 业务模块通过独立 manifest 文件接入，避免直接竞争编辑 app.module.ts。
 */
export class ModuleRegistry {
  private readonly manifests = new Map<string, ModuleManifest>();

  register(manifest: ModuleManifest): void {
    if (this.manifests.has(manifest.id)) {
      throw new Error(`模块重复注册：id='${manifest.id}' 已存在`);
    }
    this.manifests.set(manifest.id, manifest);
  }

  has(id: string): boolean {
    return this.manifests.has(id);
  }

  get(id: string): ModuleManifest | undefined {
    return this.manifests.get(id);
  }

  list(): ModuleManifest[] {
    return [...this.manifests.values()];
  }

  /**
   * 解析装配顺序：
   * 1. 校验全部依赖存在（缺失 → 抛错，列出缺失项）
   * 2. 检测循环依赖（DFS → 抛错，列出环路径）
   * 3. 过滤禁用模块；被启用的模块依赖禁用模块 → 抛错
   * 4. Kahn 拓扑排序（稳定：同层按注册顺序）
   */
  resolve(ctx: { nodeEnv: string }): ModuleManifest[] {
    const all = this.list();
    const byId = this.manifests;

    const enabled = new Set<string>();
    for (const manifest of all) {
      const condition = manifest.enabledWhen ?? true;
      const on = typeof condition === 'function' ? condition(ctx) : condition;
      if (on) {
        enabled.add(manifest.id);
      }
    }

    // 缺失依赖 / 依赖被禁用（只校验已启用模块）
    const missing: string[] = [];
    for (const manifest of all) {
      if (!enabled.has(manifest.id)) {
        continue;
      }
      for (const dep of manifest.dependsOn ?? []) {
        if (!byId.has(dep)) {
          missing.push(`${manifest.id} -> ${dep}`);
        } else if (!enabled.has(dep)) {
          throw new Error(`模块依赖被禁用：'${manifest.id}' 依赖 '${dep}'，但 '${dep}' 未启用`);
        }
      }
    }
    if (missing.length > 0) {
      throw new Error(`模块存在缺失依赖：${missing.join(', ')}`);
    }

    // 循环依赖检测（只关心启用集合内的边）
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const stack: string[] = [];

    const visit = (id: string): void => {
      if (visited.has(id)) {
        return;
      }
      if (visiting.has(id)) {
        const cycle = [...stack.slice(stack.indexOf(id)), id].join(' -> ');
        throw new Error(`模块存在循环依赖：${cycle}`);
      }
      visiting.add(id);
      stack.push(id);
      const manifest = byId.get(id);
      for (const dep of manifest?.dependsOn ?? []) {
        if (enabled.has(dep)) {
          visit(dep);
        }
      }
      stack.pop();
      visiting.delete(id);
      visited.add(id);
    };
    for (const id of enabled) {
      visit(id);
    }

    // Kahn 拓扑排序（稳定）
    const indegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();
    for (const id of enabled) {
      indegree.set(id, 0);
      dependents.set(id, []);
    }
    for (const manifest of all) {
      if (!enabled.has(manifest.id)) {
        continue;
      }
      for (const dep of manifest.dependsOn ?? []) {
        if (enabled.has(dep)) {
          indegree.set(manifest.id, (indegree.get(manifest.id) ?? 0) + 1);
          dependents.get(dep)?.push(manifest.id);
        }
      }
    }

    const queue: string[] = [];
    for (const manifest of all) {
      if (enabled.has(manifest.id) && (indegree.get(manifest.id) ?? 0) === 0) {
        queue.push(manifest.id);
      }
    }

    const order: ModuleManifest[] = [];
    while (queue.length > 0) {
      const id = queue.shift() as string;
      const manifest = byId.get(id) as ModuleManifest;
      order.push(manifest);
      for (const dependent of dependents.get(id) ?? []) {
        const next = (indegree.get(dependent) ?? 1) - 1;
        indegree.set(dependent, next);
        if (next === 0) {
          queue.push(dependent);
        }
      }
    }

    if (order.length !== enabled.size) {
      throw new Error('模块装配顺序解析失败：存在未解决的依赖关系');
    }

    return order;
  }
}
