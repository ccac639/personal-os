import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';

import { ERROR_CODES } from '../interfaces/error-codes.js';

/**
 * 严格 Mongo ObjectId 解析 pipe：
 * - 无效 ID → 400 VALIDATION_ERROR（统一错误格式）
 * - 有效 ID → 原样返回（字符串），业务自行转换
 *
 * 用法：`@Param('id', ParseObjectIdPipe) id: string`
 */
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) {
      throw new BadRequestException({
        statusCode: 400,
        code: ERROR_CODES.VALIDATION_ERROR,
        message: '无效的 ObjectId',
      });
    }
    return value;
  }
}
