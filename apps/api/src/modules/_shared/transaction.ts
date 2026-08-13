import type { ClientSession, Connection } from 'mongoose';

const TRANSACTION_CAPABLE_TYPES = new Set(['ReplicaSetWithPrimary', 'Sharded', 'LoadBalanced']);

/** 事务前需要确保集合存在的 Model（mongoose Model 均满足；init 返回文档类型） */
export interface InitializableModel {
  init(): Promise<unknown>;
}

/**
 * 连接是否具备多文档事务能力。
 * 仅 replica set / sharded / load-balanced 拓扑支持，standalone 不支持。
 */
export function supportsTransactions(conn: Connection): boolean {
  const type = (conn as unknown as { client?: { topology?: { description?: { type?: string } } } })
    .client?.topology?.description?.type;
  return conn.readyState === 1 && type !== undefined && TRANSACTION_CAPABLE_TYPES.has(type);
}

/**
 * 事务/补偿统一入口：
 *
 * 1. 连接支持多文档事务（replica set / sharded）：
 *    - 先确保涉及集合已存在（MongoDB 不允许在事务中隐式创建集合）；
 *    - 在真实事务中执行 fn(session)，失败整体回滚。
 *
 * 2. 否则（standalone / 连接未就绪）走补偿路径：
 *    - 调用方必须保证 fn 内「先清理关联数据、最后删除主文档」的顺序，使操作幂等可重试；
 *    - fn 内任一步失败必须抛出明确异常，禁止静默吞掉导致半完成状态。
 */
export async function withTransaction<T>(
  conn: Connection,
  models: InitializableModel[],
  fn: (session: ClientSession | undefined) => Promise<T>,
): Promise<T> {
  if (supportsTransactions(conn)) {
    await Promise.all(models.map((model) => model.init()));
    return conn.transaction(async (session) => fn(session));
  }
  return fn(undefined);
}
