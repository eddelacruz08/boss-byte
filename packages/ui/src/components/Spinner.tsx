import { cn } from '../lib/cn';
import { SpinnerIcon } from './icons';

type SpinnerSize = 'sm' | 'md' | 'lg';

export interface SpinnerProps {
  size?: SpinnerSize;
  /** Announced to screen readers; not shown. */
  label?: string;
  className?: string;
}

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-10',
};

export function Spinner({ size = 'md', label = 'Loading', className }: SpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex text-brand-600', className)}>
      <SpinnerIcon className={sizeClasses[size]} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
