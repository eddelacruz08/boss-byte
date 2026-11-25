import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { controlClasses, controlInvalidClasses } from '../lib/control';

export interface InputProps extends ComponentProps<'input'> {
  /** Styles the control as errored and sets `aria-invalid`. */
  invalid?: boolean;
}

export function Input({ invalid = false, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, invalid && controlInvalidClasses, className)}
      {...props}
    />
  );
}
