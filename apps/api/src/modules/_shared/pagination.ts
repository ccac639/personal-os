import { applyDecorators, type Type } from '@nestjs/common';
import { ApiExtraModels, ApiOkResponse, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { Type as TransformType } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> extends PaginationMeta {
  items: T[];
}

export function buildPaginated<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): PaginatedResult<T> {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}

/** 分页查询公共参数（page/pageSize 由 ValidationPipe transform 为数字） */
export class PageQueryDto {
  @ApiProperty({ required: false, description: '页码，从 1 开始', default: 1, minimum: 1 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiProperty({ required: false, description: '每页条数', default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @TransformType(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class PaginatedResponseDto {
  @ApiProperty({ type: 'array', description: '当前页数据' })
  items!: unknown[];

  @ApiProperty({ description: '符合筛选条件的总条数' })
  total!: number;

  @ApiProperty({ description: '当前页码' })
  page!: number;

  @ApiProperty({ description: '每页条数' })
  pageSize!: number;

  @ApiProperty({ description: '总页数' })
  totalPages!: number;
}

/** Swagger：为列表端点声明分页响应（items 为指定类型数组） */
export function ApiPaginatedResponse<T extends Type<unknown>>(
  itemType: T,
): MethodDecorator & ClassDecorator {
  return applyDecorators(
    ApiExtraModels(PaginatedResponseDto, itemType),
    ApiOkResponse({
      description: '分页结果',
      schema: {
        allOf: [
          { $ref: getSchemaPath(PaginatedResponseDto) },
          {
            properties: {
              items: { type: 'array', items: { $ref: getSchemaPath(itemType) } },
            },
          },
        ],
      },
    }),
  );
}
