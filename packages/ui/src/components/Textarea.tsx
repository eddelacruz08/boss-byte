import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';
import { controlClasses, controlInvalidClasses } from '../lib/control';

export interface TextareaProps extends ComponentProps<'textarea'> {
  /** Styles the control as errored and sets `aria-invalid`. */
  invalid?: boolean;
}

export function Textarea({ invalid = false, rows = 4, className, ...props }: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClasses, 'min-h-20', invalid && controlInvalidClasses, className)}
      {...props}
    />
  );
}
