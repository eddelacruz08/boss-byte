import { cn } from '@bossbyte/ui';
import type { ComponentProps } from 'react';

/**
 * A styled native file input. Pair it with `FormField` for the label, hint
 * and error, and point `aria-describedby` at them.
 */
export function FileInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return (
    <input
      type="file"
      className={cn(
        'block w-full rounded-lg border border-slate-300 bg-white text-sm text-slate-700 shadow-xs',
        'file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-2.5 file:text-sm file:font-medium file:text-slate-800',
        'hover:file:bg-slate-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        'aria-invalid:border-red-500',
        className,
      )}
      {...props}
    />
  );
}
