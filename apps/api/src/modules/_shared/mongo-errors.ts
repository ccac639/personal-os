import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Error as MongooseError } from 'mongoose';

export function isCastError(error: unknown): boolean {
  return (
    error instanceof MongooseError.CastError ||
    (error as { name?: string } | null)?.name === 'CastError'
  );
}

export function isValidationError(error: unknown): boolean {
  return (
    error instanceof MongooseError.ValidationError ||
    (error as { name?: string } | null)?.name === 'ValidationError'
  );
}

export function isDuplicateKeyError(error: unknown): boolean {
  return (error as { code?: number } | null)?.code === 11000;
}

/**
 * 将 Mongoose / MongoDB 底层错误映射为统一 HTTP 异常：
 * - CastError（非法 ObjectId）→ 400
 * - ValidationError（schema 校验失败）→ 400
 * - DuplicateKey（唯一键冲突，11000）→ 409
 * - 其余 → 500
 */
export function mapMongoError(error: unknown, fallbackMessage = '数据库操作失败'): never {
  if (isCastError(error)) {
    throw new BadRequestException('无效的 ObjectId 格式');
  }
  if (isValidationError(error)) {
    throw new BadRequestException(`数据校验失败: ${(error as Error).message}`);
  }
  if (isDuplicateKeyError(error)) {
    throw new ConflictException('唯一键冲突，资源已存在');
  }
  throw new InternalServerErrorException(fallbackMessage);
}

/** 执行数据库操作并把底层错误映射为 HTTP 异常 */
export async function mapMongo<T>(
  fn: () => Promise<T>,
  fallbackMessage = '数据库操作失败',
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    return mapMongoError(error, fallbackMessage);
  }
}
