import { Link } from '@tanstack/react-router';

export function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-lg flex-col items-center justify-center gap-3 p-6 text-center">
      <title>Page not found · BossByte</title>
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Page not found</h1>
      <p className="text-sm text-pretty text-slate-600">
        The address may be mistyped, or the page may have moved.
      </p>
      <Link
        to="/"
        className="rounded-md text-sm font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        Back to the dashboard
      </Link>
    </div>
  );
}
