import { Skeleton } from '@bossbyte/ui';
import type { ReactNode } from 'react';

export interface StatCardProps {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
}

/** One headline figure. Group several in a `<dl>` so they read as label and value pairs. */
export function StatCard({ label, value, hint, loading = false }: StatCardProps) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
        {loading ? <Skeleton className="my-1 h-6 w-24" /> : value}
      </dd>
      {hint && !loading && <dd className="text-sm text-slate-600">{hint}</dd>}
    </div>
  );
}
