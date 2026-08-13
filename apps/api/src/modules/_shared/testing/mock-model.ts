import { Error as MongooseError, Types } from 'mongoose';

/**
 * 测试用内存 Mock Model（不依赖真实 MongoDB）。
 *
 * 支持 service 用到的查询形态：
 *   find/findById/findOne/findOneAndUpdate/create/deleteOne/deleteMany/updateMany/countDocuments
 *   + 链式 sort/skip/limit/select/session/exec
 * 筛选运算符：$or / $in / $nin / $ne / $gt / $gte / $lt / $lte / $regex / $exists / $all / $elemMatch
 * 更新运算符：$set / $pull（含 $in）/ $push / $addToSet / $inc
 *
 * exec 返回的对象附带 toJSON()，输出 { id, ...fields, createdAt, updatedAt }，
 * 与真实 schema 的 toJSON transform 保持一致（_id → id）。
 */

type Filter = Record<string, unknown>;
type Update = Record<string, unknown>;

function eq(a: unknown, b: unknown): boolean {
  if (a === undefined || a === null || b === undefined || b === null) {
    return (a ?? null) === (b ?? null);
  }
  if (b instanceof RegExp) {
    return b.test(String(a));
  }
  if (a instanceof RegExp) {
    return a.test(String(b));
  }
  if (typeof a === 'object' || typeof b === 'object') return String(a) === String(b);
  return a === b;
}

const OBJECT_ID_PATTERN = /^[0-9a-fA-F]{24}$/;

/** 模拟 mongoose 的 _id cast：非法 ObjectId 抛 CastError（由 mapMongoError 映射为 400） */
function assertValidObjectId(value: unknown): void {
  if (value instanceof Types.ObjectId) return;
  if (typeof value === 'string' && OBJECT_ID_PATTERN.test(value)) return;
  if (Array.isArray(value)) {
    for (const v of value) assertValidObjectId(v);
    return;
  }
  if (value !== null && typeof value === 'object' && '$in' in value) {
    for (const v of (value as { $in: unknown[] }).$in) assertValidObjectId(v);
    return;
  }
  throw new MongooseError.CastError('ObjectId', String(value), '_id');
}

/** 对 filter 中的 _id 字段做 ObjectId 校验（与真实 mongoose 行为一致） */
function assertFilterObjectIds(filter?: Filter): void {
  if (filter && filter._id !== undefined) assertValidObjectId(filter._id);
}

function matchOperator(value: unknown, op: string, expected: unknown): boolean {
  switch (op) {
    case '$eq':
      return eq(value, expected);
    case '$in':
      return Array.isArray(expected) && expected.some((e) => eq(value, e));
    case '$nin':
      return !(Array.isArray(expected) && expected.some((e) => eq(value, e)));
    case '$ne':
      return !eq(value, expected);
    case '$gt':
      return value != null && (value as number | Date) > (expected as number | Date);
    case '$gte':
      return value != null && (value as number | Date) >= (expected as number | Date);
    case '$lt':
      return value != null && (value as number | Date) < (expected as number | Date);
    case '$lte':
      return value != null && (value as number | Date) <= (expected as number | Date);
    case '$regex': {
      const rx = expected instanceof RegExp ? expected : new RegExp(String(expected), 'i');
      if (Array.isArray(value)) return value.some((v) => rx.test(String(v)));
      return rx.test(String(value ?? ''));
    }
    case '$exists':
      return expected ? value !== undefined : value === undefined;
    case '$all':
      return (
        Array.isArray(value) &&
        Array.isArray(expected) &&
        expected.every((e) => value.some((v) => eq(v, e)))
      );
    case '$elemMatch':
      return (
        Array.isArray(value) && value.some((item) => matches(item as Filter, expected as Filter))
      );
    default:
      throw new Error(`Unsupported mock operator: ${op}`);
  }
}

function getByPath(doc: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Record<string, unknown>)[part];
  }, doc);
}

export function matches(doc: Record<string, unknown>, filter?: Filter): boolean {
  if (!filter) return true;
  if (Array.isArray(filter.$or)) {
    return filter.$or.some((sub) => matches(doc, sub as Filter));
  }
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') return true;
    const value = key.includes('.') ? getByPath(doc, key) : doc[key];
    const isOperatorBag =
      cond !== null &&
      typeof cond === 'object' &&
      !(cond instanceof Date) &&
      !(cond instanceof RegExp) &&
      !(cond instanceof Types.ObjectId) &&
      !Array.isArray(cond) &&
      Object.keys(cond as Record<string, unknown>).every((k) => k.startsWith('$'));
    if (isOperatorBag) {
      return Object.entries(cond as Record<string, unknown>).every(([op, expected]) =>
        matchOperator(value, op, expected),
      );
    }
    if (Array.isArray(cond)) {
      // 数组字段包含匹配（如 tags 包含某个标签）
      return Array.isArray(value) && (cond as unknown[]).some((c) => value.some((v) => eq(v, c)));
    }
    if (Array.isArray(value) && !Array.isArray(cond)) {
      // 标量条件匹配数组字段的任一元素（如 { dependencies: id }）
      return value.some((v) => eq(v, cond));
    }
    return eq(value, cond);
  });
}

/** 支持 mongoose 的 $[] 通配符与普通点路径（如 items.$[].taskId） */
function setDottedPath(doc: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  const wildcardIndex = parts.indexOf('$[]');
  if (wildcardIndex === -1) {
    let cur: unknown = doc;
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      cur = (cur as Record<string, unknown> | null | undefined)?.[part];
      if (cur === null || cur === undefined) return;
    }
    if (cur !== null && cur !== undefined) {
      (cur as Record<string, unknown>)[parts[parts.length - 1]!] = value;
    }
    return;
  }
  const arrayKey = parts[wildcardIndex - 1]!;
  const prefixParts = parts.slice(0, wildcardIndex - 1);
  const suffixParts = parts.slice(wildcardIndex + 1);
  let cur: unknown = doc;
  for (const part of prefixParts) {
    cur = (cur as Record<string, unknown> | null | undefined)?.[part];
    if (cur === null || cur === undefined) return;
  }
  const arr = (cur as Record<string, unknown> | null | undefined)?.[arrayKey];
  if (!Array.isArray(arr)) return;
  for (const item of arr) {
    let target: unknown = item;
    for (let i = 0; i < suffixParts.length - 1; i++) {
      target = (target as Record<string, unknown> | null | undefined)?.[suffixParts[i]!];
      if (target === null || target === undefined) break;
    }
    if (suffixParts.length > 0 && target !== null && target !== undefined) {
      (target as Record<string, unknown>)[suffixParts[suffixParts.length - 1]!] = value;
    }
  }
}

function applyUpdate(doc: Record<string, unknown>, update: Update): void {
  for (const [op, payload] of Object.entries(update)) {
    switch (op) {
      case '$set':
        for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
          if (key.includes('.')) {
            setDottedPath(doc, key, value);
          } else {
            doc[key] = value;
          }
        }
        break;
      case '$pull': {
        for (const [key, cond] of Object.entries(payload as Record<string, unknown>)) {
          const arr = doc[key];
          if (!Array.isArray(arr)) continue;
          const isOperatorBag =
            cond !== null &&
            typeof cond === 'object' &&
            !(cond instanceof Types.ObjectId) &&
            !(cond instanceof Date) &&
            !Array.isArray(cond) &&
            Object.keys(cond as Record<string, unknown>).every((k) => k.startsWith('$'));
          if (isOperatorBag) {
            const inner = cond as Record<string, unknown>;
            if ('$in' in inner) {
              const targets = inner.$in as unknown[];
              doc[key] = arr.filter((item) => !targets.some((t) => eq(item, t)));
            } else {
              doc[key] = arr.filter((item) => !matches({ [key]: item }, { [key]: cond }));
            }
          } else {
            doc[key] = arr.filter((item) => !eq(item, cond));
          }
        }
        break;
      }
      case '$push': {
        for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
          if (!Array.isArray(doc[key])) doc[key] = [];
          (doc[key] as unknown[]).push(value);
        }
        break;
      }
      case '$addToSet': {
        for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
          if (!Array.isArray(doc[key])) doc[key] = [];
          if (!(doc[key] as unknown[]).some((item) => eq(item, value)))
            (doc[key] as unknown[]).push(value);
        }
        break;
      }
      case '$inc': {
        for (const [key, value] of Object.entries(payload as Record<string, number>)) {
          doc[key] = ((doc[key] as number) ?? 0) + value;
        }
        break;
      }
      default:
        throw new Error(`Unsupported mock update operator: ${op}`);
    }
  }
  doc.updatedAt = new Date();
}

function serialize(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => serialize(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = serialize(v);
    return out;
  }
  return value;
}

function toJson(doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc)) {
    if (key === '_id') continue;
    out[key] = serialize(value);
  }
  out.id = String(doc._id);
  if (out.createdAt === undefined) out.createdAt = new Date().toISOString();
  if (out.updatedAt === undefined) out.updatedAt = new Date().toISOString();
  return out;
}

function attachToJson<T extends Record<string, unknown>>(obj: T): T {
  Object.defineProperty(obj, 'toJSON', {
    value: () => toJson(obj),
    enumerable: false,
    configurable: true,
  });
  return obj;
}

function compareValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1; // null/undefined 排最后
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  return String(a).localeCompare(String(b));
}

export interface MockModelClass {
  collection: Record<string, unknown>[];
  new (doc?: Record<string, unknown>): unknown;
  find(filter?: Filter): MockQuery;
  findById(id: unknown): MockQuery;
  findOne(filter?: Filter): MockQuery;
  create(
    ...docs: Record<string, unknown>[]
  ): Promise<Record<string, unknown> | Record<string, unknown>[]>;
  deleteOne(filter?: Filter): MockQuery;
  deleteMany(filter?: Filter): MockQuery;
  updateMany(filter?: Filter, update?: Update): MockQuery;
  findOneAndUpdate(filter?: Filter, update?: Update, options?: Record<string, unknown>): MockQuery;
  countDocuments(filter?: Filter): MockQuery;
  init(): Promise<void>;
  reset(...docs: Record<string, unknown>[]): void;
}

export interface MockQuery {
  sort(sort: Record<string, 1 | -1 | 'asc' | 'desc'>): MockQuery;
  skip(n: number): MockQuery;
  limit(n: number): MockQuery;
  select(fields: string): MockQuery;
  session(s: unknown): MockQuery;
  exec(): Promise<unknown>;
}

function buildSort(
  docs: Record<string, unknown>[],
  sort?: Record<string, 1 | -1 | 'asc' | 'desc'>,
): void {
  if (!sort) return;
  const entries = Object.entries(sort);
  docs.sort((a, b) => {
    for (const [key, dir] of entries) {
      const cmp = compareValues(a[key], b[key]);
      if (cmp !== 0) return dir === -1 || dir === 'desc' ? -cmp : cmp;
    }
    return 0;
  });
}

function applySelect(doc: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f === '_id') out._id = doc._id;
    else if (f in doc) out[f] = doc[f];
  }
  return out;
}

export function createMockModel(initial: Record<string, unknown>[] = []): MockModelClass {
  const collection: Record<string, unknown>[] = [...initial];

  class MockModel {
    static collection = collection;

    _id: unknown;

    constructor(doc: Record<string, unknown> = {}) {
      this._id = doc._id ?? new Types.ObjectId();
      Object.assign(this, doc);
    }

    static find(filter?: Filter): MockQuery {
      return queryBuilder(
        this,
        () => {
          const docs = collection.filter((doc) => matches(doc, filter)).map((doc) => ({ ...doc }));
          return docs.map(attachToJson);
        },
        filter,
      );
    }

    static findById(id: unknown): MockQuery {
      return MockModel.findOne({ _id: id });
    }

    static findOne(filter?: Filter): MockQuery {
      return queryBuilder(
        this,
        () => {
          const doc = collection.find((d) => matches(d, filter));
          return doc ? attachToJson({ ...doc }) : null;
        },
        filter,
      );
    }

    static async create(
      ...docs: Record<string, unknown>[]
    ): Promise<Record<string, unknown> | Record<string, unknown>[]> {
      // 兼容两种调用：create(doc) 返回单文档；create([doc1, doc2]) 返回数组
      const multi = docs.length === 1 && Array.isArray(docs[0]);
      const arr: Record<string, unknown>[] = multi
        ? (docs[0] as unknown as Record<string, unknown>[])
        : docs;
      const created = arr.map((raw) => {
        const doc: Record<string, unknown> = { _id: new Types.ObjectId(), ...raw };
        const now = new Date();
        doc.createdAt = now;
        doc.updatedAt = now;
        collection.push(doc);
        return attachToJson({ ...doc });
      });
      return multi ? created : created[0]!;
    }

    static deleteOne(filter?: Filter): MockQuery {
      return queryBuilder(
        this,
        () => {
          const idx = collection.findIndex((doc) => matches(doc, filter));
          if (idx >= 0) {
            collection.splice(idx, 1);
            return { deletedCount: 1 };
          }
          return { deletedCount: 0 };
        },
        filter,
      );
    }

    static deleteMany(filter?: Filter): MockQuery {
      return queryBuilder(
        this,
        () => {
          const kept = collection.filter((doc) => !matches(doc, filter));
          const deleted = collection.length - kept.length;
          collection.splice(0, collection.length, ...kept);
          return { deletedCount: deleted };
        },
        filter,
      );
    }

    static updateMany(filter?: Filter, update: Update = {}): MockQuery {
      return queryBuilder(
        this,
        () => {
          let matched = 0;
          for (const doc of collection) {
            if (matches(doc, filter)) {
              matched += 1;
              applyUpdate(doc, update);
            }
          }
          return { matchedCount: matched, modifiedCount: matched };
        },
        filter,
      );
    }

    static findOneAndUpdate(
      filter?: Filter,
      update: Update = {},
      options: Record<string, unknown> = {},
    ): MockQuery {
      return queryBuilder(
        this,
        () => {
          const idx = collection.findIndex((doc) => matches(doc, filter));
          if (idx < 0) {
            if (options.upsert) {
              const doc: Record<string, unknown> = { _id: new Types.ObjectId(), ...(filter ?? {}) };
              const now = new Date();
              doc.createdAt = now;
              doc.updatedAt = now;
              applyUpdate(doc, update);
              collection.push(doc);
              return attachToJson({ ...doc });
            }
            return null;
          }
          const existing = collection[idx]!;
          const before = { ...existing };
          applyUpdate(existing, update);
          const after = { ...existing };
          return options.new ? attachToJson(after) : attachToJson(before);
        },
        filter,
      );
    }

    static countDocuments(filter?: Filter): MockQuery {
      return queryBuilder(
        this,
        () => collection.filter((doc) => matches(doc, filter)).length,
        filter,
      );
    }

    static async init(): Promise<void> {
      // 集合已存在于内存中，无需额外操作
    }

    static reset(...docs: Record<string, unknown>[]): void {
      collection.splice(0, collection.length, ...docs);
    }
  }

  function queryBuilder(model: MockModelClass, compute: () => unknown, filter?: Filter): MockQuery {
    let sort: Record<string, 1 | -1 | 'asc' | 'desc'> | undefined;
    let skip = 0;
    let limit: number | undefined;
    let select: string | undefined;
    let usedSession: unknown;

    return {
      sort(s: Record<string, 1 | -1 | 'asc' | 'desc'>): MockQuery {
        sort = s;
        return this;
      },
      skip(n: number): MockQuery {
        skip = n;
        return this;
      },
      limit(n: number): MockQuery {
        limit = n;
        return this;
      },
      select(fields: string): MockQuery {
        select = fields;
        return this;
      },
      session(s: unknown): MockQuery {
        usedSession = s;
        return this;
      },
      async exec(): Promise<unknown> {
        void model;
        void usedSession;
        assertFilterObjectIds(filter);
        let result = compute();
        if (Array.isArray(result)) {
          buildSort(result as Record<string, unknown>[], sort);
          if (select) {
            const fields = select.split(/\s+/).filter(Boolean);
            result = (result as Record<string, unknown>[]).map((doc) =>
              attachToJson(applySelect(doc, fields)),
            );
          }
          if (skip > 0 || limit !== undefined) {
            result = (result as Record<string, unknown>[]).slice(
              skip,
              limit !== undefined ? skip + limit : undefined,
            );
          }
        }
        return result;
      },
    };
  }

  return MockModel as unknown as MockModelClass;
}

/** standalone（不支持事务）连接 mock：走补偿路径 */
export const standaloneMockConnection = {
  readyState: 1,
  client: { topology: { description: { type: 'Standalone' } } },
  transaction: async (fn: (session?: unknown) => Promise<unknown>): Promise<unknown> =>
    fn(undefined),
  close: async (): Promise<void> => {},
};

/** replica set（支持事务）连接 mock：验证真实事务路径 */
export const replicaSetMockConnection = {
  readyState: 1,
  client: { topology: { description: { type: 'ReplicaSetWithPrimary' } } },
  transaction: async (fn: (session?: unknown) => Promise<unknown>): Promise<unknown> =>
    fn({ isMockSession: true }),
  close: async (): Promise<void> => {},
};
