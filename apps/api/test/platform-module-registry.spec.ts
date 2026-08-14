import { describe, expect, it } from 'vitest';

import type { ModuleManifest } from '../src/platform/module-manifest.js';
import { ModuleRegistry } from '../src/platform/module-registry.js';

class ModuleA {}
class ModuleB {}
class ModuleC {}

function manifest(
  id: string,
  module: unknown,
  extra: Partial<ModuleManifest> = {},
): ModuleManifest {
  return { id, module: module as never, ...extra };
}

describe('ModuleRegistry（模块装配协议）', () => {
  it('装配顺序：依赖先于依赖者（确定性拓扑排序）', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { dependsOn: ['b'] }));
    registry.register(manifest('b', ModuleB));
    registry.register(manifest('c', ModuleC, { dependsOn: ['a'] }));
    expect(registry.resolve({ nodeEnv: 'development' }).map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });

  it('无依赖时按注册顺序（稳定）', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('b', ModuleB));
    registry.register(manifest('a', ModuleA));
    expect(registry.resolve({ nodeEnv: 'development' }).map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('重复 ID → 抛错（fail-fast）', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA));
    expect(() => registry.register(manifest('a', ModuleB))).toThrow(/重复注册/);
  });

  it('循环依赖 → 抛错', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { dependsOn: ['b'] }));
    registry.register(manifest('b', ModuleB, { dependsOn: ['c'] }));
    registry.register(manifest('c', ModuleC, { dependsOn: ['a'] }));
    expect(() => registry.resolve({ nodeEnv: 'development' })).toThrow(/循环依赖/);
  });

  it('缺失依赖 → 抛错并列出缺失项', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { dependsOn: ['ghost'] }));
    expect(() => registry.resolve({ nodeEnv: 'development' })).toThrow(/缺失依赖/);
    expect(() => registry.resolve({ nodeEnv: 'development' })).toThrow(/a -> ghost/);
  });

  it('enabledWhen=false → 跳过装配；禁用的模块不参与依赖校验', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { enabledWhen: false, dependsOn: ['ghost'] }));
    registry.register(manifest('b', ModuleB));
    expect(registry.resolve({ nodeEnv: 'development' }).map((m) => m.id)).toEqual(['b']);
  });

  it('enabledWhen 函数：按 nodeEnv 求值', () => {
    const registry = new ModuleRegistry();
    registry.register(
      manifest('dev-only', ModuleA, { enabledWhen: ({ nodeEnv }) => nodeEnv === 'development' }),
    );
    expect(registry.resolve({ nodeEnv: 'development' }).map((m) => m.id)).toEqual(['dev-only']);
    expect(registry.resolve({ nodeEnv: 'production' }).map((m) => m.id)).toEqual([]);
  });

  it('依赖被禁用 → 抛错（明确，不静默）', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { dependsOn: ['b'] }));
    registry.register(manifest('b', ModuleB, { enabledWhen: false }));
    expect(() => registry.resolve({ nodeEnv: 'development' })).toThrow(/依赖被禁用/);
  });

  it('get / has / list 基础能力', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA));
    expect(registry.has('a')).toBe(true);
    expect(registry.has('nope')).toBe(false);
    expect(registry.get('a')?.id).toBe('a');
    expect(registry.list()).toHaveLength(1);
  });

  it('同一注册表重复 resolve 结果一致（无副作用）', () => {
    const registry = new ModuleRegistry();
    registry.register(manifest('a', ModuleA, { dependsOn: ['b'] }));
    registry.register(manifest('b', ModuleB));
    const first = registry.resolve({ nodeEnv: 'test' }).map((m) => m.id);
    const second = registry.resolve({ nodeEnv: 'test' }).map((m) => m.id);
    expect(second).toEqual(first);
  });
});
