import { QueryClient } from '@tanstack/react-query';
import { isApiError } from './api';

const MAX_RETRIES = 2;

/**
 * App-wide TanStack Query defaults.
 *
 * Only failures that might go away are retried: a 4xx response is the API's
 * final answer, so repeating the request would just delay the error message.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (isApiError(error) && error.status >= 400 && error.status < 500) return false;
          return failureCount < MAX_RETRIES;
        },
      },
      mutations: { retry: false },
    },
  });
}

export const queryClient = createQueryClient();
