import { Description, Field, Checkbox as HeadlessCheckbox, Label } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { CheckIcon } from './icons';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: CheckboxProps) {
  return (
    <Field disabled={disabled} className={cn('flex items-start gap-3', className)}>
      <HeadlessCheckbox
        checked={checked}
        onChange={onChange}
        className={cn(
          'group mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border border-slate-400 bg-white',
          'transition-colors data-checked:border-brand-600 data-checked:bg-brand-600',
          'data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-brand-600',
          'data-disabled:cursor-not-allowed data-disabled:opacity-60',
        )}
      >
        <CheckIcon
          strokeWidth={3}
          className="hidden size-3.5 text-white group-data-checked:block"
        />
      </HeadlessCheckbox>
      <div className="flex flex-col gap-0.5">
        <Label className="text-sm font-medium text-slate-800 data-disabled:text-slate-500">
          {label}
        </Label>
        {description && <Description className="text-sm text-slate-600">{description}</Description>}
      </div>
    </Field>
  );
}
