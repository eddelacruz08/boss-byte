import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { focusRingClasses } from '../lib/control';
import { paginationRange } from '../lib/pagination-range';
import { ChevronLeftIcon, ChevronRightIcon } from './icons';

export interface PaginationProps {
  /** The current page, starting at 1. */
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const itemClasses =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-sm font-medium tabular-nums transition-colors';

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        itemClasses,
        'text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent',
        focusRingClasses,
      )}
    >
      {children}
    </button>
  );
}

export function Pagination({ page, totalPages, onPageChange, className }: PaginationProps) {
  const total = Math.max(1, totalPages);

  return (
    <nav aria-label="Pagination" className={className}>
      <ul className="flex flex-wrap items-center gap-1">
        <li>
          <StepButton
            label="Previous page"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </StepButton>
        </li>
        {paginationRange(page, total).map((item) =>
          typeof item === 'number' ? (
            <li key={item}>
              <button
                type="button"
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPageChange(item)}
                className={cn(
                  itemClasses,
                  focusRingClasses,
                  item === page ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100',
                )}
              >
                {item}
              </button>
            </li>
          ) : (
            <li key={item} aria-hidden="true" className={cn(itemClasses, 'text-slate-500')}>
              …
            </li>
          ),
        )}
        <li>
          <StepButton
            label="Next page"
            disabled={page >= total}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </StepButton>
        </li>
      </ul>
    </nav>
  );
}
