/**
 * 画布布局工具（纯函数，无 Vue 依赖）
 *
 * 对齐 / 分布 / 自动布局。输入轻量节点模型，输出「id → 新位置」列表，
 * 由 store 统一推撤销点并应用，画布侧无需关心算法细节。
 */
import { topoSort } from './topo';
import type { WorkflowEdgeModel, WorkflowNodeModel, XYPosition } from './types';

/** 对齐轴：左 / 水平居中 / 右 / 上 / 垂直居中 / 下 */
export type AlignAxis = 'left' | 'centerH' | 'right' | 'top' | 'centerV' | 'bottom';

/** 分布方向 */
export type DistributeAxis = 'horizontal' | 'vertical';

export interface PositionChange {
  id: string;
  position: XYPosition;
}

/** 节点近似尺寸（对齐/分布按中心计算时的兜底，视觉足够） */
const NODE_W = 240;
const NODE_H = 80;

/** 取节点中心坐标（position 为左上角，按近似尺寸折算） */
function center(n: WorkflowNodeModel): { cx: number; cy: number } {
  return { cx: n.position.x + NODE_W / 2, cy: n.position.y + NODE_H / 2 };
}

/**
 * 对齐选中的节点（≥2 个）：
 * - left/right/top/bottom：对齐到边界极值
 * - centerH：水平居中线（x 对齐到选区中点）
 * - centerV：垂直居中线（y 对齐到选区中点）
 */
export function alignPositions(nodes: WorkflowNodeModel[], axis: AlignAxis): PositionChange[] {
  if (nodes.length < 2) return [];
  const cs = nodes.map(center);
  const minX = Math.min(...cs.map((c) => c.cx));
  const maxX = Math.max(...cs.map((c) => c.cx));
  const minY = Math.min(...cs.map((c) => c.cy));
  const maxY = Math.max(...cs.map((c) => c.cy));
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return nodes.map((n, i) => {
    const { cx, cy } = cs[i]!;
    let x = n.position.x;
    let y = n.position.y;
    switch (axis) {
      case 'left':
        x = minX - NODE_W / 2;
        break;
      case 'right':
        x = maxX - NODE_W / 2;
        break;
      case 'centerH':
        x = midX - NODE_W / 2;
        break;
      case 'top':
        y = minY - NODE_H / 2;
        break;
      case 'bottom':
        y = maxY - NODE_H / 2;
        break;
      case 'centerV':
        y = midY - NODE_H / 2;
        break;
    }
    void cx;
    void cy;
    return { id: n.id, position: { x: Math.round(x), y: Math.round(y) } };
  });
}

/**
 * 分布选中的节点（≥3 个）：沿水平/垂直方向在首尾之间均匀分布。
 * 首尾节点保持原位，中间节点按等间距重排（另一轴不变）。
 */
export function distributePositions(
  nodes: WorkflowNodeModel[],
  axis: DistributeAxis,
): PositionChange[] {
  if (nodes.length < 3) return [];
  const sorted = [...nodes].sort((a, b) =>
    axis === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y,
  );
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span =
    axis === 'horizontal' ? last.position.x - first.position.x : last.position.y - first.position.y;
  const step = span / (sorted.length - 1);

  return sorted.map((n, i) => ({
    id: n.id,
    position:
      axis === 'horizontal'
        ? { x: Math.round(first.position.x + step * i), y: n.position.y }
        : { x: n.position.x, y: Math.round(first.position.y + step * i) },
  }));
}

/**
 * 自动布局：按拓扑深度分列（层次布局）。
 * - 深度 = 从「无入边」源节点出发的最长路径
 * - 同一深度按拓扑顺序纵向排列，形成稳定的左→右流水线
 * - 环内节点放在最后一列兜底，保证不重叠
 */
export function autoLayoutPositions(
  nodes: WorkflowNodeModel[],
  edges: WorkflowEdgeModel[],
): PositionChange[] {
  if (nodes.length === 0) return [];

  const COL_W = 300;
  const ROW_H = 150;
  const START_X = 40;
  const START_Y = 40;

  const nodeIds = new Set(nodes.map((n) => n.id));
  const validEdges = edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

  const { order, cycleIds } = topoSort(nodes, validEdges);
  const depth = new Map<string, number>();
  for (const n of nodes) depth.set(n.id, 0);

  for (const id of order) {
    const d = depth.get(id) ?? 0;
    for (const e of validEdges) {
      if (e.source !== id) continue;
      const td = depth.get(e.target) ?? 0;
      if (d + 1 > td) depth.set(e.target, d + 1);
    }
  }

  const maxDepth = Math.max(0, ...depth.values());
  // 环内节点：追加到最后一列之后
  cycleIds.forEach((id, i) => depth.set(id, maxDepth + 1 + i));

  const columns = new Map<number, string[]>();
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0;
    const col = columns.get(d) ?? [];
    col.push(n.id);
    columns.set(d, col);
  }
  const rowIndex = new Map<string, number>();
  for (const ids of columns.values()) {
    ids.forEach((id, i) => rowIndex.set(id, i));
  }

  return nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    return {
      id: n.id,
      position: {
        x: START_X + d * COL_W,
        y: START_Y + (rowIndex.get(n.id) ?? 0) * ROW_H,
      },
    };
  });
}
