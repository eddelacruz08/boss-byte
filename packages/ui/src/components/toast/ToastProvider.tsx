import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { focusRingClasses } from '../../lib/control';
import { CloseIcon, DangerIcon, InfoIcon, SuccessIcon, WarningIcon } from '../icons';
import { ToastContext, type ToastApi, type ToastOptions, type ToastTone } from './toast-context';

export interface ToastProviderProps {
  children: ReactNode;
  /** Used when a toast does not set its own `durationMs`. */
  defaultDurationMs?: number;
}

interface ActiveToast extends ToastOptions {
  id: string;
  tone: ToastTone;
}

const toneClasses: Record<ToastTone, string> = {
  info: 'text-sky-700',
  success: 'text-emerald-700',
  warning: 'text-amber-700',
  danger: 'text-red-700',
};

const toneIcons = {
  info: InfoIcon,
  success: SuccessIcon,
  warning: WarningIcon,
  danger: DangerIcon,
} satisfies Record<ToastTone, unknown>;

let nextId = 0;

export function ToastProvider({ children, defaultDurationMs = 5000 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ActiveToast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      nextId += 1;
      const id = `toast-${nextId}`;
      setToasts((current) => [...current, { ...options, id, tone: options.tone ?? 'info' }]);

      const duration = options.durationMs ?? defaultDurationMs;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [defaultDurationMs, dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((timer) => clearTimeout(timer));
  }, []);

  const api = useMemo<ToastApi>(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      <MotionConfig reducedMotion="user">
        <div
          role="region"
          aria-label="Notifications"
          aria-live="polite"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-60 flex flex-col items-center gap-2 p-4 sm:items-end"
        >
          <AnimatePresence initial={false}>
            {toasts.map((item) => {
              const ToneIcon = toneIcons[item.tone];
              return (
                <motion.div
                  key={item.id}
                  layout
                  role={item.tone === 'danger' ? 'alert' : 'status'}
                  initial={{ opacity: 0, y: 16, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                  className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
                >
                  <ToneIcon className={cn('mt-0.5', toneClasses[item.tone])} />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-sm">
                    <p className="font-semibold text-slate-950">{item.title}</p>
                    {item.description && <p className="text-slate-600">{item.description}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismiss(item.id)}
                    aria-label="Dismiss notification"
                    className={cn(
                      '-mt-1 -mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                      focusRingClasses,
                    )}
                  >
                    <CloseIcon className="size-4" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </MotionConfig>
    </ToastContext>
  );
}
