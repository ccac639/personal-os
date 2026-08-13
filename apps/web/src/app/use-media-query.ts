/**
 * 壳层媒体查询组合式函数（响应式 + 无障碍共用）。
 *
 * - jsdom / 不支持 matchMedia 的环境返回 defaultValue，不抛错；
 * - 监听器随组件卸载移除，不遗留；
 * - 用法：
 *   const isDesktop = useMediaQuery('(min-width: 768px)', { defaultValue: true });
 *   const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
 */
import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue';

export interface MediaQueryOptions {
  /** 环境不支持 matchMedia（如 jsdom / 旧环境）时使用的默认值 */
  defaultValue?: boolean;
}

export function useMediaQuery(
  query: string,
  options: MediaQueryOptions = {},
): Readonly<Ref<boolean>> {
  const matches = ref(options.defaultValue ?? false);
  let mql: MediaQueryList | null = null;
  let onChange: ((event: MediaQueryListEvent) => void) | null = null;

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    try {
      mql = window.matchMedia(query);
      matches.value = mql.matches;
      onChange = (event) => {
        matches.value = event.matches;
      };
      mql.addEventListener('change', onChange);
    } catch {
      /* 查询字符串非法等：保持默认值 */
    }
  });

  onBeforeUnmount(() => {
    if (mql && onChange) {
      try {
        mql.removeEventListener('change', onChange);
      } catch {
        /* 忽略移除失败 */
      }
    }
    mql = null;
    onChange = null;
  });

  return matches;
}
