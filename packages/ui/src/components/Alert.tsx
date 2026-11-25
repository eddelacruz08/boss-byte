import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { focusRingClasses } from '../lib/control';
import { CloseIcon, DangerIcon, InfoIcon, SuccessIcon, WarningIcon } from './icons';

type AlertTone = 'info' | 'success' | 'warning' | 'danger';

export interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  /** Shows a dismiss button when provided. */
  onDismiss?: () => void;
  className?: string;
}

const toneClasses: Record<AlertTone, string> = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warning: 'border-amber-300 bg-amber-50 text-amber-950',
  danger: 'border-red-200 bg-red-50 text-red-900',
};

const toneIcons = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  danger: DangerIcon,
} satisfies Record<AlertTone, unknown>;

export function Alert({ tone = 'info', title, children, onDismiss, className }: AlertProps) {
  const ToneIcon = toneIcons[tone];
  // Problems interrupt the screen reader; everything else waits its turn.
  const role = tone === 'danger' || tone === 'warning' ? 'alert' : 'status';

  return (
    <div
      role={role}
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3',
        toneClasses[tone],
        className,
      )}
    >
      <ToneIcon className="mt-0.5" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className={cn('-mt-0.5 -mr-1 rounded-md p-1 hover:bg-slate-950/5', focusRingClasses)}
        >
          <CloseIcon className="size-4" />
        </button>
      )}
    </div>
  );
}
