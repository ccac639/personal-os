import { Transform } from 'class-transformer';

/**
 * 将 query 字符串 'true'/'false' 转为 boolean。
 * 注意：class-transformer 的 @Type(() => Boolean) 对 'false' 会得到 Boolean('false') === true，
 * 因此布尔 query 参数必须使用本转换器；非法值原样返回，交由 @IsBoolean 校验拒绝。
 */
export function ToBoolean(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (typeof value === 'boolean') return value;
    return value;
  });
}

/**
 * 将 query 参数归一为数组：`?tags=a&tags=b` → ['a','b']（Fastify 解析为数组）；
 * `?tags=a`（supertest 序列化单元素数组为单值）→ ['a']。
 * 避免单值字符串导致 @IsArray 校验失败。
 */
export function ToArrayQuery(): PropertyDecorator {
  return Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null) return value;
    return Array.isArray(value) ? value : [value];
  });
}
