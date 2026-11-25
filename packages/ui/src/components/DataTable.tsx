import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Skeleton } from './Skeleton';

export interface DataTableColumn<T> {
  /** Unique within the table; used as the React key. */
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Shows skeleton rows instead of `rows`. */
  loading?: boolean;
  emptyMessage?: string;
  /** Describes the table to screen readers; not shown. */
  caption?: string;
  className?: string;
}

const alignClasses = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const;

const SKELETON_ROWS = 5;

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyMessage = 'Nothing to show yet.',
  caption,
  className,
}: DataTableProps<T>) {
  return (
    // `relative` keeps visually hidden (absolutely positioned) labels inside the
    // scroll area; without it they widen the page when the table overflows.
    <div
      className={cn(
        'relative overflow-x-auto rounded-xl border border-slate-200 bg-white',
        className,
      )}
    >
      <table aria-busy={loading || undefined} className="min-w-full text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead className="border-b border-slate-200 bg-slate-50">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={cn(
                  'px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap text-slate-700 uppercase',
                  alignClasses[column.align ?? 'left'],
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {loading &&
            Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-3.5">
                    <Skeleton />
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-10 text-center text-slate-600">
                {emptyMessage}
              </td>
            </tr>
          )}

          {!loading &&
            rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-slate-50">
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-4 py-3 text-slate-800',
                      alignClasses[column.align ?? 'left'],
                      column.className,
                    )}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
