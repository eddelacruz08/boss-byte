import { createFileRoute, Outlet, redirect, useRouter } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { AppShell } from '@/components/AppShell';
import { useAuth } from '@/lib/auth';

/** Sends the visitor back to where they were once they have signed in again. */
function loginSearch(href: string) {
  return href === '/' ? {} : { redirect: href };
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!(await context.auth.restore())) {
      throw redirect({ to: '/login', search: loginSearch(location.href) });
    }
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const router = useRouter();
  const { status, user, signOut } = useAuth();
  const signedOutOnPurpose = useRef(false);

  // `beforeLoad` only runs on navigation. This covers a session that ends while
  // a page is open: signing out, or a refresh token that has expired.
  useEffect(() => {
    if (status !== 'unauthenticated') return;
    const search = signedOutOnPurpose.current ? {} : loginSearch(router.state.location.href);
    void router.navigate({ to: '/login', search, replace: true });
  }, [status, router]);

  if (!user) return null;

  return (
    <AppShell
      user={user}
      onSignOut={() => {
        signedOutOnPurpose.current = true;
        void signOut();
      }}
    >
      <Outlet />
    </AppShell>
  );
}
