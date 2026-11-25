import type { ReactNode } from 'react';
import { LogoMark } from './icons';

export interface AuthLayoutProps {
  /** Shown as the page heading and in the browser tab. */
  title: string;
  description: string;
  children: ReactNode;
  /** Shown under the card, e.g. a link to the other form. */
  footer?: ReactNode;
}

/** The centred card the signed-out pages share. */
export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <title>{`${title} · BossByte`}</title>
      <p className="flex items-center justify-center gap-2 text-lg font-semibold text-slate-950">
        <LogoMark />
        BossByte
      </p>
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
      {footer && <p className="text-center text-sm text-slate-600">{footer}</p>}
    </main>
  );
}
