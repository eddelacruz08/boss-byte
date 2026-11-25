import type { ReactNode } from 'react';

export interface PageHeaderProps {
  /** Shown as the page heading and in the browser tab. */
  title: string;
  description?: ReactNode;
  /** Page-level actions, shown to the right of the heading. */
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      {/* React 19 moves <title> into <head> wherever it is rendered. */}
      <title>{`${title} · BossByte`}</title>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
        {description && (
          <p className="max-w-2xl text-sm text-pretty text-slate-600">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
