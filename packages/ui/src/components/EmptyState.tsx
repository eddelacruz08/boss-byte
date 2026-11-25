import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  /** Usually a button that creates the first item. */
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, action, icon, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 px-6 py-12 text-center',
        className,
      )}
    >
      {icon && (
        <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="text-base font-semibold text-balance text-slate-950">{title}</p>
        {description && <p className="text-sm text-pretty text-slate-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}
