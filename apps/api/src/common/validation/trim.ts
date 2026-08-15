import { Transform } from 'class-transformer';

/**
 * 输入净化：字符串 trim + 移除控制字符。
 *
 * 清除 \u0000-\u0008 \u000b \u000c \u000e-\u001f（保留 \n \r \t 换行类），
 * 含 ANSI 转义 ESC（\u001b）——防日志注入 / 终端注入与脏数据入库。
 * 非字符串原样返回（类型合法性交给 IsString 校验）。
 */
export function sanitizeString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim();
}

/** 单值字符串净化装饰器（配合 IsString / MaxLength 使用）。 */
export function Trimmed(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => sanitizeString(value));
}

/** 字符串数组元素逐个净化装饰器（配合 IsString({ each: true }) 使用）。 */
export function TrimmedEach(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) =>
    Array.isArray(value) ? value.map((v) => sanitizeString(v)) : value,
  );
}
