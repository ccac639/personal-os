import { camelCase, kebabCase } from 'lodash-es';

/** 将任意字符串转为 URL-friendly slug：'Hello World!' -> 'hello-world' */
export function slugify(input: string): string {
  return kebabCase(input).toLowerCase();
}

export { camelCase, kebabCase };
