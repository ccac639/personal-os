/**
 * 路由方向判定与预取。
 *
 * 方向规则：
 * - 同一 path 仅 query 变化 → 'query'（轻量内容过渡，不播放离场/入场位移）；
 * - 优先按路由 name 的导航顺序表（含子路由小数位）；
 * - 回退到 path 前缀表 + 路径深度（进入更深子页 = 前进）；
 * - 无法判定 → 'unknown'（统一淡入 + 轻微上移）。
 */
import type { RouteLocationNormalized, Router } from 'vue-router';

import type { Direction } from './types';

/** 导航顺序表：name → 顺序。左侧导航靠后的模块顺序更大（前进 = 右到左）。 */
const NAV_ORDER: Record<string, number> = {
  dashboard: 0,
  chat: 1,
  'chat-dialog': 1.0,
  'chat-agents': 1.1,
  'chat-inspiration': 1.2,
  workflows: 2,
  projects: 3,
  'project-inbox': 3.1,
  'project-detail': 3.2,
  achievements: 4,
  admin: 5,
  settings: 6,
};

/** path 前缀兜底表（顺序即优先级，/ 必须最后） */
const PATH_ORDER: ReadonlyArray<readonly [string, number]> = [
  ['/settings', 6],
  ['/admin', 5],
  ['/achievements', 4],
  ['/projects', 3],
  ['/workflows', 2],
  ['/chat', 1],
  ['/', 0],
];

interface Order {
  base: number;
  depth: number;
}

function orderOf(route: RouteLocationNormalized): Order | undefined {
  const name = typeof route.name === 'string' ? route.name : undefined;
  if (name !== undefined && name in NAV_ORDER) {
    return { base: NAV_ORDER[name]!, depth: route.path.split('/').filter(Boolean).length };
  }
  for (const [prefix, base] of PATH_ORDER) {
    const matches =
      route.path === prefix ||
      (prefix !== '/' && route.path.startsWith(`${prefix}/`)) ||
      (prefix === '/' && route.path.startsWith('/'));
    if (matches) {
      return { base, depth: route.path.split('/').filter(Boolean).length };
    }
  }
  return undefined;
}

/** 判定两次导航的过渡方向。 */
export function getDirection(
  from: RouteLocationNormalized,
  to: RouteLocationNormalized,
): Direction {
  if (from.fullPath === to.fullPath) return 'query';
  if (from.path === to.path) return 'query';

  const a = orderOf(from);
  const b = orderOf(to);
  if (a !== undefined && b !== undefined) {
    if (a.base !== b.base) return b.base > a.base ? 'forward' : 'backward';
    if (a.depth !== b.depth) return b.depth > a.depth ? 'forward' : 'backward';
  }
  return 'unknown';
}

/** 首航 / 刷新 / 直接输入 URL：from 是 START_LOCATION（无匹配路由记录）。 */
export function isInitialNavigation(route: RouteLocationNormalized): boolean {
  return route.matched.length === 0;
}

/** 同一路由仅 query 变化（组件重建但走轻量过渡）。 */
export function isQueryOnly(from: RouteLocationNormalized, to: RouteLocationNormalized): boolean {
  return from.path === to.path && from.fullPath !== to.fullPath;
}

/**
 * 按需预取：解析目标路由并触发懒加载组件函数（Vue Router 会缓存 promise，
 * 不会重复请求；预取失败静默忽略）。
 */
export function prefetchRoute(router: Router, target: string): void {
  try {
    const resolved = router.resolve(target);
    const record = resolved.matched.at(-1);
    const component = record?.components?.default;
    // 懒加载组件为函数（Lazy<RouteComponent>）；类组件/普通组件无预取必要
    if (typeof component === 'function') {
      void (component as () => unknown)();
    }
  } catch {
    /* 预取失败不影响导航 */
  }
}
