import { Description, Field, Switch as HeadlessSwitch, Label } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <Field disabled={disabled} className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex flex-col gap-0.5">
        <Label className="text-sm font-medium text-slate-800 data-disabled:text-slate-500">
          {label}
        </Label>
        {description && <Description className="text-sm text-slate-600">{description}</Description>}
      </div>
      <HeadlessSwitch
        checked={checked}
        onChange={onChange}
        className={cn(
          'group inline-flex h-6 w-11 shrink-0 items-center rounded-full bg-slate-400 transition-colors',
          'data-checked:bg-brand-600',
          'data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-brand-600',
          'data-disabled:cursor-not-allowed data-disabled:opacity-60',
        )}
      >
        <span className="size-4 translate-x-1 rounded-full bg-white shadow-sm transition-transform group-data-checked:translate-x-6" />
      </HeadlessSwitch>
    </Field>
  );
}
