import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { focusRingClasses } from '../lib/control';
import { ChevronDownIcon } from './icons';

export interface DropdownMenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

export interface DropdownMenuProps {
  /** Content of the trigger button. */
  label: ReactNode;
  items: DropdownMenuItem[];
  align?: 'start' | 'end';
  className?: string;
}

export function DropdownMenu({ label, items, align = 'end', className }: DropdownMenuProps) {
  return (
    <Menu>
      <MenuButton
        className={cn(
          'inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium',
          'text-slate-800 shadow-xs transition-colors hover:bg-slate-50 data-open:bg-slate-100',
          focusRingClasses,
          className,
        )}
      >
        {label}
        <ChevronDownIcon className="size-4 text-slate-500" />
      </MenuButton>
      <MenuItems
        anchor={{ to: align === 'end' ? 'bottom end' : 'bottom start', gap: 4 }}
        className="z-50 min-w-44 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-lg focus:outline-none"
      >
        {items.map((item) => (
          <MenuItem key={item.label} disabled={item.disabled}>
            <button
              type="button"
              onClick={item.onSelect}
              className={cn(
                'flex w-full items-center rounded-md px-2.5 py-2 text-left',
                'data-disabled:cursor-not-allowed data-disabled:text-slate-400',
                item.danger
                  ? 'text-red-700 data-focus:bg-red-50'
                  : 'text-slate-800 data-focus:bg-brand-50 data-focus:text-brand-900',
              )}
            >
              {item.label}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  );
}
