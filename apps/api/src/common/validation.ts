import { BadRequestException, ValidationPipe } from '@nestjs/common';

/**
 * 全局 DTO 校验管道：
 * - transform / whitelist / forbidNonWhitelisted
 * - 校验失败 → 400 + 字段级错误（{ field, errors }），code=VALIDATION_ERROR
 * - production：隐藏字段级校验细节（防探测），但 code/message 契约保持不变
 *
 * 注：不使用 ValidationPipe 的 disableErrorMessages —— 该选项会绕过 exceptionFactory
 * 直接抛裸 BadRequestException，导致 code 退化为 BAD_REQUEST、破坏平台错误信封契约。
 */
export function createValidationPipe(): ValidationPipe {
  const isProduction = process.env.NODE_ENV === 'production';
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
        ...(isProduction
          ? {}
          : {
              fields: errors.map((error) => ({
                field: error.property,
                errors: Object.values(error.constraints ?? {}),
              })),
            }),
      }),
  });
}
