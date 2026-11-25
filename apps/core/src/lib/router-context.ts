import type { QueryClient } from '@tanstack/react-query';
import type { AuthStore } from './auth';

/** What every route's `beforeLoad` and `loader` receive as `context`. */
export interface RouterContext {
  queryClient: QueryClient;
  auth: AuthStore;
}
