import { createFileRoute, Link, redirect, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthLayout } from '@/components/AuthLayout';
import { LoginForm } from '@/features/auth/LoginForm';
import { safeRedirectPath } from '@/lib/redirect';

const loginSearchSchema = z.object({
  /** Where to go after signing in. Checked with `safeRedirectPath` before use. */
  redirect: z.string().optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: loginSearchSchema,
  beforeLoad: async ({ context, search }) => {
    if (await context.auth.restore()) throw redirect({ href: safeRedirectPath(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const search = Route.useSearch();

  return (
    <AuthLayout
      title="Sign in"
      description="Use your BossByte account to continue."
      footer={
        <>
          No account yet?{' '}
          <Link
            to="/register"
            className="rounded-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Create one
          </Link>
        </>
      }
    >
      <LoginForm
        onSignedIn={() =>
          void router.navigate({ href: safeRedirectPath(search.redirect), replace: true })
        }
      />
    </AuthLayout>
  );
}
