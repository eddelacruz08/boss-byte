import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface CardProps {
  title?: ReactNode;
  /** Heading level of the title. Defaults to 2, the level below a page's `<h1>`. */
  headingLevel?: 2 | 3 | 4;
  description?: ReactNode;
  /** Rendered at the right of the header, e.g. a button or menu. */
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Set to false when the content brings its own padding, such as a table. */
  padded?: boolean;
}

export function Card({
  title,
  headingLevel = 2,
  description,
  actions,
  children,
  className,
  padded = true,
}: CardProps) {
  const hasHeader = Boolean(title || description || actions);
  const Heading = `h${headingLevel}` as const;

  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white shadow-xs', className)}>
      {hasHeader && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <Heading className="text-base font-semibold text-slate-950">{title}</Heading>}
            {description && <p className="text-sm text-slate-600">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(padded && 'p-5')}>{children}</div>
    </section>
  );
}
