import {
  Description,
  Field,
  Label,
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { controlClasses, controlInvalidClasses } from '../lib/control';
import { CheckIcon, ChevronUpDownIcon } from './icons';

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string | number> {
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  label?: ReactNode;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
  /** Names the control when there is no visible `label`. */
  'aria-label'?: string;
}

export function Select<T extends string | number>({
  options,
  value,
  onChange,
  label,
  placeholder = 'Select…',
  error,
  disabled = false,
  className,
  'aria-label': ariaLabel,
}: SelectProps<T>) {
  const selected = options.find((option) => option.value === value);

  return (
    <Field disabled={disabled} className={cn('flex flex-col gap-1.5', className)}>
      {label && <Label className="text-sm font-medium text-slate-800">{label}</Label>}
      <Listbox
        value={value}
        onChange={(next: T | null) => {
          if (next !== null) onChange(next);
        }}
        invalid={Boolean(error)}
      >
        <ListboxButton
          aria-label={ariaLabel}
          className={cn(
            controlClasses,
            'flex items-center justify-between gap-2 text-left',
            'data-disabled:cursor-not-allowed data-disabled:bg-slate-100 data-disabled:text-slate-500',
            error && controlInvalidClasses,
          )}
        >
          <span className={cn('truncate', !selected && 'text-slate-500')}>
            {selected?.label ?? placeholder}
          </span>
          <ChevronUpDownIcon className="size-4 text-slate-500" />
        </ListboxButton>
        <ListboxOptions
          anchor={{ to: 'bottom start', gap: 4 }}
          className={cn(
            'z-50 max-h-60 w-(--button-width) overflow-auto rounded-lg border border-slate-200 bg-white p-1',
            'text-sm shadow-lg focus:outline-none',
          )}
        >
          {options.map((option) => (
            <ListboxOption
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              className={cn(
                'group flex cursor-default items-center justify-between gap-2 rounded-md px-2.5 py-2 text-slate-800',
                'data-focus:bg-brand-50 data-focus:text-brand-900',
                'data-selected:font-medium data-disabled:cursor-not-allowed data-disabled:text-slate-400',
              )}
            >
              <span className="truncate">{option.label}</span>
              <CheckIcon className="invisible size-4 text-brand-700 group-data-selected:visible" />
            </ListboxOption>
          ))}
        </ListboxOptions>
      </Listbox>
      {error && (
        <Description role="alert" className="text-sm text-red-700">
          {error}
        </Description>
      )}
    </Field>
  );
}
