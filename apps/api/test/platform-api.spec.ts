import 'reflect-metadata';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ERROR_CODES } from '../src/common/interfaces/error-codes.js';
import { buildPaginationMeta, parsePagination } from '../src/common/pagination/pagination.js';
import { PageQueryDto } from '../src/common/pagination/page-query.dto.js';
import { ParseObjectIdPipe } from '../src/common/pipes/parse-object-id.pipe.js';

describe('稳定错误码枚举', () => {
  it('包含全部约定错误码', () => {
    expect(ERROR_CODES).toEqual({
      VALIDATION_ERROR: 'VALIDATION_ERROR',
      UNAUTHORIZED: 'UNAUTHORIZED',
      API_KEY_MISSING: 'API_KEY_MISSING',
      API_KEY_INVALID: 'API_KEY_INVALID',
      FORBIDDEN: 'FORBIDDEN',
      NOT_FOUND: 'NOT_FOUND',
      METHOD_NOT_ALLOWED: 'METHOD_NOT_ALLOWED',
      CONFLICT: 'CONFLICT',
      PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
      UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
      RATE_LIMITED: 'RATE_LIMITED',
      REQUEST_TIMEOUT: 'REQUEST_TIMEOUT',
      DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
      BAD_GATEWAY: 'BAD_GATEWAY',
      GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
      INTERNAL_ERROR: 'INTERNAL_ERROR',
    });
  });
});

describe('parsePagination（分页 query helper）', () => {
  it('空 query → 默认值', () => {
    const p = parsePagination();
    expect(p).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      limit: 20,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    });
  });

  it('合法值解析（skip = (page-1)*pageSize）', () => {
    const p = parsePagination(
      { page: '3', pageSize: '10', sortBy: 'name', sortOrder: 'asc' },
      {
        allowedSortFields: ['name'],
      },
    );
    expect(p).toEqual({
      page: 3,
      pageSize: 10,
      skip: 20,
      limit: 10,
      sortBy: 'name',
      sortOrder: 'asc',
    });
  });

  it('安全范围：page / pageSize 超限被 clamp', () => {
    const p = parsePagination({ page: '999999', pageSize: '999' });
    expect(p.page).toBe(10_000);
    expect(p.pageSize).toBe(100);
    expect(p.skip).toBe((10_000 - 1) * 100);
  });

  it('非法值回退默认（不抛错）', () => {
    const p = parsePagination({
      page: 'abc',
      pageSize: '-5',
      sortBy: 'hack',
      sortOrder: 'sideways',
    });
    expect(p.page).toBe(1);
    expect(p.pageSize).toBe(20);
    expect(p.sortBy).toBe('createdAt');
    expect(p.sortOrder).toBe('desc');
  });

  it('sortBy 不在白名单 → 回退默认排序字段', () => {
    const p = parsePagination({ sortBy: 'evil' }, { allowedSortFields: ['name', 'createdAt'] });
    expect(p.sortBy).toBe('createdAt');
  });

  it('buildPaginationMeta：totalPages / hasNext', () => {
    const meta = buildPaginationMeta(parsePagination({ page: '2', pageSize: '10' }), 25);
    expect(meta).toEqual({ page: 2, pageSize: 10, total: 25, totalPages: 3, hasNext: true });
    const last = buildPaginationMeta(parsePagination({ page: '3', pageSize: '10' }), 25);
    expect(last.hasNext).toBe(false);
    const empty = buildPaginationMeta(parsePagination(), 0);
    expect(empty.totalPages).toBe(0);
    expect(empty.hasNext).toBe(false);
  });
});

describe('PageQueryDto（class-validator 严格校验）', () => {
  it('默认值合法', async () => {
    const dto = new PageQueryDto();
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(20);
    expect(dto.sortOrder).toBe('desc');
  });

  it('非法值 → 校验失败', async () => {
    const dto = new PageQueryDto();
    (dto as { page: number }).page = 0;
    (dto as { pageSize: number }).pageSize = 99_999;
    (dto as { sortOrder: string }).sortOrder = 'up';
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThanOrEqual(3);
    const fields = errors.map((e) => e.property);
    expect(fields).toContain('page');
    expect(fields).toContain('pageSize');
    expect(fields).toContain('sortOrder');
  });
});

describe('ParseObjectIdPipe（严格 ObjectId 解析）', () => {
  it('有效 ObjectId → 透传', () => {
    const pipe = new ParseObjectIdPipe();
    const id = '507f1f77bcf86cd799439011';
    expect(pipe.transform(id)).toBe(id);
  });

  it('无效 ObjectId → 400 VALIDATION_ERROR（统一错误格式）', () => {
    const pipe = new ParseObjectIdPipe();
    let caught: { response?: { statusCode?: number; code?: string } } | undefined;
    try {
      pipe.transform('not-an-id');
    } catch (error) {
      caught = error as { response?: { statusCode?: number; code?: string } };
    }
    expect(caught?.response?.statusCode).toBe(400);
    expect(caught?.response?.code).toBe(ERROR_CODES.VALIDATION_ERROR);
  });
});
