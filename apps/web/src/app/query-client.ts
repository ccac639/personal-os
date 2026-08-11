import { QueryClient } from '@tanstack/vue-query';

/** 全局 QueryClient（TanStack Vue Query） */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});
