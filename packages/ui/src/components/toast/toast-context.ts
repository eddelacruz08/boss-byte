import { createContext } from 'react';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** How long the toast stays up. Pass 0 to keep it until dismissed. */
  durationMs?: number;
}

export interface ToastApi {
  /** Shows a toast and returns its id, which `dismiss` accepts. */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);
