import { BadRequestException, ValidationPipe } from '@nestjs/common';

/**
 * 全局 DTO 校验管道：
 * - transform / whitelist / forbidNonWhitelisted
 * - 校验失败 → 400 + 字段级错误（{ field, errors }），code=VALIDATION_ERROR
 */
export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: '请求参数校验失败',
        fields: errors.map((error) => ({
          field: error.property,
          errors: Object.values(error.constraints ?? {}),
        })),
      }),
  });
}
