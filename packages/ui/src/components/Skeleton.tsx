import { cn } from '../lib/cn';

export interface SkeletonProps {
  /** Size it with utilities, e.g. `h-4 w-32`. */
  className?: string;
}

/** A pulsing placeholder for content that is still loading. */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('h-4 w-full animate-pulse rounded-md bg-slate-200', className)}
    />
  );
}
