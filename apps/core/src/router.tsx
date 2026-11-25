import { createRouter } from '@tanstack/react-router';
import { ErrorFallback } from '@/components/ErrorFallback';
import { NotFound } from '@/components/NotFound';
import { authStore } from '@/lib/auth';
import { queryClient } from '@/lib/query-client';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Available to every route's `beforeLoad` and `loader`.
  context: { queryClient, auth: authStore },
  defaultPreload: 'intent',
  // Loaders only warm the TanStack Query cache, which has its own freshness rules.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  defaultNotFoundComponent: NotFound,
  defaultErrorComponent: ErrorFallback,
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
