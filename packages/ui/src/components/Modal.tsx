import { Description, Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { focusRingClasses } from '../lib/control';
import { CloseIcon } from './icons';

type ModalSize = 'sm' | 'md' | 'lg';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Typically the action buttons; rendered right-aligned under the body. */
  footer?: ReactNode;
  size?: ModalSize;
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
};

/** An accessible dialog: focus is trapped, Escape and the backdrop close it. */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: ModalProps) {
  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence>
        {open && (
          <Dialog static open onClose={onClose} className="relative z-50">
            <motion.div
              aria-hidden="true"
              className="fixed inset-0 bg-slate-950/50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            />
            <div className="fixed inset-0 flex items-end justify-center overflow-y-auto p-4 sm:items-center">
              <motion.div
                className={cn('w-full', sizeClasses[size])}
                initial={{ opacity: 0, scale: 0.96, y: 8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 8 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <DialogPanel className="rounded-xl bg-white shadow-xl ring-1 ring-slate-950/5">
                  <div className="flex items-start justify-between gap-4 px-5 pt-5">
                    <div className="flex flex-col gap-1">
                      <DialogTitle className="text-base font-semibold text-slate-950">
                        {title}
                      </DialogTitle>
                      {description && (
                        <Description className="text-sm text-slate-600">{description}</Description>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className={cn(
                        '-mt-1 -mr-1 rounded-md p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800',
                        focusRingClasses,
                      )}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                  {children && <div className="px-5 py-4 text-sm text-slate-700">{children}</div>}
                  {footer && (
                    <div className="flex flex-wrap justify-end gap-2 rounded-b-xl border-t border-slate-200 bg-slate-50 px-5 py-3">
                      {footer}
                    </div>
                  )}
                  {!children && !footer && <div className="pb-5" />}
                </DialogPanel>
              </motion.div>
            </div>
          </Dialog>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
