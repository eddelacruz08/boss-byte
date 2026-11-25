import { ToastProvider } from '@bossbyte/ui';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import type { RouterContext } from '@/lib/router-context';

// The condition is a build-time constant, so production builds drop the devtools chunk entirely.
const Devtools = import.meta.env.DEV ? lazy(() => import('@/components/Devtools')) : null;

export const Route = createRootRouteWithContext<RouterContext>()({ component: RootLayout });

function RootLayout() {
  return (
    <ToastProvider>
      <Outlet />
      {Devtools && (
        <Suspense fallback={null}>
          <Devtools />
        </Suspense>
      )}
    </ToastProvider>
  );
}
