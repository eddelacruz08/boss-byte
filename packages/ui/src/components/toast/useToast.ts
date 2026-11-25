import { useContext } from 'react';
import { ToastContext, type ToastApi } from './toast-context';

/** Shows and dismisses toasts. Must be called under a `<ToastProvider>`. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used within a <ToastProvider>');
  return api;
}
