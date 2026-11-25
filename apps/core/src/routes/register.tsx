import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router';
import { AuthLayout } from '@/components/AuthLayout';
import { RegisterForm } from '@/features/auth/RegisterForm';

export const Route = createFileRoute('/register')({
  beforeLoad: async ({ context }) => {
    if (await context.auth.restore()) throw redirect({ to: '/' });
  },
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();

  return (
    <AuthLayout
      title="Create your account"
      description="New accounts start with view-only access; an administrator can grant more."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="rounded-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            Sign in
          </Link>
        </>
      }
    >
      <RegisterForm onRegistered={() => void navigate({ to: '/', replace: true })} />
    </AuthLayout>
  );
}
