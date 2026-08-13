/** 转义正则特殊字符，用于用户输入的搜索词（防止 ReDoS / 语法错误） */
export function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 构造大小写不敏感的包含匹配正则 */
export function regexQuery(input: string): RegExp {
  return new RegExp(escapeRegex(input), 'i');
}
