/**
 * 分页查询 helper：从原始 query（任意来源）解析出安全的分页参数。
 *
 * 规则：
 * - page：正整数，默认 1，上限 maxPage（默认 10000），非法值回退默认
 * - pageSize：正整数，默认 20，上限 maxPageSize（默认 100），非法值回退默认
 * - sortBy：必须命中 allowedSortFields 白名单，否则回退 defaultSortBy（默认 'createdAt'）
 * - sortOrder：仅 'asc' | 'desc'，否则回退 'desc'
 * - 全部 clamp / 回退，不抛错：查询层宽松处理，严格校验交给 PageQueryDto（ValidationPipe）
 */

export interface PaginationOptions {
  defaultPageSize?: number;
  maxPageSize?: number;
  maxPage?: number;
  allowedSortFields?: readonly string[];
  defaultSortBy?: string;
}

export interface NormalizedPagination {
  page: number;
  pageSize: number;
  skip: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 10000;
export const DEFAULT_SORT_BY = 'createdAt';
export const SORT_ORDERS = ['asc', 'desc'] as const;

function toPositiveInt(value: unknown, fallback: number, max: number): number {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const n = Number(value);
    if (Number.isSafeInteger(n) && n >= 1) {
      return Math.min(n, max);
    }
  }
  return fallback;
}

export function parsePagination(
  query: Record<string, unknown> = {},
  options: PaginationOptions = {},
): NormalizedPagination {
  const pageSize = toPositiveInt(
    query.pageSize,
    options.defaultPageSize ?? DEFAULT_PAGE_SIZE,
    options.maxPageSize ?? MAX_PAGE_SIZE,
  );
  const page = toPositiveInt(query.page, 1, options.maxPage ?? MAX_PAGE);

  const rawSortBy = typeof query.sortBy === 'string' ? query.sortBy : undefined;
  const allowed = options.allowedSortFields;
  const sortBy =
    allowed && rawSortBy !== undefined && allowed.includes(rawSortBy)
      ? rawSortBy
      : (options.defaultSortBy ?? DEFAULT_SORT_BY);

  const rawOrder = typeof query.sortOrder === 'string' ? query.sortOrder : undefined;
  const sortOrder: 'asc' | 'desc' =
    rawOrder === 'asc' ? 'asc' : rawOrder === 'desc' ? 'desc' : 'desc';

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    limit: pageSize,
    sortBy,
    sortOrder,
  };
}

/** 由归一化分页结果 + 总数生成分页元信息（供响应组装复用） */
export function buildPaginationMeta(
  normalized: NormalizedPagination,
  total: number,
): { page: number; pageSize: number; total: number; totalPages: number; hasNext: boolean } {
  const totalPages = total === 0 ? 0 : Math.ceil(total / normalized.pageSize);
  return {
    page: normalized.page,
    pageSize: normalized.pageSize,
    total,
    totalPages,
    hasNext: normalized.page < totalPages,
  };
}
