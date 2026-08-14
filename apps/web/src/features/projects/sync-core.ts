/**
 * 同步引擎核心 —— 集合级 diff 同步（项目 / 里程碑 / 任务 / 专注记录共用）
 *
 * 职责边界：
 * - 以「服务端为事实源、localStorage 为离线缓存」；启动时 hydrate 服务端数据；
 * - 深监听业务 store 的集合 ref，防抖 diff 出 create / update / delete 操作；
 * - 乐观更新语义：本地先生效（store 业务方法同步变更），推送失败时：
 *   - 网络错误 → 保留本地变更进入待同步队列（dirty），状态 offline，可重试；
 *   - 服务端拒绝（4xx/5xx）→ 回滚该实体到上次已同步快照，状态 error / conflict；
 * - 引用完整性：resolveRefs 把本地 id 翻译为服务端 id；引用未就绪的操作延迟重试，
 *   整轮无进展时置 error 并保留队列；
 * - 防竞态：操作序号 seq 递增，过期 hydrate 结果直接丢弃；处理中重复 flush 合并；
 * - 快照与待同步队列持久化到 localStorage（跨会话的离线删除 / 修改不会丢失）。
 */
import { watch, type Ref } from 'vue';

import { readEnvelope, writeEnvelope } from './persistence';

// ── 同步状态 ──

export type SyncStatus = 'idle' | 'loading' | 'saving' | 'offline' | 'error' | 'conflict';
export type SyncSource = 'server' | 'local';

export interface SyncState {
  /** 当前同步状态（UI 横幅展示） */
  status: SyncStatus;
  /** 当前数据来源：server=服务端已接管；local=仅本地（后端不可用） */
  source: SyncSource;
  /** 最近一次成功同步时间（ISO） */
  lastSyncedAt: string | null;
  /** 最近一次错误信息（可展示） */
  lastError: string | null;
  /** 待同步操作数（离线 / 引用未就绪） */
  dirty: number;
  /** 是否正在与后端交互 */
  busy: boolean;
  /** 状态版本号：每次变化 +1，UI 用 computed 订阅 */
  version: number;
}

export function createSyncState(): SyncState {
  return {
    status: 'idle',
    source: 'local',
    lastSyncedAt: null,
    lastError: null,
    dirty: 0,
    busy: false,
    version: 0,
  };
}

export function bumpSyncState(state: SyncState, patch: Partial<Omit<SyncState, 'version'>>): void {
  Object.assign(state, patch, { version: state.version + 1 });
}

/** 多个引擎状态合并（UI 横幅用）：取最严重状态，dirty 求和 */
export function mergeSyncStates(states: SyncState[]): SyncState {
  const rank: Record<SyncStatus, number> = {
    idle: 0,
    loading: 1,
    saving: 2,
    offline: 3,
    conflict: 4,
    error: 5,
  };
  let worst: SyncState = states[0] ?? createSyncState();
  for (const s of states) {
    if (rank[s.status] > rank[worst.status]) worst = s;
  }
  const merged: SyncState = {
    status: worst.status,
    source: states.some((s) => s.source === 'server') ? 'server' : 'local',
    lastSyncedAt: states.reduce<string | null>((acc, s) => {
      if (!s.lastSyncedAt) return acc;
      return !acc || s.lastSyncedAt > acc ? s.lastSyncedAt : acc;
    }, null),
    lastError: states.find((s) => s.lastError)?.lastError ?? null,
    dirty: states.reduce((sum, s) => sum + s.dirty, 0),
    busy: states.some((s) => s.busy),
    version: states.reduce((sum, s) => sum + s.version, 0),
  };
  return merged;
}

// ── 工具 ──

export function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** 深克隆（模型均为纯 JSON 数据，用 JSON 序列化规避 Vue reactive 代理） */
export function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 深度相等（对象 / 数组 / 原始值） */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as Record<string, unknown>);
    const kb = Object.keys(b as Record<string, unknown>);
    if (ka.length !== kb.length) return false;
    return ka.every((k) =>
      deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
  return false;
}

/** 网络 / 离线错误判定：无 HTTP 响应且带网络特征；HTTP 错误返回 false */
export function isOfflineError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as {
    name?: string;
    code?: string;
    cause?: unknown;
    response?: unknown;
    message?: string;
  };
  if (err.response) return false;
  if (err.name === 'AbortError') return true;
  if (typeof err.code === 'string') {
    const codes = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ENOTFOUND',
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'EAI_AGAIN',
      'ENETUNREACH',
    ];
    if (codes.includes(err.code)) return true;
  }
  if (err.cause) return isOfflineError(err.cause);
  if (err.name === 'TypeError') return true;
  const msg = String(err.message ?? '');
  return (
    msg.includes('fetch failed') ||
    msg.includes('Failed to fetch') ||
    msg.includes('NetworkError') ||
    msg.includes('network')
  );
}

export function isConflictError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const status =
    (e as { statusCode?: number; status?: number }).statusCode ?? (e as { status?: number }).status;
  return status === 409;
}

export function errorMessage(e: unknown): string {
  if (!e || typeof e !== 'object') return String(e ?? '未知错误');
  const err = e as { data?: unknown; message?: string; statusMessage?: string };
  if (isPlainObject(err.data) && typeof err.data.message === 'string') return err.data.message;
  if (typeof err.message === 'string') return err.message;
  if (typeof err.statusMessage === 'string') return err.statusMessage;
  return '同步失败';
}

// ── 本地 id ↔ 服务端 id 映射（持久化） ──
//
// 前端业务使用本地生成的 id（p-xxx / t-xxx），服务端使用 Mongo ObjectId。
// 映射表让本地引用（projectId / dependsOn / taskIds）保持稳定，无需在同步时改写
// 其他 store 的引用；服务端实体若无映射，则使用确定性本地 id：<prefix>-srv-<serverId>。

export interface LocalIdMap {
  /** 服务端 id → 本地 id（有映射用映射，否则确定性生成） */
  localIdOf(serverId: string, prefix: string): string;
  /** 本地 id → 服务端 id；无映射返回 null（表示尚未创建到服务端） */
  serverIdOf(localId: string): string | null;
  /** 记录创建成功的映射并持久化 */
  register(localId: string, serverId: string): void;
}

interface IdMapEnvelope {
  version: number;
  data: { forward: Record<string, string> };
}

export function createLocalIdMap(storageKey: string): LocalIdMap {
  const envelopeKey = `personal-os.sync.idmap.${storageKey}`;
  let forward: Record<string, string> = {};
  try {
    const raw = localStorage.getItem(envelopeKey);
    if (raw) {
      const parsed = JSON.parse(raw) as IdMapEnvelope;
      if (isPlainObject(parsed.data) && isPlainObject(parsed.data.forward)) {
        forward = parsed.data.forward;
      }
    }
  } catch {
    forward = {};
  }

  function persist(): void {
    try {
      const envelope: IdMapEnvelope = { version: 1, data: { forward } };
      localStorage.setItem(envelopeKey, JSON.stringify(envelope));
    } catch {
      /* 映射持久化失败不阻断同步（仅下次会话需重新导入） */
    }
  }

  return {
    localIdOf(serverId, prefix) {
      const hit = Object.entries(forward).find(([, sid]) => sid === serverId);
      return hit ? hit[0] : `${prefix}-srv-${serverId}`;
    },
    serverIdOf(localId) {
      return forward[localId] ?? null;
    },
    register(localId, serverId) {
      if (forward[localId] === serverId) return;
      forward[localId] = serverId;
      persist();
    },
  };
}

// ── 引擎 ──

/** 后端分页响应契约（projects / tasks / releases 统一，focus 数组端点由调用方适配） */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface SyncApi<PA, RA = PA> {
  list(): Promise<Paginated<RA>>;
  create(payload: PA): Promise<{ id: string }>;
  /** 更新允许仅发送变化字段（PATCH 语义） */
  update(id: string, payload: Partial<PA>): Promise<unknown>;
  remove(id: string): Promise<void>;
}

export interface SyncEngineOptions<T, PA, RA = PA> {
  /** 引擎名（状态提示前缀 / 持久化 key 用） */
  name: string;
  /** 业务 store 的集合 ref（唯一数据源，引擎只替换/回滚该 ref） */
  list: Ref<T[]>;
  idOf(item: T): string;
  api: SyncApi<PA, RA>;
  /** 服务端实体 → 本地模型；返回 null 表示跳过该实体 */
  toLocal(raw: unknown): T | null;
  /** 本地模型 → 服务端 payload */
  toPayload(item: T): PA;
  /** 更新 payload（默认与创建一致）；可仅返回变更字段（PATCH 语义） */
  patchOf?(item: T, prev: T): Partial<PA>;
  /** hydrate 时把本地缓存中的本地专属字段合并回服务端实体 */
  mergeLocalExtras?(cached: T | undefined, hydrated: T): T;
  /** 是否允许删除操作（今日计划等无删除端点时置 false） */
  canRemove?: boolean;
  /** 引用翻译：本地 id → 服务端 id；未就绪返回 { ok: false } 触发延迟重试（item 为本地实体） */
  resolveRefs?(
    payload: PA,
    item: T,
  ): { ok: true; payload: Partial<PA> } | { ok: false; reason: string };
  /** 本地 id → 服务端 id（更新 / 删除时用） */
  serverIdOf?(localId: string): string | null;
  /** 创建成功后登记映射（供跨会话引用翻译） */
  onCreated?(localId: string, serverId: string): void;
  /** 共享同步状态对象 */
  state: SyncState;
  /** 快照 + 待同步队列的持久化 key（缺省不持久化） */
  storageKey?: string;
  debounceMs?: number;
}

type OpKind = 'create' | 'update' | 'delete';

interface Op<T> {
  kind: OpKind;
  id: string;
  item: T;
}

interface PersistedEngineState<T> {
  snapshot: T[];
  queue: Op<T>[];
}

export interface SyncEngine {
  start(): void;
  dispose(): void;
  pause(): void;
  resume(): void;
  hydrate(): Promise<void>;
  /** 立即把当前差异推到服务端（含重试待同步队列） */
  flush(): Promise<void>;
  /** 等待当前处理完成（测试用） */
  idle(): Promise<void>;
  get dirty(): number;
}

export function createSyncEngine<T, PA, RA = PA>(
  options: SyncEngineOptions<T, PA, RA>,
): SyncEngine {
  const { list, idOf, api, toLocal, toPayload, state } = options;
  const debounceMs = options.debounceMs ?? 600;
  const canRemove = options.canRemove ?? true;

  let snapshot = new Map<string, T>();
  let pendingOps: Op<T>[] = [];
  let hydrating = false;
  let paused = false;
  let started = false;
  let processing = false;
  let rerun = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopWatch: (() => void) | null = null;
  let seq = 0;

  // 跨会话恢复：快照 + 待同步队列
  function loadPersisted(): void {
    if (!options.storageKey) return;
    const outcome = readEnvelope<PersistedEngineState<T>>(
      `personal-os.sync.${options.storageKey}`,
      1,
      (raw) => (isPlainObject(raw) ? (raw as unknown as PersistedEngineState<T>) : null),
    );
    if (outcome.status !== 'ok') return;
    snapshot = new Map(outcome.data.snapshot.map((x) => [idOf(x), x]));
    pendingOps = outcome.data.queue.filter((op) => op && typeof op.id === 'string');
  }

  function persistState(): void {
    if (!options.storageKey) return;
    writeEnvelope(`personal-os.sync.${options.storageKey}`, 1, {
      snapshot: [...snapshot.values()],
      queue: pendingOps,
    } satisfies PersistedEngineState<T>);
  }

  function bump(patch: Partial<Omit<SyncState, 'version'>>): void {
    bumpSyncState(state, patch);
  }

  function currentItem(id: string): T | undefined {
    return list.value.find((x) => idOf(x) === id);
  }

  /** 计算当前差异操作（快照 = 上次已同步状态） */
  function computeOps(): Op<T>[] {
    const ops: Op<T>[] = [];
    const seen = new Set<string>();
    for (const item of list.value) {
      const id = idOf(item);
      seen.add(id);
      if (!snapshot.has(id)) ops.push({ kind: 'create', id, item: deepClone(item) });
      else if (!deepEqual(snapshot.get(id), item)) {
        ops.push({ kind: 'update', id, item: deepClone(item) });
      }
    }
    if (canRemove) {
      for (const id of snapshot.keys()) {
        if (!seen.has(id)) ops.push({ kind: 'delete', id, item: deepClone(snapshot.get(id)!) });
      }
    }
    return ops;
  }

  function buildPayload(op: Op<T>): PA | Partial<PA> {
    const item = currentItem(op.id);
    const prev = snapshot.get(op.id);
    if (op.kind === 'update' && options.patchOf && prev)
      return options.patchOf(item ?? op.item, prev);
    return toPayload(item ?? op.item);
  }

  function rollback(op: Op<T>): void {
    if (op.kind === 'create') {
      list.value = list.value.filter((x) => idOf(x) !== op.id);
      return;
    }
    if (op.kind === 'update') {
      const prev = snapshot.get(op.id);
      if (prev) list.value = list.value.map((x) => (idOf(x) === op.id ? deepClone(prev) : x));
      return;
    }
    const prev = snapshot.get(op.id);
    if (prev) list.value = [...list.value, deepClone(prev)];
  }

  /** 处理一轮操作；返回是否产生网络失败（网络失败时剩余操作保留在队列） */
  async function runPass(
    queue: Op<T>[],
  ): Promise<{ executed: number; deferred: number; networkFailed: boolean }> {
    const rest: Op<T>[] = [];
    let executed = 0;
    let deferred = 0;
    let networkFailed = false;
    let rejected = false;

    for (const op of queue) {
      if (networkFailed) {
        rest.push(op);
        continue;
      }
      if (op.kind !== 'delete' && !currentItem(op.id)) {
        // 实体在推送前已被本地删除：创建未同步的直接丢弃；已同步的转为删除
        if (snapshot.has(op.id)) {
          rest.push({ kind: 'delete', id: op.id, item: deepClone(snapshot.get(op.id)!) });
        }
        continue;
      }
      const payload = op.kind === 'delete' ? undefined : buildPayload(op);
      // 推送时的实体快照：服务端状态 = 本次推送的内容（推送期间的新编辑由下次 diff 补推）
      const pushedItem = deepClone(currentItem(op.id) ?? op.item);
      let resolvedPayload: PA | Partial<PA> | undefined = payload;
      if (payload !== undefined && options.resolveRefs) {
        // resolveRefs 只读取引用字段（create 为完整 payload，update 为 patch，两者均含引用字段）
        const r = options.resolveRefs(payload as PA, op.item);
        if (!r.ok) {
          rest.push(op);
          deferred += 1;
          continue;
        }
        // 引用翻译只改写引用字段，其余字段以原 payload 为准合并
        resolvedPayload = { ...payload, ...r.payload };
      }
      try {
        if (op.kind === 'create') {
          // create payload 由 toPayload 保证完整（resolveRefs 只翻译引用，不删字段）
          const created = await api.create(resolvedPayload as PA);
          options.onCreated?.(op.id, created.id);
          snapshot.set(op.id, pushedItem);
        } else if (op.kind === 'update') {
          const serverId = options.serverIdOf?.(op.id) ?? op.id;
          await api.update(serverId, resolvedPayload ?? {});
          snapshot.set(op.id, pushedItem);
        } else {
          const serverId = options.serverIdOf?.(op.id);
          if (serverId) {
            await api.remove(serverId);
            snapshot.delete(op.id);
          } else {
            // 无映射说明服务端本就没有该实体：本地直接确认删除
            snapshot.delete(op.id);
          }
        }
        executed += 1;
      } catch (e) {
        if (isOfflineError(e)) {
          networkFailed = true;
          rest.push(op);
        } else {
          rejected = true;
          rollback(op);
          bump({
            status: isConflictError(e) ? 'conflict' : 'error',
            lastError: errorMessage(e),
          });
          executed += 1;
        }
      }
    }

    pendingOps = networkFailed || deferred > 0 ? rest : [];
    if (networkFailed) {
      bump({
        status: 'offline',
        dirty: pendingOps.length,
        lastError: '无法连接服务端，变更已保留在本地待重试',
      });
    } else if (rejected) {
      bump({ dirty: pendingOps.length });
    } else if (executed > 0) {
      bump({ status: 'idle', dirty: 0, lastSyncedAt: new Date().toISOString(), lastError: null });
    } else if (deferred > 0) {
      // 整轮无进展且全部因引用未就绪：置 error，保留队列等待 retry
      bump({
        status: 'error',
        dirty: pendingOps.length,
        lastError: `存在 ${deferred} 条变更依赖尚未同步的引用，已排队等待重试`,
      });
    }
    persistState();
    return { executed, deferred, networkFailed };
  }

  async function flush(): Promise<void> {
    if (paused || hydrating || !started) return;
    if (processing) {
      rerun = true;
      return;
    }
    processing = true;
    bump({ busy: true });
    try {
      do {
        rerun = false;
        // 待同步队列 + 最新差异合并：同一实体保留队列中的操作（payload 推送时按最新实体重建）
        const merged = new Map<string, Op<T>>();
        for (const op of pendingOps) merged.set(op.id, op);
        for (const op of computeOps()) {
          if (!merged.has(op.id)) merged.set(op.id, op);
        }
        const queue = [...merged.values()];
        if (queue.length === 0) {
          bump({ status: state.status === 'offline' ? 'offline' : 'idle', busy: false });
          return;
        }
        await runPass(queue);
      } while (rerun && pendingOps.length > 0);
      // 处理完成后若队列已空，把 busy 复位（runPass 已更新状态）
      if (pendingOps.length === 0) bump({ busy: false });
    } finally {
      processing = false;
      if (pendingOps.length === 0) bump({ busy: false });
    }
  }

  /** 服务端数据接管本地集合；保留本地专属字段与本地独有实体（待导入） */
  function applyServer(items: T[]): void {
    hydrating = true;
    try {
      const cached = new Map(list.value.map((x) => [idOf(x), x]));
      const storeIds = new Set(cached.keys());
      const snapshotIds = new Set(snapshot.keys());
      const serverIds = new Set(items.map((x) => idOf(x)));
      const merged: T[] = [];

      // 服务端实体：离线期间被删除的（快照有、本地无）不复活，排队删除
      for (const item of items) {
        const id = idOf(item);
        if (snapshotIds.has(id) && !storeIds.has(id)) {
          pendingOps.push({ kind: 'delete', id, item: deepClone(snapshot.get(id)!) });
          continue;
        }
        const withExtras = options.mergeLocalExtras
          ? options.mergeLocalExtras(cached.get(id), item)
          : item;
        merged.push(withExtras);
      }
      // 本地独有实体（离线创建 / 首次迁移）：保留，等待导入
      for (const item of cached.values()) {
        if (!serverIds.has(idOf(item))) merged.push(item);
      }

      list.value = merged;
      snapshot = new Map(merged.map((x) => [idOf(x), deepClone(x)]));
      // 删除操作中的实体不在快照里（已从本地移除）
      for (const op of pendingOps) {
        if (op.kind === 'delete') snapshot.delete(op.id);
      }
      persistState();
    } finally {
      hydrating = false;
    }
  }

  async function hydrate(): Promise<void> {
    if (!started) return;
    const mySeq = ++seq;
    bump({ status: 'loading' });
    try {
      const page = await api.list();
      if (mySeq !== seq) return; // 已被更新的请求取代，丢弃过期结果
      const items = page.items.map((raw) => toLocal(raw)).filter((x): x is T => x !== null);
      if (pendingOps.length > 0) {
        // 本地有待同步变更：不覆盖本地，等队列推送完成后由 retry 对账
        bump({ status: 'idle', source: 'local', busy: false, lastError: null });
        void flush();
        return;
      }
      applyServer(items);
      bump({
        status: 'idle',
        source: 'server',
        lastSyncedAt: new Date().toISOString(),
        lastError: null,
        dirty: pendingOps.length,
        busy: false,
      });
      // 本地独有实体自动导入（首次迁移 / 离线期间的创建）
      if (pendingOps.length > 0) void flush();
    } catch (e) {
      if (mySeq !== seq) return;
      if (isOfflineError(e)) {
        bump({
          status: 'offline',
          source: 'local',
          lastError: '无法连接服务端，当前使用本地数据',
          busy: false,
        });
      } else {
        bump({ status: 'error', source: 'local', lastError: errorMessage(e), busy: false });
      }
    }
  }

  function start(): void {
    if (started) return;
    started = true;
    loadPersisted();
    stopWatch = watch(
      list,
      () => {
        if (hydrating || paused) return;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          void flush();
        }, debounceMs);
      },
      { deep: true },
    );
    void hydrate();
  }

  return {
    start() {
      start();
    },
    dispose() {
      if (timer) clearTimeout(timer);
      stopWatch?.();
      started = false;
      stopWatch = null;
    },
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      if (started) void flush();
    },
    hydrate() {
      return hydrate();
    },
    flush() {
      return flush();
    },
    async idle() {
      while (processing) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
    },
    get dirty() {
      return pendingOps.length;
    },
  };
}
